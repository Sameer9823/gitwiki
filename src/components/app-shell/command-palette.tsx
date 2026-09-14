"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Network,
  Search as SearchIcon,
  GitBranch,
  Settings,
  RefreshCw,
} from "lucide-react";
import { useGSAP } from "@gsap/react";
import { scaleIn } from "@/lib/animations";

interface Command {
  id: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void;
}

export function CommandPalette({ repositoryId }: { repositoryId?: string }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const router = useRouter();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commands: Command[] = React.useMemo(() => {
    const base: Command[] = [
      { id: "dashboard-home", label: "Go to Dashboard", group: "Navigate", icon: LayoutDashboard, href: "/dashboard" },
    ];
    if (repositoryId) {
      base.push(
        { id: "repo-dashboard", label: "Repository Dashboard", group: "Navigate", icon: LayoutDashboard, href: `/repo/${repositoryId}/dashboard` },
        { id: "chat", label: "Ask AI", group: "Navigate", icon: MessageSquare, href: `/repo/${repositoryId}` },
        { id: "wiki", label: "Open Wiki", group: "Navigate", icon: BookOpen, href: `/repo/${repositoryId}/wiki` },
        { id: "architecture", label: "Open Architecture", group: "Navigate", icon: Network, href: `/repo/${repositoryId}/architecture` },
        { id: "explorer", label: "Open Code Explorer", group: "Navigate", icon: SearchIcon, href: `/repo/${repositoryId}/explorer` },
        { id: "changes", label: "View Changes", group: "Navigate", icon: GitBranch, href: `/repo/${repositoryId}/changes` },
        { id: "settings", label: "Settings", group: "Navigate", icon: Settings, href: `/repo/${repositoryId}/settings` },
        { id: "reindex", label: "Reindex Repository", group: "Actions", icon: RefreshCw, href: `/repo/${repositoryId}/settings` }
      );
    }
    return base;
  }, [repositoryId]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useGSAP(
    () => {
      if (open && dialogRef.current) scaleIn(dialogRef.current);
    },
    { dependencies: [open], scope: dialogRef }
  );

  const runCommand = (cmd: Command) => {
    setOpen(false);
    if (cmd.href) router.push(cmd.href);
    cmd.action?.();
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      runCommand(filtered[activeIndex]);
    }
  };

  if (!open) return null;

  let groupCursor = "";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-muted shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <SearchIcon className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Type a command or search…"
            className="h-12 w-full bg-transparent text-sm text-text placeholder:text-text-subtle focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-subtle sm:block">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-text-subtle">No matching commands.</p>
          )}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== groupCursor;
            groupCursor = cmd.group;
            const Icon = cmd.icon;
            return (
              <React.Fragment key={cmd.id}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-text-subtle first:pt-1">
                    {cmd.group}
                  </p>
                )}
                <button
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => runCommand(cmd)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    i === activeIndex ? "bg-primary/12 text-text" : "text-text-muted hover:bg-surface-hover"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {cmd.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
