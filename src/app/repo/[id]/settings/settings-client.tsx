"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ExternalLink, RefreshCw } from "lucide-react";

interface SettingsClientProps {
  repositoryId: string;
  fullName: string;
  displayName: string | null;
  defaultBranch: string | null;
  status: string;
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border pb-6 last:border-none last:pb-0">
      <h2 className="text-sm font-medium text-text">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsClient({ repositoryId, fullName, displayName, defaultBranch, status }: SettingsClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = React.useState(displayName ?? "");
  const [saving, setSaving] = React.useState(false);
  const [reindexing, setReindexing] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const saveName = async () => {
    const v = name.trim();
    if (!v) {
      showToast("Name cannot be empty", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: v }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Rename failed");
      showToast("Settings saved", "success");
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "We couldn't save that change.", "error");
    } finally {
      setSaving(false);
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}/reindex`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Re-index failed");
      showToast("Re-index started", "success");
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "We couldn't start re-indexing.", "error");
    } finally {
      setReindexing(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      showToast("Repository deleted", "success");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "We couldn't delete this repository.", "error");
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Manage how Codexa indexes and displays this repository.</p>
      </div>

      <div className="space-y-6 rounded-xl border border-border bg-surface p-5">
        <SettingsSection title="Display name" description="Shown across Codexa instead of the full GitHub path.">
          <div className="flex max-w-sm items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={fullName} maxLength={80} />
            <Button onClick={saveName} loading={saving} size="sm">
              Save
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title="GitHub source">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono text-text">{fullName}</span>
            <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs text-text-muted">{defaultBranch ?? "default"}</span>
            <a
              href={`https://github.com/${fullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </SettingsSection>

        <SettingsSection title="Indexing" description="Rebuild the wiki, embeddings, and architecture graph from the latest commit.">
          <div className="flex items-center gap-3">
            <StatusBadge status={status as any} />
            <Button variant="outline" size="sm" onClick={reindex} loading={reindexing}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-index now
            </Button>
          </div>
        </SettingsSection>
      </div>

      <div className="rounded-xl border border-error/30 bg-surface p-5">
        <h2 className="text-sm font-medium text-error">Danger zone</h2>
        <p className="mt-1 text-sm text-text-muted">
          Permanently remove this repository along with its chat history, wiki pages, snapshots, and indexed data.
        </p>
        <Button variant="destructive" size="sm" className="mt-4" onClick={() => setDeleteOpen(true)}>
          Delete repository
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete repository?"
        description="This will permanently remove the repository, its chat history, wiki pages, snapshots, and indexed data. This action cannot be undone."
        confirmLabel="Delete repository"
        variant="destructive"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}
