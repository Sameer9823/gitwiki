"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, AlertTriangle, GitBranch, Clock, Layers, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface ChangeReport {
  id: string;
  summary: string;
  affected: {
    files: string[];
    wikiPages: string[];
    symbols?: string[];
    importers?: Record<string, string[]>;
  } | null;
  baseSha: string | null;
  headSha: string | null;
  createdAt: string;
}

function shortSha(s: string | null): string {
  return s ? s.slice(0, 7) : "—";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChangesList({ repositoryId }: { repositoryId: string }) {
  const [reports, setReports] = useState<ChangeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/repositories/${repositoryId}/changes?limit=20`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as Record<string, unknown>));
          throw new Error((j.error as string) || `Failed to load changes (${res.status})`);
        }
        const data = (await res.json()) as { reports: ChangeReport[] };
        if (!cancelled) {
          setReports(data.reports ?? []);
          if (data.reports?.length && !selectedId) setSelectedId(data.reports[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchReports();
    return () => {
      cancelled = true;
    };
  }, [repositoryId, selectedId]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId],
  );

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
        </div>
        <div className="h-[420px] animate-pulse rounded-xl border border-border bg-surface" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-error/30 bg-error/5 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-error" />
        <p className="text-sm font-medium text-text">Couldn&apos;t load change reports</p>
        <p className="max-w-md text-sm text-text-muted">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="h-10 w-10" />}
        title="No change intelligence yet"
        description="Codexa generates change reports when commits land after indexing. Push to your repository or trigger a re-index — new change intelligence will appear here. Nothing is mocked."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="flex max-h-[68vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card lg:max-h-none lg:h-[64vh]">
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-text">
            <Layers className="h-4 w-4 text-text-muted" /> Change reports
          </h3>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 font-mono text-xs text-text-muted">
            {reports.length}
          </span>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {reports.map((report) => {
            const isActive = report.id === selectedId;
            const firstLine = report.summary.split("\n").find((l) => l.trim()) ?? report.summary.slice(0, 80);
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedId(report.id)}
                className={cn(
                  "w-full rounded-xl border px-3 py-3 text-left transition-all duration-150",
                  isActive
                    ? "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(108,123,255,0.22)]"
                    : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover",
                )}
              >
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className={cn("rounded px-1.5 py-0.5", isActive ? "bg-accent text-white" : "bg-surface-muted text-text-muted")}>
                    {shortSha(report.baseSha)} → {shortSha(report.headSha)}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-text-muted">
                    <Clock className="h-3 w-3" />
                    {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-ink">{firstLine}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 font-mono text-xs text-text-muted">
                    <FileText className="h-3 w-3" /> {report.affected?.files?.length ?? 0} files
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 font-mono text-xs text-text-muted">
                    <GitBranch className="h-3 w-3" /> {report.affected?.importers ? Object.keys(report.affected.importers).length : 0} importers
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[320px] overflow-hidden rounded-xl border border-border bg-surface shadow-card lg:h-[64vh] lg:overflow-auto">
        {selectedReport ? (
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div>
                <h4 className="text-base font-semibold text-text">Change impact</h4>
                <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-text-muted">
                  <span className="rounded bg-surface-muted px-1.5 py-0.5">
                    {shortSha(selectedReport.baseSha)} → {shortSha(selectedReport.headSha)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDate(selectedReport.createdAt)}
                  </span>
                </p>
              </div>
              <a
                href={`#${selectedReport.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs text-text-muted hover:bg-surface-hover"
                onClick={(e) => e.preventDefault()}
                title="Copy report link"
              >
                <ExternalLink className="h-3 w-3" /> Report
              </a>
            </div>

            <div className="prose prose-sm max-w-none mt-4 whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-muted p-4 font-mono text-sm leading-relaxed text-ink">
              {selectedReport.summary}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-muted/60 p-4">
                <h5 className="flex items-center gap-1.5 text-sm font-medium text-text">
                  <FileText className="h-4 w-4 text-text-muted" /> Changed files
                  <span className="ml-auto font-mono text-xs text-text-muted">
                    {selectedReport.affected?.files?.length ?? 0}
                  </span>
                </h5>
                {selectedReport.affected?.files?.length ? (
                  <ul className="mt-3 space-y-1">
                    {selectedReport.affected.files.map((f) => (
                      <li
                        key={f}
                        className="truncate rounded bg-surface px-2 py-1 font-mono text-xs text-text-muted"
                        title={f}
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">No file list recorded for this report.</p>
                )}
                {selectedReport.affected?.importers && Object.keys(selectedReport.affected.importers).length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-medium text-text-muted">Downstream importers</p>
                    <ul className="mt-2 space-y-1">
                      {Object.entries(selectedReport.affected.importers)
                        .slice(0, 8)
                        .map(([file, importers]) => (
                          <li key={file} className="rounded bg-surface px-2 py-1 font-mono text-xs leading-relaxed text-text-muted">
                            <span className="font-medium text-ink">{file}</span>
                            <span className="text-text-muted"> → {(importers as string[]).slice(0, 4).join(", ")}</span>
                            {(importers as string[]).length > 4 && (
                              <span className="text-text-muted"> +{(importers as string[]).length - 4} more</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-surface-muted/60 p-4">
                <h5 className="flex items-center gap-1.5 text-sm font-medium text-text">
                  <GitBranch className="h-4 w-4 text-text-muted" /> Affected wiki
                  <span className="ml-auto font-mono text-xs text-text-muted">
                    {selectedReport.affected?.wikiPages?.length ?? 0}
                  </span>
                </h5>
                {selectedReport.affected?.wikiPages?.length ? (
                  <ul className="mt-3 space-y-1">
                    {selectedReport.affected.wikiPages.map((w) => (
                      <li
                        key={w}
                        className="truncate rounded bg-surface px-2 py-1 font-mono text-xs text-text-muted"
                        title={w}
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    No wiki pages were flagged as affected. The report&apos;s summary above may still describe the impact.
                  </p>
                )}
              </div>
            </div>

            <p className="mt-6 rounded-lg bg-accent/10 px-3 py-2 text-xs leading-relaxed text-text-muted">
              Data shown is exactly what Codexa recorded for this report — commit SHAs, affected files, importers, and summary text from the change analysis. No synthetic content.
            </p>
          </div>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-sm text-text-muted">
            Select a report on the left to view its impact.
          </div>
        )}
      </div>
    </div>
  );
}
