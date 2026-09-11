import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RepoTabs } from "../tabs";
import { RepoHeader } from "@/components/repo/repo-header";
import { RepoActions } from "@/components/repo/repo-actions";
import { BookOpen } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

function freshnessLabel(f: number | null): string {
  if (f == null) return "Unknown";
  if (f >= 0.85) return "Updated recently";
  if (f >= 0.6) return "Potentially outdated";
  return "Needs refresh";
}

export default async function WikiIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id }, include: { snapshots: { orderBy: { startedAt: "desc" }, take: 1 } } });
  if (!repository) notFound();

  const pages = await prisma.wikiPage.findMany({
    where: { repositoryId: repository.id },
    orderBy: { slug: "asc" },
  });

  const snap = repository.snapshots[0];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RepoHeader
        fullName={repository.fullName}
        displayName={(repository as any).displayName ?? null}
        status={snap?.status ?? "PENDING"}
        defaultBranch={repository.defaultBranch}
        fileCount={snap?.fileCount ?? null}
        chunkCount={snap?.chunkCount ?? null}
        lastIndexed={snap?.completedAt ? String(snap.completedAt) : null}
        actions={<RepoActions repositoryId={repository.id} fullName={repository.fullName} displayName={(repository as any).displayName ?? null} />}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <RepoTabs repositoryId={repository.id} />
        {pages.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-10 w-10" />}
            title="Your living wiki is being generated"
            description="Documentation will appear here when the repository is ready. If indexing just finished, give wiki generation a minute."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page: { id: string; slug: string; title: string; freshness: number | null; updatedAt: Date }) => (
              <Link key={page.id} href={`/repo/${repository.id}/wiki/${page.slug}`} className="block">
                <Card className="flex h-full flex-col p-5 transition-colors hover:bg-surface-hover">
                  <h3 className="text-sm font-medium text-text">{page.title}</h3>
                  <p className="mt-1 font-mono text-xs text-text-muted">/{page.slug}</p>
                  <div className="mt-auto flex items-center justify-between pt-3 text-xs text-text-muted">
                    <span>{freshnessLabel(page.freshness)}</span>
                    <span>{new Date(page.updatedAt).toLocaleDateString()}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}