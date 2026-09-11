"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { MoreHorizontal, Pencil, Trash2, RefreshCw, ExternalLink } from "lucide-react";

interface RepoActionsProps {
  repositoryId: string;
  fullName: string;
  displayName?: string | null;
  onRenamed?: (name: string) => void;
  onDeleted?: () => void;
}

export function RepoActions({ repositoryId, fullName, displayName, onRenamed, onDeleted }: RepoActionsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(displayName ?? "");
  const [renaming, setRenaming] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [reindexing, setReindexing] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const handleRename = async () => {
    const v = renameValue.trim();
    if (!v) { showToast("Name cannot be empty", "error"); return; }
    if (v.length > 80) { showToast("Name is too long", "error"); return; }
    setRenaming(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: v }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Rename failed");
      showToast("Repository renamed", "success");
      setRenameOpen(false);
      onRenamed?.(v);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "We couldn\u0027t rename this repository. Please try again.", "error");
    } finally { setRenaming(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      showToast("Repository deleted", "success");
      onDeleted?.();
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "We couldn\u0027t delete this repository. Please try again.", "error");
    } finally { setDeleting(false); }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}/reindex`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Re-index failed");
      showToast("Re-index started", "success");
      setMenuOpen(false);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "We couldn\u0027t start re-indexing. Please try again.", "error");
    } finally { setReindexing(false); }
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <Button variant="outline" size="sm" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Repository actions">
          <MoreHorizontal className="h-4 w-4" /> Actions
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-10 z-20 min-w-[200px] rounded-lg border border-border bg-surface p-1 shadow-dropdown" role="menu">
            <a href={`https://github.com/${fullName}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text hover:bg-surface-hover" role="menuitem">
              <ExternalLink className="h-4 w-4" /> Open on GitHub
            </a>
            <button onClick={() => { setMenuOpen(false); setRenameOpen(true); setRenameValue(displayName ?? ""); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text hover:bg-surface-hover" role="menuitem">
              <Pencil className="h-4 w-4" /> Rename
            </button>
            <button onClick={handleReindex} disabled={reindexing} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text hover:bg-surface-hover disabled:opacity-50" role="menuitem">
              <RefreshCw className={reindexing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> {reindexing ? "Starting..." : "Re-index"}
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => { setMenuOpen(false); setDeleteOpen(true); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-error hover:bg-error-bg" role="menuitem">
              <Trash2 className="h-4 w-4" /> Delete repository
            </button>
          </div>
        )}
      </div>

      {renameOpen && (
        <>
          <div className="dialog-overlay" onClick={() => !renaming && setRenameOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" className="dialog-content">
            <h2 className="dialog-title">Rename repository</h2>
            <p className="dialog-description">This is a display name only — it doesn&apos;t change the GitHub repository.</p>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenameOpen(false); }}
              placeholder={fullName}
              maxLength={80}
              className="mt-4 w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Repository display name"
            />
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renaming}>Cancel</Button>
              <Button onClick={handleRename} loading={renaming}>Save</Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
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
