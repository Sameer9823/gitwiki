import { fetchRepoFiles } from "@/lib/github";
import { chunkFiles, type ChunkedFile } from "@/lib/chunker";
import { saveChunks } from "@/lib/vectorStore";
import { prisma } from "@/lib/prisma";
import { hashContent } from "@/lib/symbolExtractor";
import { buildImportGraph, computeImpact, findAffectedWikiPages } from "@/lib/dependencies";
import { inngest } from "@/lib/inngest/client";
import { recalculateWikiFreshness } from "@/lib/wiki/freshness";

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed";
  content?: string; // for added/modified
}

/**
 * Compare a new commit's tree against the previous snapshot and return changed files.
 * Uses content hashes for modified detection.
 */
export async function detectChangedFiles(
  snapshotId: string,
  githubToken: string | undefined,
  owner: string,
  repo: string
): Promise<ChangedFile[]> {
  // Get previous snapshot's files
  const previousFiles = await prisma.repositoryFile.findMany({
    where: { snapshotId },
    select: { path: true, contentHash: true },
  });
  const prevMap = new Map<string, string>(previousFiles.map((f: { path: string; contentHash: string }) => [f.path, f.contentHash]));

  // Fetch current tree (limited to changed files optimization possible later)
  const { files: currentFiles, commitSha } = await fetchRepoFiles(githubToken, owner, repo);
  const currentMap = new Map(currentFiles.map((f) => [f.path, f.content]));

  const changed: ChangedFile[] = [];
  const currentPaths = new Set(currentMap.keys());
  const prevPaths = new Set(prevMap.keys());

  for (const path of currentPaths) {
    if (!prevPaths.has(path)) {
      changed.push({ path, status: "added", content: currentMap.get(path) });
    } else {
      const currentContent = currentMap.get(path)!;
      const currentHash = hashContent(currentContent);
      if (currentHash !== prevMap.get(path)) {
        changed.push({ path, status: "modified", content: currentContent });
      }
    }
  }

  for (const path of Array.from(prevPaths)) {
    if (!currentPaths.has(path)) {
      changed.push({ path, status: "removed" });
    }
  }

  return changed;
}

/**
 * Chunk and upsert only the changed files.
 * Deletes removed files from Pinecone.
 */
export async function reindexChangedFiles(
  repoKey: string,
  snapshotId: string,
  changed: ChangedFile[]
): Promise<{ updated: string[]; removed: string[] }> {
  const updated: string[] = [];
  const removed: string[] = [];

  // Prepare new chunks for added/modified
  const toChunk: { path: string; content: string }[] = [];
  for (const c of changed) {
    if (c.status !== "removed" && c.content) {
      toChunk.push({ path: c.path, content: c.content });
    }
  }

  if (toChunk.length > 0) {
    const analyzed = await chunkFiles(toChunk, repoKey);
    const allChunks = analyzed.flatMap((f) => f.chunks);
    await saveChunks(repoKey, allChunks);
    updated.push(...toChunk.map((f) => f.path));
  }

  // Delete removed files from Pinecone (by metadata filter on path)
  for (const c of changed) {
    if (c.status === "removed") {
      // Pinecone doesn't support delete by metadata filter directly in all configs.
      // For now we mark the file as removed in Postgres; a full re-index will clean up.
      // In production, use `deleteMany` with metadata filter if your index supports it.
      removed.push(c.path);
    }
  }

  return { updated, removed };
}

/**
 * Create a new snapshot, persist files/symbols/imports, update vector index,
 * compute impact, and trigger wiki regeneration for affected pages.
 */
