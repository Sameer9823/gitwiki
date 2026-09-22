import { inngest } from "@/lib/inngest/client";
import { createIncrementalSnapshot } from "@/lib/incremental";
import { prisma } from "@/lib/prisma";
import { getGithubTokenForUser } from "@/lib/auth";

export const processPush = inngest.createFunction(
  { id: "process-push", triggers: [{ event: "repo/push.received" }] },
  async ({ event, step }) => {
    const { repositoryId, repoKey, owner, repo, headSha, beforeSha } = event.data as {
      repositoryId: string;
      repoKey: string;
      owner: string;
      repo: string;
      headSha: string;
      beforeSha: string;
    };

    // Get the repository to find the connected user for GitHub token
    const repository = await step.run("load-repository", async () => {
      return prisma.repository.findUniqueOrThrow({
        where: { id: repositoryId },
        select: { connectedById: true },
      });
    });

    const githubToken = (await step.run("get-github-token", async () => {
      return getGithubTokenForUser(repository.connectedById) ?? undefined;
    })) ?? undefined;

    // Find the latest completed snapshot (base)
    const baseSnapshot = await step.run("find-base-snapshot", async () => {
      return prisma.repositorySnapshot.findFirst({
        where: { repositoryId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { id: true, commitSha: true },
      });
    });

    if (!baseSnapshot) {
      // No previous snapshot — fall back to full index with a real snapshot record
      const snapshot = await step.run("create-fallback-snapshot", async () => {
        return prisma.repositorySnapshot.create({
          data: { repositoryId, branch: "unknown", status: "PENDING" },
        });
      });
      await step.sendEvent("trigger-full-index", {
        name: "repo/index.requested",
        data: { snapshotId: snapshot.id, githubToken, owner, repo, repoKey },
      });
      return { action: "full-index-triggered", snapshotId: snapshot.id };
    }

    const result = await step.run("create-incremental-snapshot", async () => {
      return createIncrementalSnapshot(
        repositoryId,
        repoKey,
        githubToken,
        owner,
        repo,
        baseSnapshot.id,
        baseSnapshot.commitSha ?? beforeSha,
        headSha
      );
    });

    return { action: "incremental", ...result };
  },
);