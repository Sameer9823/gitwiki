"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-8 py-12 text-center", className)}>
      {icon && <div className="text-text-muted opacity-60">{icon}</div>}
      <h3 className="text-sm font-medium text-text">{title}</h3>
      {description && <p className="max-w-sm text-sm leading-relaxed text-text-muted">{description}</p>}
      {action && (
        action.href ? (
          <a href={action.href}>
            <Button size="sm" className="mt-2">{action.label}</Button>
          </a>
        ) : (
          <Button size="sm" className="mt-2" onClick={action.onClick}>{action.label}</Button>
        )
      )}
    </div>
  );
}
