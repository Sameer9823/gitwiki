"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  BookOpen,
  Network,
  Search,
  GitBranch,
  Sparkles,
  Settings,
  Plug,
  LayoutDashboard,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string, base: string) => boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

function buildSections(base: string): NavSection[] {
  return [
    {
      label: "Overview",
      items: [
        { href: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard, match: (p, b) => p.startsWith(`${b}/dashboard`) },
      ],
    },
    {
      label: "Understand",
      items: [
        { href: `${base}/wiki`, label: "Wiki", icon: BookOpen, match: (p, b) => p.startsWith(`${b}/wiki`) },
        { href: `${base}/architecture`, label: "Architecture", icon: Network, match: (p, b) => p.startsWith(`${b}/architecture`) },
        { href: `${base}/explorer`, label: "Code Explorer", icon: Search, match: (p, b) => p.startsWith(`${b}/explorer`) },
      ],
    },
    {
      label: "Intelligence",
      items: [
        { href: base, label: "AI Chat", icon: MessageSquare, match: (p, b) => p === b },
        { href: `${base}/changes`, label: "Changes", icon: GitBranch, match: (p, b) => p.startsWith(`${b}/changes`) },
        { href: `${base}/insights`, label: "Insights", icon: Sparkles, match: (p, b) => p.startsWith(`${b}/insights`) },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: `${base}/settings`, label: "Settings", icon: Settings, match: (p, b) => p.startsWith(`${b}/settings`) },
        { href: `${base}/integrations`, label: "Integrations", icon: Plug, match: (p, b) => p.startsWith(`${b}/integrations`) },
      ],
    },
  ];
}

export function RepoSidebar({
  repositoryId,
  variant = "static",
  onNavigate,
}: {
  repositoryId: string;
  variant?: "static" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const base = `/repo/${repositoryId}`;
  const sections = React.useMemo(() => buildSections(base), [base]);
  const [collapsed, setCollapsed] = React.useState(false);
  const isDrawer = variant === "drawer";

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-border bg-surface",
        isDrawer
          ? "h-full w-full border-r-0"
          : cn(
              "sticky top-14 hidden h-[calc(100vh-3.5rem)] border-r transition-[width] duration-200 ease-out md:flex",
              collapsed ? "w-[68px]" : "w-[260px]"
            )
      )}
      aria-label="Repository navigation"
    >
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            {(!collapsed || isDrawer) && (
              <p className="px-2.5 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-widest text-text-subtle">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.match(pathname, base);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed && !isDrawer ? item.label : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active ? "bg-primary/12 text-text" : "text-text-muted hover:bg-surface-hover hover:text-text",
                      collapsed && !isDrawer && "justify-center"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-primary" aria-hidden="true" />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-150 ease-out group-hover:scale-105",
                        active && "text-primary"
                      )}
                      aria-hidden="true"
                    />
                    {(!collapsed || isDrawer) && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {!isDrawer && (
        <div className="border-t border-border p-2.5">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-md px-2.5 py-2 text-xs text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : (
              <>
                <ChevronsLeft className="h-4 w-4" /> Collapse
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
