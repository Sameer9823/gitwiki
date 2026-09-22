"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, MoreHorizontal, Pencil, Trash2, MessageSquare, X } from "lucide-react";

export interface ChatSessionItem {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface SessionSidebarProps {
  repositoryId: string;
  sessions: ChatSessionItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  creating?: boolean;
  variant?: "desktop" | "drawer";
  onClose?: () => void;
}

export function SessionSidebar({ repositoryId, sessions, activeId, onSelect, onCreate, onRename, onDelete, creating, variant = "desktop", onClose }: SessionSidebarProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const startEdit = (s: ChatSessionItem) => {
    setEditingId(s.id);
    setEditValue(s.title ?? "New chat");
    setMenuId(null);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const v = editValue.trim();
    if (!v) return;
    await onRename(editingId, v);
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await onDelete(deleteId);
    setDeleting(false);
    setDeleteId(null);
    setMenuId(null);
  };

  const content = (
    <>
      <div className="flex items-center justify-between p-3">
        <h2 className="text-sm font-medium text-text">Chat</h2>
        {variant === "drawer" && (
          <button onClick={onClose} className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text" aria-label="Close sessions">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        <Button onClick={onCreate} disabled={!!creating} className="w-full justify-center gap-2" size="sm">
          <Plus className="h-4 w-4" />
          {creating ? "Creating..." : "New chat"}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <p className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-text-muted">Recent</p>
        {sessions.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-text-muted opacity-40" />
            <p className="mt-2 text-sm text-text-muted">No chat sessions yet</p>
            <p className="mt-1 text-xs text-text-muted">Start a new conversation.</p>
          </div>
        ) : (
          <ul className="space-y-1" role="list">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              const isEditing = editingId === s.id;
              return (
                <li key={s.id} className="group relative">
                  {isEditing ? (
                    <div className="flex items-center gap-1 rounded-md border border-accent bg-surface p-1">
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                        className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 text-sm text-text outline-none ring-1 ring-primary/40 focus:ring-primary"
                        aria-label="Edit chat title"
                      />
                      <button onClick={saveEdit} className="rounded px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10">Save</button>
                      <button onClick={() => setEditingId(null)} className="rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-hover">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelect(s.id)}
                      className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors", isActive ? "bg-accent/10 text-text" : "text-text-muted hover:bg-surface-hover hover:text-text")}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.title ?? "New chat"}</span>
                        <span className="block truncate text-xs opacity-70">{new Date(s.updatedAt).toLocaleDateString()}</span>
                      </span>
                    </button>
                  )}
                  {!isEditing && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">
                      <button
                        onClick={() => setMenuId(menuId === s.id ? null : s.id)}
                        className={cn("rounded p-1.5 text-text-muted hover:bg-surface-muted hover:text-text", isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                        aria-label="Chat actions"
                        aria-haspopup="menu"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuId === s.id && (
                        <div className="absolute right-0 top-8 z-20 min-w-[160px] rounded-lg border border-border bg-surface p-1 shadow-dropdown" role="menu">
                          <button onClick={() => startEdit(s)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text hover:bg-surface-hover" role="menuitem">
                            <Pencil className="h-4 w-4" /> Rename
                          </button>
                          <button onClick={() => { setDeleteId(s.id); setMenuId(null); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-error hover:bg-error-bg" role="menuitem">
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete this chat?"
        description="This will permanently delete this conversation and all of its messages. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );

  if (variant === "drawer") {
    return <div className="flex h-full w-full flex-col bg-surface">{content}</div>;
  }
  return <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-surface">{content}</div>;
}
