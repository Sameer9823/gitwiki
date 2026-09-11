import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { ArchitectureGraph } from "./ArchitectureGraph";
import { RepoTabs } from "../tabs";
import { RepoHeader } from "@/components/repo/repo-header";
import { RepoActions } from "@/components/repo/repo-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Network } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export default async function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({
    where: { id, organizationId: org.id },
    include: { snapshots: { where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 1 } },
  });

  if (!repository) notFound();

  const snap = repository.snapshots[0];
  const status = snap?.status ?? "PENDING";

  return (
    <div className="min-h-screen bg-background codexa-grid-soft">
      <SiteHeader />
      <RepoHeader
        fullName={repository.fullName}
        displayName={(repository as any).displayName ?? null}
        status={status}
        defaultBranch={repository.defaultBranch}
        fileCount={snap?.fileCount ?? null}
        chunkCount={snap?.chunkCount ?? null}
        lastIndexed={snap?.completedAt ? String(snap.completedAt) : null}
        actions={<RepoActions repositoryId={repository.id} fullName={repository.fullName} displayName={(repository as any).displayName ?? null} />}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 codexa-enter">
        <RepoTabs repositoryId={repository.id} />
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-text">Architecture Explorer</h1>
          <p className="mt-1 text-sm text-text-muted">Visualize file dependencies and module structure. Zoom, pan, and explore how the codebase fits together.</p>
        </div>
        {status !== "COMPLETED" || !snap ? (
          <EmptyState icon={<Network className="h-10 w-10" />} title="Architecture will appear after indexing" description="Indexing builds the dependency graph. It will be ready shortly after the repository finishes indexing." />
        ) : (
          <ArchitectureGraph repositoryId={repository.id} snapshotId={snap.id} />
        )}
      </main>
    </div>
  );
}