"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import { Search, Maximize2, RotateCcw, Network, AlertTriangle, Layers, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

interface GraphNodeData {
  label: string;
  type: string;
  path: string;
  [k: string]: unknown;
}
type CustomNode = Node<GraphNodeData>;

function langDot(type: string) {
  const m: Record<string, string> = {
    typescript: "bg-[#3178c6]",
    javascript: "bg-[#f1e05a]",
    python: "bg-[#3572A5]",
    prisma: "bg-[#2D3748]",
    markdown: "bg-[#6B7280]",
    json: "bg-[#e34c26]",
    other: "bg-[#6B7387]",
  };
  return m[type] ?? m.other;
}
function langLabel(type: string) {
  if (type === "typescript") return "TS";
  if (type === "javascript") return "JS";
  if (type === "python") return "PY";
  return type.slice(0, 2).toUpperCase();
}

function FileNode({ data, selected }: { data: GraphNodeData } & { selected?: boolean }) {
  return (
    <div
      className={cn(
        "group flex min-w-[132px] max-w-[220px] flex-col gap-1 rounded-lg border bg-surface px-3 py-2 text-xs shadow-card transition-all duration-150 select-none",
        selected
          ? "border-accent shadow-[0_0_0_1px_rgba(108,123,255,0.5),0_4px_16px_rgba(108,123,255,0.18)]"
          : "border-border hover:border-border-strong hover:shadow-card-hover",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", langDot(data.type))} />
        <span className="truncate font-mono font-medium text-ink">{data.label}</span>
        <span className="ml-auto shrink-0 rounded bg-surface-muted px-1 py-0.5 font-mono text-[10px] leading-none text-text-muted">
          {langLabel(data.type)}
        </span>
      </div>
      <span className="truncate font-mono text-[11px] leading-tight text-text-muted">{data.path}</span>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-2 !border-surface !bg-border group-hover:!bg-accent"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-2 !border-surface !bg-border group-hover:!bg-accent"
      />
    </div>
  );
}

const nodeTypes = { file: FileNode as unknown as never };

// Deterministic layered layout by directory depth + alpha, no random scatter.
function layoutNodes(ids: string[]): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  const byDepth = new Map<number, string[]>();
  for (const id of ids) {
    const d = (id.match(/\//g) || []).length;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  const colGap = 260;
  const rowGap = 76;
  let x = 24;
  const sortedDepths = [...byDepth.keys()].sort((a, b) => a - b);
  for (const d of sortedDepths) {
    const col = byDepth.get(d)!.sort((a, b) => a.localeCompare(b));
    col.forEach((id, i) => m.set(id, { x, y: 24 + i * rowGap }));
    x += colGap;
  }
  return m;
}

function GraphInner({ repositoryId, snapshotId }: { repositoryId: string; snapshotId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomNode | null>(null);
  const [rawNodeCount, setRawNodeCount] = useState(0);
  const [rawEdgeCount, setRawEdgeCount] = useState(0);
  const { fitView } = useReactFlow();

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}/graph`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as Record<string, unknown>));
        throw new Error((j.error as string) || `Graph request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        nodes: { id: string; label: string; type: string; path: string }[];
        edges: { source: string; target: string }[];
      };
      const rawNodes = data.nodes ?? [];
      const rawEdges = data.edges ?? [];
      setRawNodeCount(rawNodes.length);
      setRawEdgeCount(rawEdges.length);
      if (rawNodes.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }
      const capped = rawNodes.length > 180 ? rawNodes.slice(0, 180) : rawNodes;
      const cappedIds = new Set(capped.map((n) => n.id));
      const pos = layoutNodes(capped.map((n) => n.id));
      const newNodes: CustomNode[] = capped.map((n) => ({
        id: n.id,
        position: pos.get(n.id)!,
        type: "file",
        data: { label: n.label, type: n.type, path: n.path },
      }));
      setNodes(newNodes);
      const newEdges: Edge[] = (rawEdges as { source: string; target: string }[])
        .filter((e) => cappedIds.has(e.source) && cappedIds.has(e.target))
        .map((e) => ({
          id: `${e.source}->${e.target}`,
          source: e.source,
          target: e.target,
          style: { stroke: "#3A4050", strokeWidth: 1.25 },
          animated: false,
        }));
      setEdges(newEdges);
      requestAnimationFrame(() => fitView({ padding: 0.18, duration: 300 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [repositoryId, fitView, setNodes, setEdges]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph, snapshotId]);

  const filteredIds = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return new Set(
      nodes
        .filter((n) => n.data.label.toLowerCase().includes(q) || n.data.path.toLowerCase().includes(q))
        .map((n) => n.id),
    );
  }, [nodes, query]);

  const visibleNodes = useMemo(() => {
    if (!filteredIds) return nodes;
    return nodes.map((n) => ({
      ...n,
      style: filteredIds.has(n.id) ? { opacity: 1 } : { opacity: 0.18 },
    }));
  }, [nodes, filteredIds]);

  const onNodeClick = useCallback((_: unknown, n: Node) => setSelected(n as CustomNode), []);
  const onPaneClick = useCallback(() => setSelected(null), []);

  if (loading) {
    return (
      <div className="flex h-[62vh] min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden />
        <p className="text-sm text-text-muted">Building architecture graph…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-[62vh] min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-error/30 bg-error/5 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-error" />
        <p className="max-w-md text-sm font-medium text-text">Couldn&apos;t load the architecture graph</p>
        <p className="max-w-md text-sm text-text-muted">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchGraph}>
          Retry
        </Button>
      </div>
    );
  }
  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-10 w-10" />}
        title="No architecture data yet"
        description={
          rawNodeCount === 0
            ? "Codexa hasn't indexed any files for this snapshot yet. Re-index from the repository header to populate the graph."
            : "No import edges were detected — this codebase may not use relative imports Codexa can resolve yet."
        }
      />
    );
  }

  const incoming = selected ? edges.filter((e) => e.target === selected.id).length : 0;
  const outgoing = selected ? edges.filter((e) => e.source === selected.id).length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-2 py-1.5 shadow-card backdrop-blur">
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter files…"
              className="w-36 bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none sm:w-44"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-xs text-text-muted hover:text-text">
                Clear
              </button>
            )}
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text-muted sm:inline-flex">
            <Layers className="h-3 w-3" /> {rawNodeCount} files · {rawEdgeCount} edges{" "}
            {rawNodeCount > 180 && <span className="text-warning">(showing 180)</span>}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fitView({ padding: 0.18, duration: 260 })}
              className="h-8 gap-1.5"
            >
              <Maximize2 className="h-3.5 w-3.5" /> Fit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelected(null);
                fitView({ padding: 0.18, duration: 260 });
              }}
              className="h-8 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </div>

        <ReactFlow
          nodes={visibleNodes as unknown as CustomNode[]}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          attributionPosition="bottom-right"
          proOptions={{ hideAttribution: false }}
          className="[&_.react-flow__attribution]:!bg-surface/80 [&_.react-flow__attribution]:!text-text-muted"
        >
          <Background gap={20} size={1} color="#2A3040" style={{ opacity: 0.9 }} />
          <Controls
            position="bottom-left"
            className="!border-border !bg-surface !shadow-card [&_button]:!border-border [&_button]:!bg-surface [&_button]:!text-text-muted hover:[&_button]:!bg-surface-hover"
          />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            className="!border-border !bg-surface"
            maskColor="rgba(16,19,26,0.6)"
            nodeColor={() => "#6C7BFF"}
          />
          <Panel position="bottom-center" className="!m-0 mb-2 rounded-full border border-border bg-surface/90 px-3 py-1 text-xs text-text-muted shadow-card backdrop-blur">
            Click a node for details · drag to pan · scroll to zoom
          </Panel>
        </ReactFlow>
      </div>

      <div className="min-h-[220px] rounded-xl border border-border bg-surface p-4 shadow-card lg:h-[62vh] lg:min-h-[420px] lg:overflow-auto">
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
                  <FileCode className="h-3.5 w-3.5" /> Selected file
                </p>
                <p className="mt-1 break-all font-mono text-sm font-medium text-text">{selected.data.path}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {selected.data.type}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <p className="text-xs text-text-muted">Incoming</p>
                <p className="mt-1 font-mono text-lg font-medium text-text">{incoming}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <p className="text-xs text-text-muted">Outgoing</p>
                <p className="mt-1 font-mono text-lg font-medium text-text">{outgoing}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted">Depends on</p>
              {edges.filter((e) => e.source === selected.id).length === 0 ? (
                <p className="text-sm text-text-muted">No outgoing imports detected.</p>
              ) : (
                <ul className="space-y-1">
                  {edges
                    .filter((e) => e.source === selected.id)
                    .slice(0, 12)
                    .map((e) => (
                      <li key={e.id} className="truncate rounded bg-surface-muted px-2 py-1 font-mono text-xs text-text-muted">
                        {e.target as string}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted">Imported by</p>
              {edges.filter((e) => e.target === selected.id).length === 0 ? (
                <p className="text-sm text-text-muted">No incoming imports detected.</p>
              ) : (
                <ul className="space-y-1">
                  {edges
                    .filter((e) => e.target === selected.id)
                    .slice(0, 12)
                    .map((e) => (
                      <li key={e.id} className="truncate rounded bg-surface-muted px-2 py-1 font-mono text-xs text-text-muted">
                        {e.source as string}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setSelected(null)}>
              Clear selection
            </Button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted">
              <Network className="h-5 w-5 text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text">Select a node</p>
            <p className="max-w-[22ch] text-sm leading-relaxed text-text-muted">
              Click any file to inspect its imports, dependents, and path. Use the filter to narrow large repositories.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ArchitectureGraph(props: { repositoryId: string; snapshotId: string }) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
