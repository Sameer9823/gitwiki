"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface ActionMenuProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function ActionMenu({ open, onClose, children, align = "right", className }: ActionMenuProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={cn("action-menu", align === "left" ? "left-0 right-auto" : "right-0", className)} role="menu">
      {children}
    </div>
  );
}

export function ActionMenuItem({ children, onClick, destructive, disabled, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(destructive ? "action-menu-item-destructive" : "action-menu-item", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function ActionMenuDivider() {
  return <div className="action-menu-divider" aria-hidden="true" />;
}
