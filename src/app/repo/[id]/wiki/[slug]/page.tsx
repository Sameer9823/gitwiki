import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { RepoTabs } from "../../tabs";
import { RepoHeader } from "@/components/repo/repo-header";
import { RepoActions } from "@/components/repo/repo-actions";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { Button } from "@/components/ui/button";
import { Menu, Copy, Check } from "lucide-react";
import { WikiSlugClient } from "./wiki-client";
import { SiteHeader } from "@/components/site-header";

export default async function WikiPageDetail({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id }, include: { snapshots: { orderBy: { startedAt: "desc" }, take: 1 } } });
  if (!repository) notFound();

  const [pages, page] = await Promise.all([
    prisma.wikiPage.findMany({ where: { repositoryId: repository.id }, orderBy: { slug: "asc" }, select: { slug: true, title: true } }),
    prisma.wikiPage.findUnique({
      where: { repositoryId_slug: { repositoryId: repository.id, slug } },
      include: { sources: true },
    }),
  ]);

  if (!page) notFound();
  const snap = repository.snapshots[0];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RepoHeader
        fullName={repository.fullName}
        displayName={(repository as any).displayName ?? null}
        status={snap?.status ?? "PENDING"}
        defaultBranch={repository.defaultBranch}
        fileCount={snap?.fileCount ?? null}
        chunkCount={snap?.chunkCount ?? null}
        lastIndexed={snap?.completedAt ? String(snap.completedAt) : null}
        actions={<RepoActions repositoryId={repository.id} fullName={repository.fullName} displayName={(repository as any).displayName ?? null} />}
      />
      <WikiSlugClient
        repositoryId={repository.id}
        pages={pages}
        activeSlug={slug}
        page={page as any}
      />
    </div>
  );
}