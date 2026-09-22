"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Copy, Check, FileCode, Folder, FolderOpen, Search, PanelLeft, AlertTriangle, X } from "lucide-react";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  language?: string | null;
}

function langDot(lang?: string | null) {
  const m: Record<string, string> = {
    typescript: "bg-[#3178c6]",
    javascript: "bg-[#f1e05a]",
    python: "bg-[#3572A5]",
    prisma: "bg-[#2D3748]",
    json: "bg-[#e34c26]",
    markdown: "bg-[#6B7280]",
    html: "bg-[#e44d26]",
    css: "bg-[#563d7c]",
  };
  return lang ? (m[lang] ?? "bg-[#6B7387]") : "bg-[#6B7387]";
}

function extLabel(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx") return "TS";
  if (ext === "js" || ext === "jsx") return "JS";
  if (ext === "py") return "PY";
  if (ext === "prisma") return "PRISMA";
  if (ext === "md") return "MD";
  if (ext === "json") return "JSON";
  return ext ? ext.toUpperCase().slice(0, 6) : "FILE";
}

function countFiles(nodes: TreeNode[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.type === "file") n += 1;
    else if (node.children) n += countFiles(node.children);
  }
  return n;
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const lower = q.toLowerCase();
  const out: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "directory") {
      const filteredChildren = node.children ? filterTree(node.children, q) : [];
      const selfMatch = node.name.toLowerCase().includes(lower);
      if (selfMatch || filteredChildren.length > 0) {
        out.push({ ...node, children: selfMatch && filteredChildren.length === 0 ? node.children : filteredChildren });
      }
    } else if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
      out.push(node);
    }
  }
  return out;
}

