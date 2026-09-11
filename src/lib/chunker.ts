import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { RepoFile } from "@/lib/github";
import { analyzeFile, type ExtractedSymbol } from "@/lib/symbolExtractor";

export interface ChunkMetadata {
  path: string;
  repo: string;
  language?: string | null;
  symbolName?: string;
  symbolType?: string;
  startLine?: number;
  endLine?: number;
}

export interface Chunk {
  pageContent: string;
  metadata: ChunkMetadata;
}

export interface ChunkedFile {
  path: string;
  language: string | null;
  contentHash: string;
  symbols: ExtractedSymbol[];
  imports: string[];
  chunks: Chunk[];
}

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });
const MAX_SYMBOL_CHUNK_CHARS = 4000;

function sliceLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split("\n");
  return lines.slice(Math.max(0, startLine - 1), endLine).join("\n");
}

async function chunkPlain(content: string, base: ChunkMetadata): Promise<Chunk[]> {
  const docs = await splitter.createDocuments([content]);
  return docs.map((d) => ({ pageContent: d.pageContent, metadata: { ...base } }));
}

async function chunkBySymbol(content: string, base: ChunkMetadata, symbol: ExtractedSymbol): Promise<Chunk[]> {
  const text = sliceLines(content, symbol.startLine, symbol.endLine);
  const meta: ChunkMetadata = {
    ...base,
    symbolName: symbol.parentSymbol ? `${symbol.parentSymbol}.${symbol.name}` : symbol.name,
    symbolType: symbol.symbolType,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
  };

  if (text.length <= MAX_SYMBOL_CHUNK_CHARS) {
    return [{ pageContent: text, metadata: meta }];
  }
  const docs = await splitter.createDocuments([text]);
  return docs.map((d) => ({ pageContent: d.pageContent, metadata: meta }));
}

/**
 * Semantic chunking: one chunk per top-level symbol (function/class/interface/
 * type/route) with line-range metadata for precise citations. Gaps between
 * symbols (imports, top-level config, etc.) are captured too, so context
 * outside a function body isn't silently dropped. Files with no extractable
 * symbols (unsupported language, or a parse failure) fall back to the
 * original plain recursive-character split.
 */
export async function analyzeAndChunkFile(file: RepoFile, repo: string): Promise<ChunkedFile> {
  const { language, contentHash, symbols, imports } = await analyzeFile(file.path, file.content);
  const base: ChunkMetadata = { path: file.path, repo, language };

  const topLevel = symbols.filter((s: ExtractedSymbol) => s.symbolType !== "method").sort((a: ExtractedSymbol, b: ExtractedSymbol) => a.startLine - b.startLine);

  if (topLevel.length === 0) {
    const chunks = await chunkPlain(file.content, base);
    return { path: file.path, language, contentHash, symbols, imports, chunks };
  }

  const chunks: Chunk[] = [];
  const lines = file.content.split("\n");
  let cursor = 1;

  for (const symbol of topLevel) {
    if (symbol.startLine > cursor) {
      const gap = sliceLines(file.content, cursor, symbol.startLine - 1).trim();
      if (gap.length > 0) chunks.push(...(await chunkPlain(gap, base)));
    }
    chunks.push(...(await chunkBySymbol(file.content, base, symbol)));
    cursor = Math.max(cursor, symbol.endLine + 1);
  }

  if (cursor <= lines.length) {
    const tail = sliceLines(file.content, cursor, lines.length).trim();
    if (tail.length > 0) chunks.push(...(await chunkPlain(tail, base)));
  }

  return { path: file.path, language, contentHash, symbols, imports, chunks };
}

export async function chunkFiles(files: RepoFile[], repo: string): Promise<ChunkedFile[]> {
  const results: ChunkedFile[] = [];
  for (const file of files) {
    results.push(await analyzeAndChunkFile(file, repo));
  }
  return results;
}
