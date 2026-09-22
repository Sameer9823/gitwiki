"use client";

import * as React from "react";
import Link from "next/link";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Menu, X, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WikiPage {
  title: string;
  content: string;
  freshness: number | null;
  sourceCommit: string | null;
  updatedAt: string | Date;
  sources: { id: string; path: string; startLine: number | null; endLine: number | null }[];
}

export function WikiSlugClient({ repositoryId, pages, activeSlug, page }: { repositoryId: string; pages: { slug: string; title: string }[]; activeSlug: string; page: WikiPage }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const freshnessLabel = page.freshness == null ? null : page.freshness >= 0.85 ? "Updated recently" : page.freshness >= 0.6 ? "Potentially outdated" : "Needs refresh";
  const freshnessColor = page.freshness == null ? "text-text-muted" : page.freshness >= 0.85 ? "text-success" : page.freshness >= 0.6 ? "text-warning" : "text-error";

  const onCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex gap-6 lg:gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-[260px] shrink-0 lg:block">
          <div className="sticky top-6 rounded-xl border border-border bg-surface p-4">
            <WikiSidebar repositoryId={repositoryId} pages={pages} activeSlug={activeSlug} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            <div className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] overflow-y-auto border-r border-border bg-surface p-4 shadow-xl lg:hidden">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-text">Wiki</p>
                <button onClick={() => setDrawerOpen(false)} className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text" aria-label="Close wiki navigation">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <WikiSidebar repositoryId={repositoryId} pages={pages} activeSlug={activeSlug} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2 lg:hidden">
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)} aria-label="Open wiki navigation">
              <Menu className="h-4 w-4" /> Wiki
            </Button>
          </div>

          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-text sm:text-xl">{page.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                {freshnessLabel && <span className={cn("rounded-full border px-2 py-0.5 font-medium", freshnessColor, "border-current/20")}>{freshnessLabel}</span>}
                {page.freshness != null && <span>{Math.round(page.freshness * 100)}% fresh</span>}
                {page.sourceCommit && <span className="font-mono">source {page.sourceCommit.slice(0, 7)}</span>}
                <span>{new Date(page.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onCopyLink} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>

          <article className="rounded-xl border border-border bg-surface p-6 sm:p-8">
            <MarkdownRenderer content={page.content} />
          </article>

          {page.sources.length > 0 && (
            <div className="mt-6 rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-medium text-text">Sources</h2>
              <p className="mt-1 text-xs text-text-muted">Files this page was generated from.</p>
              <ul className="mt-3 space-y-1.5">
                {page.sources.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-xs text-text-muted">
                    <span className="truncate text-text">{s.path}</span>
                    {s.startLine ? <span>{s.startLine}-{s.endLine}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