export function ExplorerClient({ repositoryId }: { repositoryId: string; snapshotId: string }) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([""]));
  const [copied, setCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fileRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTree() {
      setLoadingTree(true);
      setTreeError(null);
      try {
        const res = await fetch(`/api/repositories/${repositoryId}/files`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as Record<string, unknown>));
          throw new Error((j.error as string) || `Failed to load file tree (${res.status})`);
        }
        const data = (await res.json()) as { tree: TreeNode[] };
        if (!cancelled) setTree(data.tree ?? []);
      } catch (err) {
        if (!cancelled) setTreeError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoadingTree(false);
      }
    }
    fetchTree();
    return () => {
      cancelled = true;
    };
  }, [repositoryId]);

  // Auto-expand all dirs when filtering, collapse back when cleared
  useEffect(() => {
    if (!searchQuery) return;
    const collectDirs = (nodes: TreeNode[], acc = new Set<string>()): Set<string> => {
      for (const n of nodes) {
        if (n.type === "directory") {
          acc.add(n.path);
          if (n.children) collectDirs(n.children, acc);
        }
      }
      return acc;
    };
    setExpandedDirs(collectDirs(tree));
  }, [searchQuery, tree]);

  useEffect(() => {
    if (!selectedPath) {
      setFileContent("");
      setFileError(null);
      return;
    }
    let cancelled = false;
    async function fetchFile() {
      setLoadingFile(true);
      setFileError(null);
      try {
        const res = await fetch(`/api/repositories/${repositoryId}/files?path=${encodeURIComponent(selectedPath!)}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as Record<string, unknown>));
          throw new Error((j.error as string) || `Failed to load file (${res.status})`);
        }
        const data = (await res.json()) as { content: string };
        if (!cancelled) setFileContent(data.content ?? "");
      } catch (err) {
        if (!cancelled) {
          setFileError(err instanceof Error ? err.message : "Unknown error");
          setFileContent("");
        }
      } finally {
        if (!cancelled) setLoadingFile(false);
      }
    }
    fetchFile();
    return () => {
      cancelled = true;
    };
  }, [repositoryId, selectedPath]);

  // Deep-link via ?path= — optional, preserves shareable file links
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("path");
    if (p) setSelectedPath(p);
  }, []);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleFileClick = useCallback(
    (path: string) => {
      setSelectedPath(path);
      setDrawerOpen(false);
      const url = new URL(window.location.href);
      url.searchParams.set("path", path);
      window.history.replaceState({}, "", url.toString());
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fileContent]);

  const filteredTree = useMemo(() => filterTree(tree, searchQuery.trim()), [tree, searchQuery]);
  const totalFiles = useMemo(() => countFiles(tree), [tree]);

  const renderTree = useCallback(
    (nodes: TreeNode[], depth = 0): React.ReactNode => {
      return nodes.map((node) => {
        const isDir = node.type === "directory";
        const isExpanded = expandedDirs.has(node.path);
        const hasChildren = isDir && !!node.children?.length;
        const isSelected = selectedPath === node.path;
        if (isDir) {
          return (
            <div key={node.path || node.name}>
              <button
                type="button"
                onClick={() => toggleDir(node.path)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-surface-hover",
                  isSelected && "bg-accent/10 text-accent",
                )}
                style={{ paddingLeft: 10 + depth * 14 }}
                aria-expanded={isExpanded}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted" aria-hidden>
                  {isExpanded ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-text">{node.name}</span>
                {hasChildren && (
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-text-muted">{node.children!.length}</span>
                )}
              </button>
              {isExpanded && hasChildren && <div className="mt-0.5">{renderTree(node.children!, depth + 1)}</div>}
            </div>
          );
        }
        return (
          <button
            key={node.path}
            type="button"
            onClick={() => handleFileClick(node.path)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              "hover:bg-surface-hover",
              isSelected ? "bg-accent/10 text-accent" : "text-text-muted hover:text-text",
            )}
            style={{ paddingLeft: 10 + depth * 14 }}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", langDot(node.language))} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-text">{node.name}</span>
            <span className="hidden shrink-0 rounded bg-surface-muted px-1 py-0.5 font-mono text-[10px] leading-none text-text-muted sm:inline">
              {extLabel(node.path)}
            </span>
          </button>
        );
      });
    },
    [expandedDirs, selectedPath, toggleDir, handleFileClick],
  );

  const lines = useMemo(() => fileContent.split("\n"), [fileContent]);

  return (
    <div className="flex min-h-[480px] flex-col gap-4 lg:h-[68vh] lg:flex-row">
      {/* Mobile files trigger */}
      <div className="flex items-center justify-between lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)} className="gap-2">
          <PanelLeft className="h-4 w-4" /> Files ({totalFiles})
        </Button>
        {selectedPath && (
          <span className="min-w-0 truncate pl-3 font-mono text-xs text-text-muted">{selectedPath}</span>
        )}
      </div>

      {/* File tree — desktop panel */}
      <div className="hidden w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card lg:flex lg:max-w-[380px]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-text">
            <FileCode className="h-4 w-4 text-text-muted" /> Files
          </h2>
          <Badge variant="secondary" className="font-mono text-[11px]">
            {totalFiles} files
          </Badge>
        </div>
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter files…"
              className="h-8 pl-8 text-sm"
              aria-label="Filter files"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadingTree ? (
            <div className="space-y-2 p-2">
              <div className="h-4 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 animate-pulse rounded bg-surface-muted" />
            </div>
          ) : treeError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <AlertTriangle className="h-6 w-6 text-warning" />
              <p className="text-sm font-medium text-text">Couldn&apos;t load files</p>
              <p className="max-w-[28ch] text-sm text-text-muted">{treeError}</p>
            </div>
          ) : filteredTree.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-muted">
              {searchQuery ? `No files match “${searchQuery}”.` : "No files in this snapshot."}
            </p>
          ) : (
            <div className="space-y-0.5">{renderTree(filteredTree)}</div>
          )}
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close file drawer"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-[88%] max-w-[360px] flex-col overflow-hidden rounded-r-xl border-r border-border bg-surface shadow-xl lg:hidden">
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
              <span className="text-sm font-medium text-text">Files</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter files…"
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loadingTree ? (
                <p className="py-8 text-center text-sm text-text-muted">Loading…</p>
              ) : treeError ? (
                <p className="py-8 text-center text-sm text-error">{treeError}</p>
              ) : (
                <div className="space-y-0.5">{renderTree(filteredTree)}</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Source viewer */}
      <div className="flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card lg:h-[68vh]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-muted font-mono text-[10px] text-text-muted sm:inline-flex">
              {selectedPath ? extLabel(selectedPath) : "—"}
            </span>
            {selectedPath ? (
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 overflow-x-auto font-mono text-sm text-text-muted">
                {selectedPath.split("/").map((seg, i, arr) => (
                  <span key={i} className="flex shrink-0 items-center gap-1">
                    {i > 0 && <span className="text-text-subtle">/</span>}
                    <span className={i === arr.length - 1 ? "text-text" : ""}>{seg}</span>
                  </span>
                ))}
              </nav>
            ) : (
              <span className="min-w-0 truncate font-mono text-sm text-text">No file selected</span>
            )}
          </div>
          {selectedPath && !loadingFile && !fileError && fileContent && (
            <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 shrink-0 gap-1.5 font-mono text-xs">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 overflow-auto bg-[#0f1219]">
          {loadingFile ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-muted">Loading file…</div>
          ) : fileError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertTriangle className="h-6 w-6 text-warning" />
              <p className="text-sm font-medium text-text">Couldn&apos;t load this file</p>
              <p className="max-w-md text-sm text-text-muted">{fileError}</p>
              <p className="text-xs text-text-muted">It may be too large, binary, or temporarily unavailable from GitHub.</p>
            </div>
          ) : !selectedPath ? (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="Select a file"
              description="Choose a file from the tree to inspect its source. Search to narrow large repositories. Content is fetched live from GitHub and never mocked."
            />
          ) : (
            <div className="flex min-w-0 flex-1">
              <div className="sticky left-0 select-none border-r border-white/5 bg-[#0f1219] px-3 py-4 text-right font-mono text-xs leading-6 text-white/30">
                {lines.map((_, i) => (
                  <div key={i} className="tabular-nums">
                    {i + 1}
                  </div>
                ))}
              </div>
              <pre
                ref={fileRef}
                className="flex-1 overflow-x-auto whitespace-pre px-4 py-4 font-mono text-sm leading-6 text-[#E6E9F0]"
              >
                <code>{fileContent}</code>
              </pre>
            </div>
          )}
        </div>
        {selectedPath && !loadingFile && !fileError && fileContent && (
          <div className="flex items-center justify-between border-t border-border bg-surface-muted/50 px-3 py-2 font-mono text-xs text-text-muted sm:px-4">
            <span>
              {lines.length} lines · {new Blob([fileContent]).size.toLocaleString()} bytes
            </span>
            <span className="hidden sm:inline">Shift+scroll to pan long lines</span>
          </div>
        )}
      </div>
    </div>
  );
}
