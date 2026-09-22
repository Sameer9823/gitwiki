import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <SettingsClient
      repositoryId={repository.id}
      fullName={repository.fullName}
      displayName={(repository as any).displayName ?? null}
      defaultBranch={repository.defaultBranch}
      status={snap?.status ?? "PENDING"}
    />
  );
}
