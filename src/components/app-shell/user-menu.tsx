"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { scaleIn } from "@/lib/animations";
import { useGSAP } from "@gsap/react";

interface UserMenuProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  onSignOut: () => void;
}

export function UserMenu({ name, email, image, onSignOut }: UserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useGSAP(
    () => {
      if (open && menuRef.current) scaleIn(menuRef.current, { transformOrigin: "top right" });
    },
    { dependencies: [open], scope: rootRef }
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted text-xs font-medium text-text transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-lg border border-border bg-surface-muted shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-text">{name || "Account"}</p>
            {email && <p className="truncate text-xs text-text-subtle">{email}</p>}
          </div>
          <button
            role="menuitem"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
