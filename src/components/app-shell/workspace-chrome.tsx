"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "./top-bar";
import { RepoSidebar } from "./repo-sidebar";
import { X } from "lucide-react";

interface WorkspaceChromeProps {
  repositoryId: string;
  repoLabel: string;
  user: { name?: string | null; email?: string | null; image?: string | null };
  onSignOut: () => void;
  children: React.ReactNode;
}

export function WorkspaceChrome({ repositoryId, repoLabel, user, onSignOut, children }: WorkspaceChromeProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the drawer automatically whenever the route changes.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <>
      <TopBar repoLabel={repoLabel} user={user} onSignOut={onSignOut} onOpenNav={() => setMobileNavOpen(true)} />
      <div className="flex">
        <RepoSidebar repositoryId={repositoryId} />

        {mobileNavOpen && (
          <>
            <button
              type="button"
              aria-label="Close navigation"
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-[80%] max-w-[300px] overflow-hidden border-r border-border bg-surface shadow-xl md:hidden">
              <div className="flex items-center justify-between border-b border-border px-3 py-3">
                <span className="text-sm font-medium text-text">Navigate</span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <RepoSidebar repositoryId={repositoryId} variant="drawer" onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </>
        )}

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
