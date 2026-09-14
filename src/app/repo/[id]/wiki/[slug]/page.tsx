import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { WikiSlugClient } from "./wiki-client";

export default async function WikiPageDetail({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) notFound();

  const [pages, page] = await Promise.all([
    prisma.wikiPage.findMany({ where: { repositoryId: repository.id }, orderBy: { slug: "asc" }, select: { slug: true, title: true } }),
    prisma.wikiPage.findUnique({
      where: { repositoryId_slug: { repositoryId: repository.id, slug } },
      include: { sources: true },
    }),
  ]);

  if (!page) notFound();

  return (
    <WikiSlugClient
      repositoryId={repository.id}
      pages={pages}
      activeSlug={slug}
      page={page as any}
    />
  );
}
