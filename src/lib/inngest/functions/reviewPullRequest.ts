import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { getGithubTokenForUser } from "@/lib/auth";
import { generatePrReview } from "@/lib/prReview";

/**
 * Reviews a PR on open/reopen/new-commits. Requires the repo to already be
 * indexed (at least one COMPLETED snapshot) — otherwise there's no impact
 * graph or wiki context to ground the review in, so it's skipped silently
 * rather than posting a low-value "not indexed yet" comment.
 */
export const reviewPullRequest = inngest.createFunction(
  { id: "review-pull-request", triggers: [{ event: "repo/pull_request.received" }] },
  async ({ event, step }) => {
    const { repositoryId, repoKey, owner, repo, prNumber, prTitle, prUrl, baseSha, headSha } = event.data as {
      repositoryId: string;
      repoKey: string;
      owner: string;
      repo: string;
      prNumber: number;
      prTitle: string;
      prUrl: string;
      baseSha: string;
      headSha: string;
    };

    const enabled = process.env.PR_REVIEW_ENABLED !== "false";
    if (!enabled) {
      return { posted: false, reason: "pr-review-disabled" };
    }

    const repository = await step.run("load-repository", async () => {
      return prisma.repository.findUnique({ where: { id: repositoryId }, select: { connectedById: true } });
    });
    if (!repository) {
      return { posted: false, reason: "repository-not-found" };
    }

    const hasIndexedSnapshot = await step.run("check-indexed", async () => {
      const snapshot = await prisma.repositorySnapshot.findFirst({
        where: { repositoryId, status: "COMPLETED" },
        select: { id: true },
      });
      return Boolean(snapshot);
    });
    if (!hasIndexedSnapshot) {
      return { posted: false, reason: "not-indexed-yet" };
    }

    const githubToken = (await step.run("get-github-token", async () => {
      return getGithubTokenForUser(repository.connectedById) ?? undefined;
    })) ?? undefined;

    const result = await step.run("generate-pr-review", async () => {
      return generatePrReview({
        repositoryId,
        repoKey,
        owner,
        repo,
        githubToken,
        prNumber,
        prTitle,
        prUrl,
        baseSha,
        headSha,
      });
    });

    return result;
  },
);
