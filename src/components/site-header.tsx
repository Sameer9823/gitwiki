import Link from "next/link";
import { Home } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Codexa home"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white codexa-neon shadow-[0_2px_10px_rgba(59,130,246,0.35)]">
            C
          </span>
          <span className="text-sm font-semibold tracking-tight text-text">Codexa</span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Primary">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
