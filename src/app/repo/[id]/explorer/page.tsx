import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { ExplorerClient } from "./ExplorerClient";
import { EmptyState } from "@/components/ui/empty-state";
import { Search } from "lucide-react";

export default async function ExplorerPage({ params }: { params: Promise<{ id: string }> }) {
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
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-text">Code Explorer</h1>
        <p className="mt-1 text-sm text-text-muted">Browse files, search by name, and inspect source directly.</p>
      </div>
      {status !== "COMPLETED" || !snap ? (
        <EmptyState icon={<Search className="h-10 w-10" />} title="Explorer will appear after indexing" description="File navigation is available once indexing completes." />
      ) : (
        <ExplorerClient repositoryId={repository.id} snapshotId={snap.id} />
      )}
    </div>
  );
}
