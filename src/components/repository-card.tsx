import Link from "next/link";
import { Card } from "./ui/card";
import { StatusBadge } from "./ui/badge";
import { cn } from "@/lib/utils";

interface RepositoryCardProps {
  id: string;
  fullName: string;
  displayName?: string | null;
  snapshot?: { status: string; fileCount?: number | null; chunkCount?: number | null } | null;
  href?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function RepositoryCard({ id, fullName, displayName, snapshot, href, actions, className }: RepositoryCardProps) {
  const label = displayName?.trim() ? displayName : fullName;
  const inner = (
    <Card className={cn("flex items-center justify-between p-4 transition-colors hover:bg-surface-hover", className)}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-text">{label}</p>
        {label !== fullName && <p className="truncate font-mono text-xs text-text-muted">{fullName}</p>}
        <p className="text-xs text-text-muted">
          {snapshot ? `${snapshot.fileCount ?? "…"} files · ${snapshot.chunkCount ?? "…"} chunks` : "Not indexed yet"}
        </p>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2">
        {snapshot && <StatusBadge status={snapshot.status as any} />}
        {actions}
      </div>
    </Card>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}
