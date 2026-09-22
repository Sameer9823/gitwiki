// Tests for src/lib/inngest/functions/reviewPullRequest.ts's own logic —
// the actual review generation is covered in prReview.test.ts, so this
// mocks generatePrReview and focuses on the function's gating decisions.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    repository: { findUnique: jest.fn() },
    repositorySnapshot: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/auth", () => ({
  getGithubTokenForUser: jest.fn(),
}));

jest.mock("@/lib/prReview", () => ({
  generatePrReview: jest.fn(),
}));

import { reviewPullRequest } from "@/lib/inngest/functions/reviewPullRequest";
import { prisma } from "@/lib/prisma";
import { getGithubTokenForUser } from "@/lib/auth";
import { generatePrReview } from "@/lib/prReview";

// Inngest's createFunction wraps the handler; grab the underlying handler so
// we can invoke it directly with a fake step runner, same style used for
// testing plain async functions elsewhere in this suite.
function makeStep() {
  return { run: jest.fn((_id: string, fn: () => unknown) => fn()) };
}

const eventData = {
  repositoryId: "repo-1",
  repoKey: "owner/repo",
  owner: "owner",
  repo: "repo",
  prNumber: 42,
  prTitle: "Add feature X",
  prUrl: "https://github.com/owner/repo/pull/42",
  baseSha: "base-sha",
  headSha: "head-sha",
};

// Inngest's createFunction wraps the handler in an object exposing it as
// `.fn` — grab it directly so we can invoke it with a fake step runner,
// rather than spinning up Inngest's own test harness for four gating checks.
async function invoke(event: { data: typeof eventData }) {
  const handler = (reviewPullRequest as unknown as { fn: (args: { event: unknown; step: unknown }) => unknown }).fn;
  return handler({ event, step: makeStep() });
}

describe("reviewPullRequest gating", () => {
  const originalEnv = process.env.PR_REVIEW_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PR_REVIEW_ENABLED;
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue({ connectedById: "user-1" });
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue({ id: "snap-1" });
    (getGithubTokenForUser as jest.Mock).mockResolvedValue("token");
    (generatePrReview as jest.Mock).mockResolvedValue({ posted: true, filesReviewed: 1, filesTruncated: false });
  });

  afterAll(() => {
    process.env.PR_REVIEW_ENABLED = originalEnv;
  });

  test("skips entirely when PR_REVIEW_ENABLED=false", async () => {
    process.env.PR_REVIEW_ENABLED = "false";
    const result = await invoke({ data: eventData });
    expect(result).toEqual({ posted: false, reason: "pr-review-disabled" });
    expect(generatePrReview).not.toHaveBeenCalled();
  });

  test("skips when the repository record can't be found", async () => {
    (prisma.repository.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await invoke({ data: eventData });
    expect(result).toEqual({ posted: false, reason: "repository-not-found" });
    expect(generatePrReview).not.toHaveBeenCalled();
  });

  test("skips when the repo has never been indexed", async () => {
    (prisma.repositorySnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await invoke({ data: eventData });
    expect(result).toEqual({ posted: false, reason: "not-indexed-yet" });
    expect(generatePrReview).not.toHaveBeenCalled();
  });

  test("generates a review when enabled, connected, and indexed", async () => {
    const result = await invoke({ data: eventData });
    expect(generatePrReview).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryId: "repo-1", prNumber: 42, githubToken: "token" })
    );
    expect(result).toEqual({ posted: true, filesReviewed: 1, filesTruncated: false });
  });
});
