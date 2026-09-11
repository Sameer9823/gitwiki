import { inngest } from "@/lib/inngest/client";
import { fetchRepoFiles } from "@/lib/github";
import { chunkFiles, type Chunk } from "@/lib/chunker";
import { saveChunks } from "@/lib/vectorStore";
import { prisma } from "@/lib/prisma";

function isMissingRecord(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2025");
}

export const indexRepo = inngest.createFunction(
  { id: "index-repo", triggers: [{ event: "repo/index.requested" }] },
  async ({ event, step }) => {
    const { snapshotId, githubToken, owner, repo, repoKey } = event.data as {
      snapshotId: string;
      githubToken?: string;
      owner: string;
      repo: string;
      repoKey: string;
    };

    await step.run("mark-running", async () => {
      try {
        await prisma.repositorySnapshot.update({ where: { id: snapshotId }, data: { status: "RUNNING" } });
      } catch (err) {
        if (isMissingRecord(err)) {
          console.warn(`[indexRepo] mark-running: snapshot ${snapshotId} not found (likely deleted), skipping`);
          return;
        }
        throw err;
      }
    });

    let defaultBranch = "unknown";
    let commitSha: string | undefined;
    let fileCount = 0;
    let chunkCount = 0;
    let repositoryId: string | null = null;

    try {
      const fetched = await step.run("fetch-github-files", async () => {
        return fetchRepoFiles(githubToken, owner, repo);
      });
      defaultBranch = fetched.defaultBranch;
      commitSha = fetched.commitSha;
      const files = fetched.files;

      const analyzed = await step.run("analyze-and-chunk-files", async () => {
        return chunkFiles(files, repoKey);
      });

      repositoryId = await step.run("resolve-repository-id", async () => {
        const snapshot = await prisma.repositorySnapshot.findUnique({
          where: { id: snapshotId },
          select: { repositoryId: true },
        });
        if (!snapshot) {
          console.warn(`[indexRepo] resolve-repository-id: snapshot ${snapshotId} not found, aborting persist`);
          return null as unknown as string;
        }
        return snapshot.repositoryId;
      });

      if (!repositoryId) {
        console.warn(`[indexRepo] snapshot ${snapshotId} missing — skipping persist/save`);
        return { repo: repoKey, skipped: true, reason: "snapshot-deleted" };
      }

      const counts = await step.run("persist-files-and-symbols", async () => {
        let symbolCount = 0;
        for (const file of analyzed) {
          const record = await prisma.repositoryFile.create({
            data: {
              repositoryId: repositoryId!,
              snapshotId,
              path: file.path,
              language: file.language,
              contentHash: file.contentHash,
              imports: file.imports ?? [],
            },
          });
          const symbolsToCreate = file.symbols.filter((s) => s.symbolType !== "method" || s.parentSymbol);
          if (symbolsToCreate.length > 0) {
            await prisma.repositorySymbol.createMany({
              data: symbolsToCreate.map((s) => ({
                fileId: record.id,
                name: s.name,
                symbolType: s.symbolType,
                startLine: s.startLine,
                endLine: s.endLine,
                parentSymbol: s.parentSymbol,
              })),
            });
            symbolCount += symbolsToCreate.length;
          }
        }
        return { fileCount: analyzed.length, symbolCount };
      });
      fileCount = counts.fileCount;

      const allChunks: Chunk[] = analyzed.flatMap((f) => f.chunks);
      chunkCount = allChunks.length;

      const saveResult = await step.run("save-to-pinecone", async () => {
        return saveChunks(repoKey, allChunks);
      });

      await step.run("mark-completed", async () => {
        try {
          await prisma.repositorySnapshot.update({
            where: { id: snapshotId },
            data: {
              status: "COMPLETED",
              branch: defaultBranch,
              commitSha,
              fileCount,
              chunkCount,
              completedAt: new Date(),
            },
          });
          await prisma.repository.update({ where: { id: repositoryId! }, data: { defaultBranch } });
        } catch (err) {
          if (isMissingRecord(err)) {
            console.warn(`[indexRepo] mark-completed: snapshot ${snapshotId} not found (deleted during indexing), skipping`);
            return;
          }
          throw err;
        }
      });

      await step.sendEvent("trigger-wiki-generation", {
        name: "wiki/generate.requested",
        data: { repositoryId: repositoryId!, snapshotId, repoKey },
      });

      return { repo: repoKey, fileCount, symbolCount: counts.symbolCount, chunkCount, saved: saveResult.saved };
    } catch (err) {
      await step.run("mark-failed", async () => {
        try {
          await prisma.repositorySnapshot.update({
            where: { id: snapshotId },
            data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), completedAt: new Date() },
          });
        } catch (updateErr) {
          if (isMissingRecord(updateErr)) {
            console.warn(`[indexRepo] mark-failed: snapshot ${snapshotId} not found, skipping`);
            return;
          }
          console.error("[indexRepo] mark-failed also failed", updateErr);
        }
      });
      throw err;
    }
  },
);
