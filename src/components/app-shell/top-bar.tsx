"use client";

import Link from "next/link";
import { Search, Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

interface TopBarProps {
  repoLabel?: string;
  user: { name?: string | null; email?: string | null; image?: string | null };
  onSignOut: () => void;
  onOpenNav?: () => void;
}

export function TopBar({ repoLabel, user, onSignOut, onOpenNav }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-5">
      {onOpenNav && (
        <button
          onClick={onOpenNav}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Codexa dashboard"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white codexa-neon">
          C
        </span>
        <span className="hidden text-sm font-semibold tracking-tight text-text sm:inline">Codexa</span>
      </Link>

      {repoLabel && (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-text-subtle" aria-hidden="true">
            /
          </span>
          <span className="truncate font-mono text-sm text-text-muted">{repoLabel}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="hidden items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-1.5 text-xs text-text-subtle transition-colors hover:border-border-strong hover:text-text-muted sm:flex"
          aria-label="Open command menu"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Search
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
        <ThemeToggle />
        <UserMenu name={user.name} email={user.email} image={user.image} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
