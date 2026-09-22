// Tests for src/lib/incremental.ts — specifically the "manual reindex" path,
// which reuses a caller-provided snapshot record instead of always creating
// a new one, and must resolve that record even when nothing changed.
import { createIncrementalSnapshot, detectChangedFiles } from "@/lib/incremental";
import { prisma } from "@/lib/prisma";
import { fetchRepoFiles } from "@/lib/github";
import { chunkFiles } from "@/lib/chunker";
import { computeImpact, findAffectedWikiPages } from "@/lib/dependencies";
import { hashContent } from "@/lib/symbolExtractor";
import { recalculateWikiFreshness } from "@/lib/wiki/freshness";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repositoryFile: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    repositorySymbol: {
      createMany: jest.fn(),
    },
    repositorySnapshot: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    wikiPage: {
      updateMany: jest.fn(),
    },
    changeReport: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/lib/chunker", () => ({
  chunkFiles: jest.fn(),
}));

jest.mock("@/lib/dependencies", () => ({
  computeImpact: jest.fn(),
  findAffectedWikiPages: jest.fn(),
}));

jest.mock("@/lib/inngest/client", () => ({
  inngest: { send: jest.fn() },
}));

jest.mock("@/lib/wiki/freshness", () => ({
  recalculateWikiFreshness: jest.fn().mockResolvedValue([]),
}));

function mockChunkedFile(path: string) {
  return {
    path,
    language: "typescript",
    contentHash: `hash-${path}`,
    symbols: [],
    imports: [],
    chunks: [{ pageContent: "chunk", metadata: { path, repo: "test/repo" } }],
  };
}

