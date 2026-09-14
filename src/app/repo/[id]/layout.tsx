import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { WorkspaceChrome } from "@/components/app-shell/workspace-chrome";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { PageTransition } from "@/components/app-shell/page-transition";
import { RepoHeader } from "@/components/repo/repo-header";
import { RepoActions } from "@/components/repo/repo-actions";
import { signOutAction } from "@/app/actions/sign-out";

export default async function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
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
  const label = (repository as any).displayName?.trim() ? (repository as any).displayName : repository.fullName;

  return (
    <div className="min-h-screen bg-background codexa-grid-soft">
      <WorkspaceChrome repositoryId={repository.id} repoLabel={label} user={session.user} onSignOut={signOutAction}>
        <RepoHeader
          fullName={repository.fullName}
          displayName={(repository as any).displayName ?? null}
          status={status}
          defaultBranch={repository.defaultBranch}
          fileCount={snap?.fileCount ?? null}
          chunkCount={snap?.chunkCount ?? null}
          lastIndexed={snap?.completedAt ? String(snap.completedAt) : null}
          actions={
            <RepoActions
              repositoryId={repository.id}
              fullName={repository.fullName}
              displayName={(repository as any).displayName ?? null}
            />
          }
        />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </WorkspaceChrome>
      <CommandPalette repositoryId={repository.id} />
    </div>
  );
}
