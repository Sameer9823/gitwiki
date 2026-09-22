import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { recalculateWikiFreshness } from "@/lib/wiki/freshness";

/**
 * Freshness is normally recalculated inline right after each completed
 * snapshot (see indexRepo.ts and incremental.ts). This cron is a safety
 * net for the case that step gets skipped or silently fails — it walks
 * every repository with at least one wiki page and recomputes freshness
 * against current snapshot history. Cheap: each repo's pass is a handful
 * of indexed queries, no GitHub calls, no LLM calls.
 */
export const recalculateFreshnessCron = inngest.createFunction(
  { id: "recalculate-freshness-cron", triggers: [{ cron: "0 6 * * *" }] },
  async ({ step }) => {
    const repositoryIds = await step.run("find-repos-with-wiki-pages", async () => {
      const rows: { repositoryId: string }[] = await prisma.wikiPage.findMany({
        distinct: ["repositoryId"],
        select: { repositoryId: true },
      });
      return rows.map((r: { repositoryId: string }) => r.repositoryId);
    });

    const summary: { repositoryId: string; pagesChecked: number }[] = [];

    for (const repositoryId of repositoryIds) {
      const result = await step.run(`recalculate-${repositoryId}`, async () => {
        return recalculateWikiFreshness(repositoryId);
      });
      summary.push({ repositoryId, pagesChecked: result.length });
    }

    return { reposChecked: repositoryIds.length, summary };
  },
);