describe("incremental reindex", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (computeImpact as jest.Mock).mockResolvedValue({ impactedFiles: ["src/a.ts"], importersByFile: {} });
    (findAffectedWikiPages as jest.Mock).mockResolvedValue([]);
  });

  describe("detectChangedFiles", () => {
    test("flags modified, added, and removed files against the base snapshot", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", contentHash: hashContent("old content") },
        { path: "src/removed.ts", contentHash: hashContent("gone") },
      ]);
      (fetchRepoFiles as jest.Mock).mockResolvedValue({
        files: [
          { path: "src/a.ts", content: "new content" }, // modified
          { path: "src/new.ts", content: "brand new" }, // added
        ],
        defaultBranch: "main",
        commitSha: "head-sha",
      });

      const changed = await detectChangedFiles("base-snapshot", "token", "owner", "repo");

      expect(changed).toContainEqual({ path: "src/a.ts", status: "modified", content: "new content" });
      expect(changed).toContainEqual({ path: "src/new.ts", status: "added", content: "brand new" });
      expect(changed).toContainEqual({ path: "src/removed.ts", status: "removed" });
      expect(changed).toHaveLength(3);
    });

    test("reports no changes when content hashes match", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", contentHash: hashContent("same content") },
      ]);
      (fetchRepoFiles as jest.Mock).mockResolvedValue({
        files: [{ path: "src/a.ts", content: "same content" }],
        defaultBranch: "main",
        commitSha: "head-sha",
      });

      const changed = await detectChangedFiles("base-snapshot", "token", "owner", "repo");
      expect(changed).toHaveLength(0);
    });
  });

  describe("createIncrementalSnapshot", () => {
    test("reuses an existing snapshot record instead of creating a new one", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", contentHash: hashContent("old content") },
      ]);
      (fetchRepoFiles as jest.Mock).mockResolvedValue({
        files: [{ path: "src/a.ts", content: "new content" }],
        defaultBranch: "main",
        commitSha: "head-sha",
      });
      (chunkFiles as jest.Mock).mockResolvedValue([mockChunkedFile("src/a.ts")]);
      (prisma.repositorySnapshot.update as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve({ id: where.id })
      );
      (prisma.repositoryFile.create as jest.Mock).mockResolvedValue({ id: "file-1" });

      const result = await createIncrementalSnapshot(
        "repo-1",
        "owner/repo",
        "token",
        "owner",
        "repo",
        "base-snapshot",
        "base-sha",
        "head-sha",
        { existingSnapshotId: "snap-pending" }
      );

      // Never creates a second snapshot row — the pre-created one is reused.
      expect(prisma.repositorySnapshot.create).not.toHaveBeenCalled();

      const updateCalls = (prisma.repositorySnapshot.update as jest.Mock).mock.calls;
      expect(updateCalls.every(([arg]) => arg.where.id === "snap-pending")).toBe(true);

      // First update flips it to RUNNING, final update marks it COMPLETED.
      expect(updateCalls[0][0].data.status).toBe("RUNNING");
      const finalUpdate = updateCalls[updateCalls.length - 1][0];
      expect(finalUpdate.data.status).toBe("COMPLETED");

      expect(result.newSnapshotId).toBe("snap-pending");
      expect(result.changed).toHaveLength(1);
      // Freshness recalculation runs for the whole repo, not just changed pages.
      expect(recalculateWikiFreshness).toHaveBeenCalledWith("repo-1");
    });

    test("creates a new snapshot when no existingSnapshotId is given (webhook path)", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", contentHash: hashContent("old content") },
      ]);
      (fetchRepoFiles as jest.Mock).mockResolvedValue({
        files: [{ path: "src/a.ts", content: "new content" }],
        defaultBranch: "main",
        commitSha: "head-sha",
      });
      (chunkFiles as jest.Mock).mockResolvedValue([mockChunkedFile("src/a.ts")]);
      (prisma.repositorySnapshot.create as jest.Mock).mockResolvedValue({ id: "snap-new" });
      (prisma.repositoryFile.create as jest.Mock).mockResolvedValue({ id: "file-1" });

      const result = await createIncrementalSnapshot(
        "repo-1",
        "owner/repo",
        "token",
        "owner",
        "repo",
        "base-snapshot",
        "base-sha",
        "head-sha"
      );

      expect(prisma.repositorySnapshot.create).toHaveBeenCalledTimes(1);
      expect(result.newSnapshotId).toBe("snap-new");
    });

    test("resolves a pre-created snapshot to COMPLETED when nothing changed, instead of leaving it dangling", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", contentHash: hashContent("same content") },
      ]);
      (fetchRepoFiles as jest.Mock).mockResolvedValue({
        files: [{ path: "src/a.ts", content: "same content" }],
        defaultBranch: "main",
        commitSha: "head-sha",
      });
      (prisma.repositorySnapshot.findUnique as jest.Mock).mockResolvedValue({
        branch: "main",
        commitSha: "base-sha",
        fileCount: 5,
        chunkCount: 50,
      });

      const result = await createIncrementalSnapshot(
        "repo-1",
        "owner/repo",
        "token",
        "owner",
        "repo",
        "base-snapshot",
        "base-sha",
        "head-sha",
        { existingSnapshotId: "snap-pending" }
      );

      expect(result).toEqual({ changed: [], impactedFiles: [], affectedWikiPages: [], report: null });
      expect(chunkFiles).not.toHaveBeenCalled();
      expect(prisma.repositorySnapshot.create).not.toHaveBeenCalled();
      expect(prisma.repositorySnapshot.update).toHaveBeenCalledWith({
        where: { id: "snap-pending" },
        data: {
          status: "COMPLETED",
          branch: "main",
          commitSha: "head-sha",
          fileCount: 5,
          chunkCount: 50,
          completedAt: expect.any(Date),
        },
      });
    });

    test("no changes and no existingSnapshotId: touches no snapshot record (webhook no-op path)", async () => {
      (prisma.repositoryFile.findMany as jest.Mock).mockResolvedValue([
        { path: "src/a.ts", contentHash: hashContent("same content") },
      ]);
      (fetchRepoFiles as jest.Mock).mockResolvedValue({
        files: [{ path: "src/a.ts", content: "same content" }],
        defaultBranch: "main",
        commitSha: "head-sha",
      });

      const result = await createIncrementalSnapshot(
        "repo-1",
        "owner/repo",
        "token",
        "owner",
        "repo",
        "base-snapshot",
        "base-sha",
        "head-sha"
      );

      expect(result).toEqual({ changed: [], impactedFiles: [], affectedWikiPages: [], report: null });
      expect(prisma.repositorySnapshot.create).not.toHaveBeenCalled();
      expect(prisma.repositorySnapshot.update).not.toHaveBeenCalled();
    });
  });
});
