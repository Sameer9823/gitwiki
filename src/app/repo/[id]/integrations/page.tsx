import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { Github, CheckCircle2 } from "lucide-react";

export default async function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text">Integrations</h1>
        <p className="mt-1 text-sm text-text-muted">Services connected to this repository.</p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-muted text-text">
            <Github className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-text">GitHub</p>
            <p className="font-mono text-xs text-text-muted">{repository.fullName}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Connected
        </span>
      </div>

      <p className="text-xs text-text-subtle">
        Codexa uses your GitHub OAuth access to read this repository. Revoke access anytime from your{" "}
        <a
          href="https://github.com/settings/applications"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          GitHub application settings
        </a>
        .
      </p>
    </div>
  );
}
