import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConnectRepoForm } from "./connect-repo-form";
import { DashboardClient } from "./dashboard-client";
import { SiteHeader } from "@/components/site-header";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repositories = await prisma.repository.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    include: { snapshots: { orderBy: { startedAt: "desc" }, take: 1 } },
  });

  // Ensure we always pass an array — guards against a corrupted snapshot shape
  // that caused `repositories.map is not a function` / `undefined reading call`.
  const safeRepositories = Array.isArray(repositories) ? repositories : [];

  return (
    <div className="min-h-screen bg-background codexa-grid-soft">
      <SiteHeader />
      <main className="mx-auto max-w-5xl codexa-enter px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-text-muted">{org.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">Repositories</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-muted">
            Connect a GitHub repository to start indexing. Codexa builds a searchable map of your code and cites every
            answer.
          </p>
        </div>

        <Card className="mb-8 p-4 sm:p-6">
          <h2 className="mb-3 text-sm font-medium text-text">Connect a repository</h2>
          <ConnectRepoForm />
        </Card>

        {safeRepositories.length === 0 ? (
          <EmptyState
            title="No repositories connected yet"
            description="Connect a GitHub repository to start understanding your codebase. Works with public and private repos you can access."
          />
        ) : (
          <DashboardClient repositories={safeRepositories as never} />
        )}
      </main>
    </div>
  );
}