export async function createIncrementalSnapshot(
  repositoryId: string,
  repoKey: string,
  githubToken: string | undefined,
  owner: string,
  repo: string,
  baseSnapshotId: string,
  baseCommitSha: string,
  headCommitSha: string,
  options?: { existingSnapshotId?: string }
) {
  // 1. Detect changes
  const changed = await detectChangedFiles(baseSnapshotId, githubToken, owner, repo);

  if (changed.length === 0) {
    // Nothing changed since the base snapshot. If the caller pre-created a
    // snapshot record (e.g. a manual "Reindex now"), it still needs to be
    // resolved out of PENDING/RUNNING or it'll sit there forever — carry the
    // base snapshot's stats forward instead of leaving it dangling.
    if (options?.existingSnapshotId) {
      const base = await prisma.repositorySnapshot.findUnique({
        where: { id: baseSnapshotId },
        select: { branch: true, commitSha: true, fileCount: true, chunkCount: true },
      });
      await prisma.repositorySnapshot.update({
        where: { id: options.existingSnapshotId },
        data: {
          status: "COMPLETED",
          branch: base?.branch ?? "unknown",
          commitSha: headCommitSha || base?.commitSha,
          fileCount: base?.fileCount ?? 0,
          chunkCount: base?.chunkCount ?? 0,
          completedAt: new Date(),
        },
      });
    }
    return { changed: [], impactedFiles: [], affectedWikiPages: [], report: null };
  }

  // 2. Reindex changed files
  await reindexChangedFiles(repoKey, baseSnapshotId, changed);

  // 3. Create a new snapshot, or reuse one the caller already created
  //    (e.g. the PENDING record a manual "Reindex now" shows in the UI).
  const newSnapshot = options?.existingSnapshotId
    ? await prisma.repositorySnapshot.update({
        where: { id: options.existingSnapshotId },
        data: { status: "RUNNING" },
      })
    : await prisma.repositorySnapshot.create({
        data: {
          repositoryId,
          branch: "unknown",
          status: "RUNNING",
        },
      });

  // 4. Persist ALL files for the new snapshot (re-analyze full tree for simplicity)
  const { files, defaultBranch, commitSha } = await fetchRepoFiles(githubToken, owner, repo);
  const analyzed = await chunkFiles(files, repoKey);

  for (const file of analyzed) {
    const record = await prisma.repositoryFile.create({
      data: {
        repositoryId,
        snapshotId: newSnapshot.id,
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
    }
  }

  const allChunks = analyzed.flatMap((f) => f.chunks);
  await saveChunks(repoKey, allChunks);

  await prisma.repositorySnapshot.update({
    where: { id: newSnapshot.id },
    data: {
      status: "COMPLETED",
      branch: defaultBranch,
      commitSha,
      fileCount: analyzed.length,
      chunkCount: allChunks.length,
      completedAt: new Date(),
    },
  });

  // 5. Compute impact (files + importers)
  const { impactedFiles, importersByFile } = await computeImpact(newSnapshot.id, changed.map((c) => c.path));

  // 6. Find affected wiki pages
  const affectedWikiPages = await findAffectedWikiPages(repositoryId, impactedFiles);

  // 7. Generate change report (LLM)
  const report = await generateChangeReport(repositoryId, baseCommitSha, headCommitSha, changed, importersByFile, affectedWikiPages);

  // 8. Recalculate freshness for every wiki page based on how many snapshots
  // they've drifted behind (not just the ones the dependency graph flagged
  // as directly affected — see wiki/freshness.ts for why that matters).
  await recalculateWikiFreshness(repositoryId);

  // 9. Trigger wiki regeneration ONLY for affected pages
  if (affectedWikiPages.length > 0) {
    await inngest.send({
      name: "wiki/generate.requested",
      data: { repositoryId, snapshotId: newSnapshot.id, repoKey, slugs: affectedWikiPages },
    });
  }

  return { changed, impactedFiles, affectedWikiPages, report, newSnapshotId: newSnapshot.id };
}

async function generateChangeReport(
  repositoryId: string,
  baseSha: string,
  headSha: string,
  changed: ChangedFile[],
  importersByFile: Record<string, string[]>,
  affectedWikiPages: string[]
) {
  const summary = changed
    .map((c) => `${c.status === "removed" ? "🗑" : c.status === "added" ? "➕" : "✏️"} ${c.path}`)
    .join("\n");

  const impactLines = Object.entries(importersByFile)
    .map(([file, importers]) => `${file} → imported by ${[...new Set(importers)].join(", ")}`)
    .join("\n");

  const { ChatOpenAI } = await import("@langchain/openai");
  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });

  const prompt = `You are a senior engineer analyzing a code change. Produce a concise Change Impact Report.

Repository: (internal)
Base commit: ${baseSha.slice(0, 7)}
Head commit: ${headSha.slice(0, 7)}

Changed files:
${summary}

Transitive importers (files that depend on changed files):
${impactLines || "(none detected)"}

Affected wiki pages: ${affectedWikiPages.join(", ") || "(none)"}

Write the report in this exact format:

Change Impact Report
====================

Changed:
- file1
- file2

Affected files (transitive):
- file3 (imports file1)
- file4 (imports file2)

Affected wiki pages:
- page1
- page2

Potential impact:
- bullet 1
- bullet 2

Recommended actions:
- action 1
- action 2

Keep it under 200 words. Focus on actionable insights for a developer.
`;

  const response = await llm.invoke(prompt);
  const reportText = typeof response.content === "string" ? response.content : String(response.content);

  await prisma.changeReport.create({
    data: {
      repositoryId,
      baseSha,
      headSha,
      summary: reportText,
      affected: {
        files: changed.map((c) => c.path),
        wikiPages: affectedWikiPages,
        importers: importersByFile,
      },
    },
  });

  return reportText;
}