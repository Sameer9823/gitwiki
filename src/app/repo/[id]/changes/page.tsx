import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { ChangesList } from "./ChangesList";

export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) notFound();

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-text">Change Intelligence</h1>
        <p className="mt-1 text-sm text-text-muted">Review what changed and what it affects — files, wiki pages, and downstream importers.</p>
      </div>
      <ChangesList repositoryId={repository.id} />
    </div>
  );
}
