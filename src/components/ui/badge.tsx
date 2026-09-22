"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  PENDING: "bg-surface-muted text-text-muted border border-border",
  RUNNING: "bg-info-bg text-info border border-info-border",
  COMPLETED: "bg-success-bg text-success border border-success-border",
  FAILED: "bg-error-bg text-error border border-error-border",
};

const dotStyles: Record<string, string> = {
  PENDING: "bg-text-muted",
  RUNNING: "bg-info",
  COMPLETED: "bg-success",
  FAILED: "bg-error",
};

export function StatusBadge({ status }: { status: keyof typeof styles }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium", styles[status] ?? styles.PENDING)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[status] ?? dotStyles.PENDING)} aria-hidden="true" />
      {status.toLowerCase()}
    </span>
  );
}

export function Badge({ children, variant = "secondary", className }: { children: React.ReactNode; variant?: "primary" | "secondary" | "outline"; className?: string }) {
  const variantStyles: Record<string, string> = {
    primary: "bg-accent text-accent-foreground",
    secondary: "bg-surface-muted text-text",
    outline: "border border-border bg-transparent text-text",
  };
  return (
    <span className={cn("inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium", variantStyles[variant], className)}>
      {children}
    </span>
  );
}
