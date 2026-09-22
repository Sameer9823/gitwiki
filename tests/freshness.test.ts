// Tests for src/lib/wiki/freshness.ts — freshness decay based on how many
// completed snapshots a wiki page has fallen behind the repo's current HEAD.
import { recalculateWikiFreshness, DECAY_PER_SNAPSHOT, MIN_FRESHNESS } from "@/lib/wiki/freshness";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repositorySnapshot: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    wikiPage: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe("recalculateWikiFreshness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns [] when the repo has no completed snapshot yet", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await recalculateWikiFreshness("repo-1");

    expect(result).toEqual([]);
    expect(prisma.wikiPage.findMany).not.toHaveBeenCalled();
  });

  test("returns [] when the repo has no wiki pages", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ commitSha: "head-sha" });
    (prisma.wikiPage.findMany as jest.Mock).mockResolvedValue([]);

    const result = await recalculateWikiFreshness("repo-1");

    expect(result).toEqual([]);
  });

  test("marks a page anchored to the latest commit as fully fresh, updating only if it wasn't already 1.0", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ commitSha: "head-sha" });
    (prisma.wikiPage.findMany as jest.Mock).mockResolvedValue([
      { id: "page-1", slug: "overview", freshness: 1.0, sourceCommit: "head-sha" },
      { id: "page-2", slug: "architecture", freshness: 0.7, sourceCommit: "head-sha" },
    ]);

    const result = await recalculateWikiFreshness("repo-1");

    expect(result).toEqual([
      { slug: "overview", previousFreshness: 1.0, newFreshness: 1.0, snapshotsBehind: 0 },
      { slug: "architecture", previousFreshness: 0.7, newFreshness: 1.0, snapshotsBehind: 0 },
    ]);
    // Already-fresh page shouldn't trigger a write.
    expect(prisma.wikiPage.update).toHaveBeenCalledTimes(1);
    expect(prisma.wikiPage.update).toHaveBeenCalledWith({ where: { id: "page-2" }, data: { freshness: 1.0 } });
  });

  test("decays freshness proportionally to how many snapshots a page has drifted behind", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ commitSha: "head-sha" });
    (prisma.wikiPage.findMany as jest.Mock).mockResolvedValue([
      { id: "page-1", slug: "api-reference", freshness: 1.0, sourceCommit: "old-sha" },
    ]);
    (prisma.repositorySnapshot.findMany as jest.Mock).mockResolvedValue([
      { commitSha: "old-sha", completedAt: new Date("2026-01-01") },
    ]);
    (prisma.repositorySnapshot.count as jest.Mock).mockResolvedValue(3);

    const result = await recalculateWikiFreshness("repo-1");

    const expectedFreshness = 1 - 3 * DECAY_PER_SNAPSHOT;
    expect(result).toEqual([
      { slug: "api-reference", previousFreshness: 1.0, newFreshness: expectedFreshness, snapshotsBehind: 3 },
    ]);
    expect(prisma.wikiPage.update).toHaveBeenCalledWith({ where: { id: "page-1" }, data: { freshness: expectedFreshness } });
  });

  test("floors decayed freshness at MIN_FRESHNESS instead of going negative", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ commitSha: "head-sha" });
    (prisma.wikiPage.findMany as jest.Mock).mockResolvedValue([
      { id: "page-1", slug: "database", freshness: 1.0, sourceCommit: "ancient-sha" },
    ]);
    (prisma.repositorySnapshot.findMany as jest.Mock).mockResolvedValue([
      { commitSha: "ancient-sha", completedAt: new Date("2025-01-01") },
    ]);
    (prisma.repositorySnapshot.count as jest.Mock).mockResolvedValue(20); // way more than 1/DECAY_PER_SNAPSHOT

    const result = await recalculateWikiFreshness("repo-1");

    expect(result[0].newFreshness).toBe(MIN_FRESHNESS);
  });

  test("leaves freshness untouched when a page's sourceCommit has no matching snapshot record", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ commitSha: "head-sha" });
    (prisma.wikiPage.findMany as jest.Mock).mockResolvedValue([
      { id: "page-1", slug: "getting-started", freshness: 0.9, sourceCommit: "pruned-sha" },
    ]);
    // No snapshot record matches "pruned-sha" — history was pruned or predates tracking.
    (prisma.repositorySnapshot.findMany as jest.Mock).mockResolvedValue([]);

    const result = await recalculateWikiFreshness("repo-1");

    expect(result).toEqual([
      { slug: "getting-started", previousFreshness: 0.9, newFreshness: 0.9, snapshotsBehind: -1 },
    ]);
    expect(prisma.wikiPage.update).not.toHaveBeenCalled();
    expect(prisma.repositorySnapshot.count).not.toHaveBeenCalled();
  });

  test("batches the 'behind' count query per distinct sourceCommit, not per page", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ commitSha: "head-sha" });
    (prisma.wikiPage.findMany as jest.Mock).mockResolvedValue([
      { id: "page-1", slug: "overview", freshness: 1.0, sourceCommit: "old-sha" },
      { id: "page-2", slug: "architecture", freshness: 1.0, sourceCommit: "old-sha" },
      { id: "page-3", slug: "api-reference", freshness: 1.0, sourceCommit: "old-sha" },
    ]);
    (prisma.repositorySnapshot.findMany as jest.Mock).mockResolvedValue([
      { commitSha: "old-sha", completedAt: new Date("2026-01-01") },
    ]);
    (prisma.repositorySnapshot.count as jest.Mock).mockResolvedValue(1);

    const result = await recalculateWikiFreshness("repo-1");

    expect(result).toHaveLength(3);
    // Three pages share the same sourceCommit — only one count() query needed.
    expect(prisma.repositorySnapshot.count).toHaveBeenCalledTimes(1);
  });
});
