import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOpen } from "lucide-react";

function freshnessLabel(f: number | null): string {
  if (f == null) return "Unknown";
  if (f >= 0.85) return "Updated recently";
  if (f >= 0.6) return "Potentially outdated";
  return "Needs refresh";
}

export default async function WikiIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) notFound();

  const pages = await prisma.wikiPage.findMany({
    where: { repositoryId: repository.id },
    orderBy: { slug: "asc" },
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-text">Living Wiki</h1>
        <p className="mt-1 text-sm text-text-muted">Documentation Codexa generated and keeps fresh as the repository changes.</p>
      </div>
      {pages.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title="Your living wiki is being generated"
          description="Documentation will appear here when the repository is ready. If indexing just finished, give wiki generation a minute."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page: { id: string; slug: string; title: string; freshness: number | null; updatedAt: Date }) => (
            <Link key={page.id} href={`/repo/${repository.id}/wiki/${page.slug}`} className="block">
              <Card className="flex h-full flex-col p-5 transition-[transform,border-color,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-hover">
                <h3 className="text-sm font-medium text-text">{page.title}</h3>
                <p className="mt-1 font-mono text-xs text-text-muted">/{page.slug}</p>
                <div className="mt-auto flex items-center justify-between pt-3 text-xs text-text-muted">
                  <span>{freshnessLabel(page.freshness)}</span>
                  <span>{new Date(page.updatedAt).toLocaleDateString()}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
