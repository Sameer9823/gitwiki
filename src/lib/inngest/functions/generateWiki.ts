import { inngest } from "@/lib/inngest/client";
import { planWikiPages } from "@/lib/wiki/planner";
import { writeWikiPage } from "@/lib/wiki/writer";
import { prisma } from "@/lib/prisma";

export const generateWiki = inngest.createFunction(
  { id: "generate-wiki", triggers: [{ event: "wiki/generate.requested" }] },
  async ({ event, step }) => {
    const { repositoryId, snapshotId, repoKey, slugs } = event.data as {
      repositoryId: string;
      snapshotId: string;
      repoKey: string;
      slugs?: string[]; // optional: only regenerate specific pages
    };

    const allPlannedPages = await step.run("plan-wiki-pages", async () => {
      return planWikiPages(repositoryId, snapshotId);
    });

    // If slugs provided, only generate those; otherwise generate all
    const plannedPages = slugs
      ? allPlannedPages.filter((p) => slugs.includes(p.slug))
      : allPlannedPages;

    const snapshot = await step.run("load-snapshot", async () => {
      return prisma.repositorySnapshot.findUniqueOrThrow({ where: { id: snapshotId }, select: { commitSha: true } });
    });

    for (const page of plannedPages) {
      // One step per page: a failure writing "database" shouldn't lose the
      // already-written "overview" page, and each page is independently retryable.
      await step.run(`write-page-${page.slug}`, async () => {
        const written = await writeWikiPage(repositoryId, repoKey, page);

        const wikiPage = await prisma.wikiPage.upsert({
          where: { repositoryId_slug: { repositoryId, slug: written.slug } },
          create: {
            repositoryId,
            slug: written.slug,
            title: written.title,
            content: written.content,
            freshness: 1.0,
            sourceCommit: snapshot.commitSha,
          },
          update: {
            title: written.title,
            content: written.content,
            freshness: 1.0,
            sourceCommit: snapshot.commitSha,
          },
        });

        await prisma.wikiPageSource.deleteMany({ where: { wikiPageId: wikiPage.id } });
        if (written.sources.length > 0) {
          await prisma.wikiPageSource.createMany({
            data: written.sources.map((s) => ({
              wikiPageId: wikiPage.id,
              path: s.path,
              startLine: s.startLine,
              endLine: s.endLine,
            })),
          });
        }
      });
    }

    return { repo: repoKey, pagesGenerated: plannedPages.map((p) => p.slug) };
  },
);
