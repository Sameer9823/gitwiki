"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { MoreHorizontal, Pencil, Trash2, RefreshCw, ExternalLink } from "lucide-react";

interface Repo {
  id: string;
  fullName: string;
  displayName?: string | null;
  defaultBranch?: string | null;
  snapshots: Array<{ status: string; fileCount: number | null; chunkCount: number | null }>;
}

export function DashboardClient({ repositories: initial }: { repositories: Repo[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const safeInitial = Array.isArray(initial) ? initial : [];
  const [repos, setRepos] = React.useState<Repo[]>(safeInitial);
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [renameId, setRenameId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    setRepos(Array.isArray(initial) ? initial : []);
  }, [initial]);

  const handleRename = async () => {
    if (!renameId) return;
    const v = renameValue.trim();
    if (!v) {
      showToast("Name cannot be empty", "error");
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(`/api/repositories/${renameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: v }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Rename failed");
      setRepos((r) => r.map((x) => (x.id === renameId ? { ...x, displayName: v } : x)));
      showToast("Repository renamed", "success");
      setRenameId(null);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Rename failed", "error");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/repositories/${deleteId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setRepos((r) => r.filter((x) => x.id !== deleteId));
      showToast("Repository deleted", "success");
      setDeleteId(null);
      setMenuId(null);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleReindex = async (id: string) => {
    try {
      const res = await fetch(`/api/repositories/${id}/reindex`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Re-index failed");
      showToast("Re-index started", "success");
      setMenuId(null);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Re-index failed", "error");
    }
  };

  if (!Array.isArray(repos) || repos.length === 0) {
    return null;
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {repos.map((repo) => {
          const snap = repo.snapshots?.[0];
          const label = repo.displayName?.trim() ? repo.displayName : repo.fullName;
          return (
            <Card
              key={repo.id}
              className="group relative flex flex-col p-4 transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/repo/${repo.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-medium text-text">{label}</p>
                  {label !== repo.fullName && (
                    <p className="truncate font-mono text-xs text-text-muted">{repo.fullName}</p>
                  )}
                  <p className="mt-1 text-xs text-text-muted">
                    {snap ? `${snap.fileCount ?? "…"} files · ${snap.chunkCount ?? "…"} chunks` : "Not indexed yet"}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {snap && <StatusBadge status={snap.status as any} />}
                  <div className="relative">
                    <button
                      onClick={() => setMenuId(menuId === repo.id ? null : repo.id)}
                      className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted hover:text-text"
                      aria-label="Repository actions"
                      aria-haspopup="menu"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === repo.id && (
                      <div
                        className="absolute right-0 top-8 z-20 min-w-[200px] rounded-lg border border-border bg-surface p-1 shadow-dropdown"
                        role="menu"
                      >
                        <Link
                          href={`/repo/${repo.id}`}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text hover:bg-surface-hover"
                          role="menuitem"
                        >
                          <ExternalLink className="h-4 w-4" /> Open
                        </Link>
                        <button
                          onClick={() => {
                            setRenameId(repo.id);
                            setRenameValue(repo.displayName ?? "");
                            setMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text hover:bg-surface-hover"
                          role="menuitem"
                        >
                          <Pencil className="h-4 w-4" /> Rename
                        </button>
                        <button
                          onClick={() => handleReindex(repo.id)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text hover:bg-surface-hover"
                          role="menuitem"
                        >
                          <RefreshCw className="h-4 w-4" /> Re-index
                        </button>
                        <div className="my-1 border-t border-border" />
                        <button
                          onClick={() => {
                            setDeleteId(repo.id);
                            setMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-error hover:bg-error-bg"
                          role="menuitem"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <Link href={`/repo/${repo.id}`}>
                  <Button size="sm" variant="secondary" className="w-full">
                    Open
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {renameId && (
        <>
          <div className="dialog-overlay" onClick={() => !renaming && setRenameId(null)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="dialog-content">
            <h2 className="dialog-title">Rename repository</h2>
            <p className="dialog-description">Display name only — does not change the GitHub repository.</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setRenameId(null);
              }}
              placeholder="My service"
              maxLength={80}
              className="mt-4 w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Repository display name"
            />
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => setRenameId(null)} disabled={renaming}>
                Cancel
              </Button>
              <Button onClick={handleRename} loading={renaming}>
                Save
              </Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete repository?"
        description="This will permanently remove the repository, its chat history, wiki pages, snapshots, and indexed data. This action cannot be undone."
        confirmLabel="Delete repository"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}

export default DashboardClient;
