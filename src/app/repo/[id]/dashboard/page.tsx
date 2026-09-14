import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { Activity } from "lucide-react";
import { DashboardMetrics } from "@/components/repo/dashboard-metrics";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";

export default async function RepoDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({
    where: { id, organizationId: org.id },
    include: { snapshots: { orderBy: { startedAt: "desc" }, take: 1 } },
  });
  if (!repository) notFound();

  const snap = repository.snapshots[0];

  const [dependencyCount, wikiPages, recentChanges] = await Promise.all([
    prisma.repositoryRelationship.count({ where: { fromSymbol: { file: { repositoryId: repository.id } } } }),
    prisma.wikiPage.findMany({ where: { repositoryId: repository.id }, select: { freshness: true } }),
    prisma.changeReport.findMany({ where: { repositoryId: repository.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const avgFreshness =
    wikiPages.length > 0
      ? Math.round((wikiPages.reduce((sum: number, p: { freshness: number | null }) => sum + (p.freshness ?? 0), 0) / wikiPages.length) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">A snapshot of what Codexa understands about this repository.</p>
      </div>

      <DashboardMetrics
        fileCount={snap?.fileCount ?? null}
        chunkCount={snap?.chunkCount ?? null}
        dependencyCount={dependencyCount}
        wikiCount={wikiPages.length}
        avgFreshness={avgFreshness}
      />

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">Repository health</h2>
          <StatusBadge status={(snap?.status ?? "PENDING") as any} />
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-subtle">Default branch</dt>
            <dd className="mt-0.5 font-mono text-text">{repository.defaultBranch ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-subtle">Last indexed</dt>
            <dd className="mt-0.5 text-text">{snap?.completedAt ? new Date(snap.completedAt).toLocaleString() : "Not yet indexed"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-subtle">Documentation freshness</dt>
            <dd className="mt-0.5 text-text">{avgFreshness != null ? `${avgFreshness}%` : "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium text-text">Recent activity</h2>
        {recentChanges.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-8 w-8" />}
            title="No changes detected yet"
            description="Change Intelligence reports will show up here once new commits are indexed."
          />
        ) : (
          <ul className="space-y-2">
            {recentChanges.map((c: { id: string; summary: string; createdAt: Date }) => (
              <li key={c.id} className="rounded-lg border border-border bg-surface-muted px-3 py-2.5">
                <p className="line-clamp-2 text-sm text-text">{c.summary}</p>
                <p className="mt-1 font-mono text-xs text-text-subtle">{new Date(c.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
