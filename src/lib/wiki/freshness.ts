import { prisma } from "@/lib/prisma";

/**
 * How much freshness to shave off per completed snapshot a wiki page has
 * fallen behind the repo's latest indexed commit. A page anchored to the
 * commit right before HEAD loses one increment; a page five reindexes stale
 * loses five increments (floored at MIN_FRESHNESS).
 */
export const DECAY_PER_SNAPSHOT = 0.12;
export const MIN_FRESHNESS = 0.1;

export interface FreshnessRecalcResult {
  slug: string;
  previousFreshness: number | null;
  newFreshness: number;
  /** Number of completed reindexes since this page's content was last generated. -1 means "unknown" (no matching snapshot record — left untouched). */
  snapshotsBehind: number;
}

interface WikiPageFreshnessRow {
  id: string;
  slug: string;
  freshness: number | null;
  sourceCommit: string | null;
}

interface SnapshotRefRow {
  commitSha: string | null;
  completedAt: Date | null;
}

/**
 * Recomputes freshness for every wiki page in a repository.
 *
 * `incremental.ts`'s impact analysis already decays freshness for pages whose
 * *sources* appear in a diff — but that only catches pages the dependency
 * graph can trace back to a changed file. A page can also go stale simply
 * because many commits have passed since it was last regenerated, even if no
 * single change looked "affecting" on its own. This recalculates freshness
 * for *every* page by comparing its `sourceCommit` against how many
 * completed snapshots the repo has run since then — using locally stored
 * `RepositorySnapshot` history, so it needs no GitHub API calls.
 *
 * Safe to call after any completed index (full or incremental), or on a
 * schedule as a self-healing pass in case a per-run call was missed.
 */
export async function recalculateWikiFreshness(repositoryId: string): Promise<FreshnessRecalcResult[]> {
  const latestSnapshot = await prisma.repositorySnapshot.findFirst({
    where: { repositoryId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { commitSha: true },
  });
  if (!latestSnapshot?.commitSha) return [];

  const pages: WikiPageFreshnessRow[] = await prisma.wikiPage.findMany({
    where: { repositoryId },
    select: { id: true, slug: true, freshness: true, sourceCommit: true },
  });
  if (pages.length === 0) return [];

  const results: FreshnessRecalcResult[] = [];

  // Pages already anchored to the latest indexed commit are fully fresh —
  // no drift to measure. Handle them first without extra queries.
  const upToDate = pages.filter((p: WikiPageFreshnessRow) => p.sourceCommit === latestSnapshot.commitSha);
  const stale = pages.filter((p: WikiPageFreshnessRow) => p.sourceCommit !== latestSnapshot.commitSha);

  for (const page of upToDate) {
    if (page.freshness !== 1.0) {
      await prisma.wikiPage.update({ where: { id: page.id }, data: { freshness: 1.0 } });
    }
    results.push({ slug: page.slug, previousFreshness: page.freshness, newFreshness: 1.0, snapshotsBehind: 0 });
  }

  if (stale.length === 0) return results;

  // Resolve each distinct sourceCommit to the snapshot it was indexed at, so
  // we can count how many completed snapshots have run since.
  const distinctCommits: string[] = [...new Set(stale.map((p: WikiPageFreshnessRow) => p.sourceCommit).filter((c): c is string => Boolean(c)))];
  const refSnapshots: SnapshotRefRow[] = distinctCommits.length
    ? await prisma.repositorySnapshot.findMany({
        where: { repositoryId, status: "COMPLETED", commitSha: { in: distinctCommits } },
        select: { commitSha: true, completedAt: true },
      })
    : [];
  const refCompletedAtByCommit = new Map<string, Date | null>(
    refSnapshots.map((s: SnapshotRefRow): [string, Date | null] => [s.commitSha as string, s.completedAt])
  );

  // One count query per distinct reference point (not per page) to keep this cheap on repos with many pages.
  const behindCountByCommit = new Map<string, number>();
  for (const [commitSha, completedAt] of refCompletedAtByCommit) {
    if (!completedAt) continue;
    const behind: number = await prisma.repositorySnapshot.count({
      where: { repositoryId, status: "COMPLETED", completedAt: { gt: completedAt } },
    });
    behindCountByCommit.set(commitSha, behind);
  }

  for (const page of stale) {
    const snapshotsBehind = page.sourceCommit ? behindCountByCommit.get(page.sourceCommit) : undefined;

    if (snapshotsBehind === undefined) {
      // No matching snapshot record for this page's sourceCommit (pruned
      // history, or a page predating snapshot tracking) — we can't measure
      // drift reliably, so leave its freshness as-is rather than guessing.
      results.push({ slug: page.slug, previousFreshness: page.freshness, newFreshness: page.freshness ?? 1.0, snapshotsBehind: -1 });
      continue;
    }

    const newFreshness = Math.max(MIN_FRESHNESS, 1 - snapshotsBehind * DECAY_PER_SNAPSHOT);
    if (newFreshness !== page.freshness) {
      await prisma.wikiPage.update({ where: { id: page.id }, data: { freshness: newFreshness } });
    }
    results.push({ slug: page.slug, previousFreshness: page.freshness, newFreshness, snapshotsBehind });
  }

  return results;
}
