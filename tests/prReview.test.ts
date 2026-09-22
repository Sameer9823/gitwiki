// Tests for src/lib/prReview.ts. Octokit is mocked directly (this module
// isn't covered by the global @/lib/github mock, since it talks to GitHub's
// pulls/issues endpoints, not the tree/blob endpoints github.ts wraps).
jest.mock("@octokit/rest", () => ({ Octokit: jest.fn() }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repositorySnapshot: {
      findFirst: jest.fn(),
    },
    changeReport: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/dependencies", () => ({
  computeImpact: jest.fn(),
  findAffectedWikiPages: jest.fn(),
}));

import { Octokit } from "@octokit/rest";
import { generatePrReview } from "@/lib/prReview";
import { prisma } from "@/lib/prisma";
import { computeImpact, findAffectedWikiPages } from "@/lib/dependencies";

function mockOctokit({
  files,
  createCommentImpl,
}: {
  files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
  createCommentImpl?: jest.Mock;
}) {
  const listFiles = jest.fn().mockResolvedValue({ data: files });
  const createComment =
    createCommentImpl ?? jest.fn().mockResolvedValue({ data: { html_url: "https://github.com/o/r/pull/1#comment" } });
  (Octokit as unknown as jest.Mock).mockImplementation(() => ({
    rest: {
      pulls: { listFiles },
      issues: { createComment },
    },
  }));
  return { listFiles, createComment };
}

const baseParams = {
  repositoryId: "repo-1",
  repoKey: "owner/repo",
  owner: "owner",
  repo: "repo",
  githubToken: "token",
  prNumber: 42,
  prTitle: "Add feature X",
  prUrl: "https://github.com/owner/repo/pull/42",
  baseSha: "base-sha",
  headSha: "head-sha",
};

describe("generatePrReview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.changeReport.create as jest.Mock).mockResolvedValue({ id: "report-1" });
    (computeImpact as jest.Mock).mockResolvedValue({ impactedFiles: [], importersByFile: {} });
    (findAffectedWikiPages as jest.Mock).mockResolvedValue([]);
  });

  test("returns posted:false with no files changed", async () => {
    mockOctokit({ files: [] });

    const result = await generatePrReview(baseParams);

    expect(result).toEqual({ posted: false, reason: "no-files-changed", filesReviewed: 0, filesTruncated: false });
    expect(prisma.changeReport.create).not.toHaveBeenCalled();
  });

  test("happy path: fetches diff, runs impact analysis, posts comment, persists ChangeReport", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ id: "snap-1" });
    (computeImpact as jest.Mock).mockResolvedValue({
      impactedFiles: ["src/a.ts", "src/consumer.ts"],
      importersByFile: { "src/a.ts": ["src/consumer.ts"] },
    });
    (findAffectedWikiPages as jest.Mock).mockResolvedValue(["architecture"]);
    const { listFiles, createComment } = mockOctokit({
      files: [{ filename: "src/a.ts", status: "modified", additions: 5, deletions: 1, patch: "@@ -1,3 +1,7 @@\n+added line" }],
    });

    const result = await generatePrReview(baseParams);

    expect(listFiles).toHaveBeenCalledWith({ owner: "owner", repo: "repo", pull_number: 42, per_page: 100 });
    expect(computeImpact).toHaveBeenCalledWith("snap-1", ["src/a.ts"]);
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "owner", repo: "repo", issue_number: 42, body: expect.stringContaining("Test response") })
    );
    expect(prisma.changeReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        repositoryId: "repo-1",
        baseSha: "base-sha",
        headSha: "head-sha",
        summary: "Test response",
        affected: expect.objectContaining({
          files: ["src/a.ts"],
          wikiPages: ["architecture"],
          importers: { "src/a.ts": ["src/consumer.ts"] },
          prNumber: 42,
          prUrl: baseParams.prUrl,
        }),
      }),
    });
    expect(result).toEqual({
      posted: true,
      changeReportId: "report-1",
      filesReviewed: 1,
      filesTruncated: false,
      commentUrl: "https://github.com/o/r/pull/1#comment",
    });
  });

  test("skips impact analysis when the repo has no indexed snapshot yet", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    mockOctokit({ files: [{ filename: "src/a.ts", status: "added", additions: 10, deletions: 0, patch: "+new file" }] });

    const result = await generatePrReview(baseParams);

    expect(computeImpact).not.toHaveBeenCalled();
    expect(findAffectedWikiPages).not.toHaveBeenCalled();
    expect(result.posted).toBe(true);
  });

  test("flags filesTruncated when the listFiles page is full (100 files)", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    const files = Array.from({ length: 100 }, (_, i) => ({ filename: `src/f${i}.ts`, status: "modified", additions: 1, deletions: 1, patch: "diff" }));
    mockOctokit({ files });

    const result = await generatePrReview(baseParams);

    expect(result.filesTruncated).toBe(true);
    // Only the first MAX_FILES are included in the actual diff sent to the LLM / comment.
    expect(result.filesReviewed).toBeLessThanOrEqual(60);
  });

  test("still saves the ChangeReport even when posting the GitHub comment fails", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    const createComment = jest.fn().mockRejectedValue(new Error("403 insufficient permission"));
    mockOctokit({ files: [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "diff" }], createCommentImpl: createComment });

    const result = await generatePrReview(baseParams);

    expect(prisma.changeReport.create).toHaveBeenCalledTimes(1);
    expect(result.posted).toBe(false);
    expect(result.reason).toBe("comment-post-failed");
    expect(result.changeReportId).toBe("report-1");
  });

  test("caps the diff at MAX_FILES even when more files are returned in one page", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    const files = Array.from({ length: 80 }, (_, i) => ({ filename: `src/f${i}.ts`, status: "modified", additions: 1, deletions: 1, patch: "diff" }));
    mockOctokit({ files });

    const result = await generatePrReview(baseParams);

    expect(result.filesReviewed).toBeLessThanOrEqual(60);
  });
});
