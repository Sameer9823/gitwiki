import { inngest } from "@/lib/inngest/client";
import { createIncrementalSnapshot } from "@/lib/incremental";
import { getLatestCommitSha } from "@/lib/github";
import { prisma } from "@/lib/prisma";

function isMissingRecord(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2025");
}

/**
 * Handles a manual "Reindex now" click. Mirrors processPush.ts's incremental
 * path, but there's no push payload to diff against — we just compare the
 * repo's current HEAD against the last COMPLETED snapshot. Falls back to a
 * full index when there's no prior snapshot to diff from.
 */
export const reindexRepo = inngest.createFunction(
  { id: "reindex-repo", triggers: [{ event: "repo/reindex.requested" }] },
  async ({ event, step }) => {
    const { snapshotId, repositoryId, repoKey, owner, repo, githubToken } = event.data as {
      snapshotId: string;
      repositoryId: string;
      repoKey: string;
      owner: string;
      repo: string;
      githubToken?: string;
    };

    // Find the last successfully indexed snapshot to diff against (excludes
    // the PENDING record just created for this request).
    const baseSnapshot = await step.run("find-base-snapshot", async () => {
      return prisma.repositorySnapshot.findFirst({
        where: { repositoryId, status: "COMPLETED", id: { not: snapshotId } },
        orderBy: { completedAt: "desc" },
        select: { id: true, commitSha: true },
      });
    });

    if (!baseSnapshot) {
      // No baseline to diff against — fall back to a full index, reusing the
      // snapshot record already created (and shown as PENDING) by the route.
      await step.sendEvent("trigger-full-index", {
        name: "repo/index.requested",
        data: { snapshotId, githubToken, owner, repo, repoKey },
      });
      return { action: "full-index-triggered", snapshotId };
    }

    try {
      const head = await step.run("get-latest-commit", async () => {
        return getLatestCommitSha(githubToken, owner, repo);
      });

      const result = await step.run("create-incremental-snapshot", async () => {
        return createIncrementalSnapshot(
          repositoryId,
          repoKey,
          githubToken,
          owner,
          repo,
          baseSnapshot.id,
          baseSnapshot.commitSha ?? head.commitSha,
          head.commitSha,
          { existingSnapshotId: snapshotId }
        );
      });

      return { action: "incremental", ...result };
    } catch (err) {
      await step.run("mark-failed", async () => {
        try {
          await prisma.repositorySnapshot.update({
            where: { id: snapshotId },
            data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), completedAt: new Date() },
          });
        } catch (updateErr) {
          if (isMissingRecord(updateErr)) {
            console.warn(`[reindexRepo] mark-failed: snapshot ${snapshotId} not found, skipping`);
            return;
          }
          console.error("[reindexRepo] mark-failed also failed", updateErr);
        }
      });
      throw err;
    }
  },
);
