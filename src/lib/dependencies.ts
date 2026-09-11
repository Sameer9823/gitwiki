import { prisma } from "@/lib/prisma";

export interface ImportEdge {
  fromFile: string;
  toFile: string;
  importSpecifier: string;
}

/**
 * Resolve a raw import specifier to a repository file path.
 * Handles relative imports (./foo, ../bar) and skips external packages.
 * Returns the normalized base path; caller must try candidate extensions.
 */
export function resolveImport(importerPath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    const dir = importerPath.slice(0, importerPath.lastIndexOf("/") + 1);
    let target = dir + specifier;
    const parts = target.split("/");
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "..") resolved.pop();
      else if (part && part !== ".") resolved.push(part);
    }
    target = resolved.join("/");
    // If it already has an extension, return as-is
    if (target.includes(".")) return target;
    // Bare import without extension — return the base; the caller (buildImportGraph)
    // will try index and extension candidates against the actual file set.
    return target;
  }
  return null;
}

/**
 * Return ordered candidate file paths for a bare (extension-less) import.
 * Tries directory-index files first, then sibling file extensions — mirrors
 * how Node/TS resolution works and ensures the first match in pathSet is preferred.
 */
export function resolveImportCandidates(importerPath: string, specifier: string): string[] {
  const base = resolveImport(importerPath, specifier);
  if (!base) return [];
  if (base.includes(".")) return [base];
  const candidates: string[] = [];
  for (const ext of ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"]) candidates.push(base + ext);
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) candidates.push(base + ext);
  return candidates;
}

/**
 * Build the file-level import graph for a snapshot.
 * Returns edges { fromFile, toFile, importSpecifier }.
 */
export async function buildImportGraph(snapshotId: string): Promise<ImportEdge[]> {
  const files = await prisma.repositoryFile.findMany({
    where: { snapshotId },
    select: { path: true, imports: true },
  });

  const pathSet = new Set(files.map((f: { path: string }) => f.path));
  const edges: ImportEdge[] = [];

  for (const file of files) {
    for (const spec of file.imports ?? []) {
      const candidates = resolveImportCandidates(file.path, spec);
      for (const target of candidates) {
        if (pathSet.has(target)) {
          edges.push({ fromFile: file.path, toFile: target, importSpecifier: spec });
          break;
        }
      }
      // Fallback: extension-bearing imports that resolveImport handles directly
      if (candidates.length === 0) {
        const direct = resolveImport(file.path, spec);
        if (direct && pathSet.has(direct)) {
          edges.push({ fromFile: file.path, toFile: direct, importSpecifier: spec });
        }
      }
    }
  }

  return edges;
}

/**
 * Compute transitive reverse dependencies (importers) for a set of changed files.
 * Returns all files that (directly or indirectly) import any changed file.
 */
export async function computeImpact(
  snapshotId: string,
  changedFiles: string[],
  maxDepth = 5
): Promise<{ impactedFiles: string[]; importersByFile: Record<string, string[]> }> {
  const edges = await buildImportGraph(snapshotId);

  // adjacency: toFile -> fromFile (reverse for impact)
  const revAdj: Record<string, string[]> = {};
  for (const e of edges) {
    (revAdj[e.toFile] ??= []).push(e.fromFile);
  }

  const impacted = new Set<string>(changedFiles);
  const importersByFile: Record<string, string[]> = {};

  for (const changed of changedFiles) {
    const queue: [string, number][] = [[changed, 0]];
    const visited = new Set<string>(changedFiles);

    while (queue.length) {
      const [file, depth] = queue.shift()!;
      if (depth >= maxDepth) continue;

      const directImporters = revAdj[file] ?? [];
      for (const imp of directImporters) {
        if (!visited.has(imp)) {
          visited.add(imp);
          impacted.add(imp);
          queue.push([imp, depth + 1]);
        }
        (importersByFile[file] ??= []).push(imp);
      }
    }
  }

  return { impactedFiles: [...impacted], importersByFile };
}

/**
 * Find wiki pages whose sources overlap with a set of file paths.
 */
export async function findAffectedWikiPages(repositoryId: string, filePaths: string[]): Promise<string[]> {
  const pages = await prisma.wikiPage.findMany({
    where: { repositoryId },
    include: { sources: true },
  });

  const fileSet = new Set(filePaths);
  return pages
    .filter((p: { sources: Array<{ path: string }> }) => p.sources.some((s: { path: string }) => fileSet.has(s.path)))
    .map((p: { slug: string }) => p.slug);
}