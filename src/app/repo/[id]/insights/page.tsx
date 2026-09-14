import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkles } from "lucide-react";

function bucket(freshness: number | null): "fresh" | "review" | "stale" {
  if (freshness == null) return "stale";
  if (freshness >= 0.85) return "fresh";
  if (freshness >= 0.6) return "review";
  return "stale";
}

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) notFound();

  const [pages, chatSessionCount] = await Promise.all([
    prisma.wikiPage.findMany({ where: { repositoryId: repository.id }, select: { title: true, slug: true, freshness: true, updatedAt: true } }),
    prisma.chatSession.count({ where: { repositoryId: repository.id } }),
  ]);

  if (pages.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold text-text">Insights</h1>
        <EmptyState
          icon={<Sparkles className="h-10 w-10" />}
          title="Not enough data yet"
          description="Insights builds up once the wiki has been generated for this repository."
        />
      </div>
    );
  }

  const counts = { fresh: 0, review: 0, stale: 0 };
  for (const p of pages) counts[bucket(p.freshness)]++;
  const stalePages = [...pages].sort((a, b) => (a.freshness ?? 0) - (b.freshness ?? 0)).slice(0, 5);

  const bars = [
    { key: "fresh", label: "Fresh", color: "bg-success", count: counts.fresh },
    { key: "review", label: "Needs review", color: "bg-warning", count: counts.review },
    { key: "stale", label: "Stale", color: "bg-error", count: counts.stale },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text">Insights</h1>
        <p className="mt-1 text-sm text-text-muted">How well the living wiki currently reflects the codebase.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium text-text">Documentation freshness</h2>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
          {bars.map((b) => (
            <div key={b.key} className={b.color} style={{ width: `${(b.count / pages.length) * 100}%` }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
          {bars.map((b) => (
            <span key={b.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${b.color}`} /> {b.label} ({b.count})
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-medium text-text">Chat sessions</h2>
          <p className="font-mono text-2xl font-semibold text-text">{chatSessionCount}</p>
          <p className="mt-1 text-xs text-text-subtle">Conversations started against this repository</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-medium text-text">Wiki pages</h2>
          <p className="font-mono text-2xl font-semibold text-text">{pages.length}</p>
          <p className="mt-1 text-xs text-text-subtle">Generated across the repository</p>
        </div>
      </div>

      {stalePages.some((p) => bucket(p.freshness) !== "fresh") && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-text">Pages that may need review</h2>
          <ul className="space-y-1.5">
            {stalePages
              .filter((p) => bucket(p.freshness) !== "fresh")
              .map((p) => (
                <li key={p.slug} className="flex items-center justify-between rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
                  <span className="text-text">{p.title}</span>
                  <span className="font-mono text-xs text-text-subtle">{new Date(p.updatedAt).toLocaleDateString()}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
