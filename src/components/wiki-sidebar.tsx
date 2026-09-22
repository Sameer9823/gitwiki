"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface WikiSidebarProps {
  repositoryId: string;
  pages: { slug: string; title: string }[];
  activeSlug?: string;
  onNavigate?: () => void;
}

export function WikiSidebar({ repositoryId, pages, activeSlug, onNavigate }: WikiSidebarProps) {
  return (
    <nav className="space-y-1" aria-label="Wiki">
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">Wiki</p>
      {pages.map((p) => (
        <Link
          key={p.slug}
          href={`/repo/${repositoryId}/wiki/${p.slug}`}
          onClick={onNavigate}
          className={cn("wiki-sidebar-link", p.slug === activeSlug && "wiki-sidebar-link-active")}
        >
          <span className="truncate">{p.title}</span>
        </Link>
      ))}
      {pages.length === 0 && <p className="px-2 py-2 text-sm text-text-muted">No pages yet.</p>}
    </nav>
  );
}
