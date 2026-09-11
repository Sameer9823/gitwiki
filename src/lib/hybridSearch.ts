import { prisma } from "@/lib/prisma";
import { embedQuery, searchByVector, type SearchResult } from "@/lib/vectorStore";

// Matches camelCase/PascalCase/snake_case identifiers and file-path-like tokens
// ("auth.service.js", "src/routes/login.js") — the exact symbol names, paths,
// and routes the product brief calls out as high-value search signals.
const IDENTIFIER_PATTERN = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\b/g;

function extractCandidates(question: string): string[] {
  const matches = question.match(IDENTIFIER_PATTERN) ?? [];
  const candidates = matches.filter((token) => {
    if (token.length < 4) return false;
    const isCamelOrSnake = /[A-Z]/.test(token) || token.includes("_") || token.includes(".");
    return isCamelOrSnake;
  });
  return [...new Set(candidates)].slice(0, 8);
}

export interface KeywordMatch {
  path: string;
  symbolName?: string;
}

async function findKeywordMatches(repositoryId: string, candidates: string[]): Promise<KeywordMatch[]> {
  if (candidates.length === 0) return [];

  const [symbolHits, fileHits] = await Promise.all([
    prisma.repositorySymbol.findMany({
      where: {
        file: { repositoryId },
        OR: candidates.map((c) => ({ name: { contains: c, mode: "insensitive" as const } })),
      },
      include: { file: true },
      take: 5,
    }),
    prisma.repositoryFile.findMany({
      where: {
        repositoryId,
        OR: candidates.map((c) => ({ path: { contains: c, mode: "insensitive" as const } })),
      },
      take: 5,
    }),
  ]);

  const matches: KeywordMatch[] = [
    ...symbolHits.map((s: { file: { path: string }; name: string }) => ({ path: s.file.path, symbolName: s.name })),
    ...fileHits.map((f: { path: string }) => ({ path: f.path })),
  ];

  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.path}:${m.symbolName ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface HybridSearchResult extends SearchResult {
  matchedVia: "keyword" | "vector";
}

/**
 * Question → Query Understanding (candidate identifiers) → keyword-anchored
 * lookup (Postgres symbols/paths → Pinecone metadata filter, guaranteed
 * inclusion) + vector search (semantic) → merged, deduped context.
 * Falls back to pure vector search when the repository has no symbol data
 * yet (Phase 1 snapshots, or files with no extractable symbols).
 */
export async function hybridSearch(
  repositoryId: string,
  repoKey: string,
  question: string,
  topK = 5,
): Promise<HybridSearchResult[]> {
  const vector = await embedQuery(question);
  const candidates = extractCandidates(question);
  const keywordMatches = await findKeywordMatches(repositoryId, candidates);

  const results: HybridSearchResult[] = [];
  const seenKeys = new Set<string>();

  const addAll = (docs: SearchResult[], matchedVia: HybridSearchResult["matchedVia"]) => {
    for (const doc of docs) {
      const key = `${doc.metadata.path}:${doc.metadata.startLine ?? ""}:${doc.pageContent.slice(0, 40)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      results.push({ ...doc, matchedVia });
    }
  };

  for (const match of keywordMatches.slice(0, 3)) {
    const filter = match.symbolName ? { path: { $eq: match.path }, symbolName: { $eq: match.symbolName } } : { path: { $eq: match.path } };
    const docs = await searchByVector(repoKey, vector, 2, filter);
    addAll(docs, "keyword");
  }

  const semanticDocs = await searchByVector(repoKey, vector, topK);
  addAll(semanticDocs, "vector");

  return results.slice(0, topK + keywordMatches.length);
}
