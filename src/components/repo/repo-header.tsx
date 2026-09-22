import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/badge";

interface RepoHeaderProps {
  fullName: string;
  displayName?: string | null;
  status?: string;
  defaultBranch?: string | null;
  fileCount?: number | null;
  chunkCount?: number | null;
  lastIndexed?: string | null;
  actions?: React.ReactNode;
}

export function RepoHeader({ fullName, displayName, status, defaultBranch, fileCount, chunkCount, lastIndexed, actions }: RepoHeaderProps) {
  const label = displayName?.trim() ? displayName : fullName;
  return (
    <div className="border-b border-border bg-surface/50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-text-muted">{fullName}</p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-text sm:text-2xl">{label}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              {defaultBranch && <span className="rounded bg-surface-muted px-2 py-1 font-mono">{defaultBranch}</span>}
              {status && <StatusBadge status={status as any} />}
              {typeof fileCount === "number" && <span>{fileCount} files</span>}
              {typeof chunkCount === "number" && <span>· {chunkCount} chunks</span>}
              {lastIndexed && <span>· Updated {new Date(lastIndexed).toLocaleDateString()}</span>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
