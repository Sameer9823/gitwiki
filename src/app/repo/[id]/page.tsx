import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { ChatPanel } from "./chat-panel";
import { RepoTabs } from "./tabs";
import { RepoHeader } from "@/components/repo/repo-header";
import { RepoActions } from "@/components/repo/repo-actions";
import { SiteHeader } from "@/components/site-header";

export default async function RepositoryPage({ params }: { params: Promise<{ id: string }> }) {
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
        <ChatPanel repositoryId={repository.id} initialStatus={status as any} />
      </main>
    </div>
  );
}