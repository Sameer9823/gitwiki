"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MessageSquare, BookOpen, Network, Search, GitBranch } from "lucide-react";

const icons: Record<string, React.ReactNode> = {};

export function RepoTabs({ repositoryId }: { repositoryId: string }) {
  const pathname = usePathname();
  const isWiki = pathname.startsWith(`/repo/${repositoryId}/wiki`);
  const isArchitecture = pathname.startsWith(`/repo/${repositoryId}/architecture`);
  const isChanges = pathname.startsWith(`/repo/${repositoryId}/changes`);
  const isExplorer = pathname.startsWith(`/repo/${repositoryId}/explorer`);

  const tabs = [
    { href: `/repo/${repositoryId}`, label: "Chat", active: !isWiki && !isArchitecture && !isChanges && !isExplorer, icon: MessageSquare },
    { href: `/repo/${repositoryId}/wiki`, label: "Wiki", active: isWiki, icon: BookOpen },
    { href: `/repo/${repositoryId}/architecture`, label: "Architecture", active: isArchitecture, icon: Network },
    { href: `/repo/${repositoryId}/explorer`, label: "Explorer", active: isExplorer, icon: Search },
    { href: `/repo/${repositoryId}/changes`, label: "Changes", active: isChanges, icon: GitBranch },
  ];

  return (
    <div className="mb-6 overflow-x-auto border-b border-border">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                tab.active ? "border-accent text-text shadow-[0_2px_12px_rgba(108,123,255,0.25)]" : "border-transparent text-text-muted hover:text-text hover:border-border",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
