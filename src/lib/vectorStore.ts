import { createHash } from "node:crypto";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import type { Chunk } from "@/lib/chunker";

export interface EmbeddingsProvider {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface VectorStore {
  saveChunks(repo: string, documents: Chunk[]): Promise<{ saved: boolean; chunkCount: number }>;
  search(repo: string, question: string, topK?: number): Promise<SearchResult[]>;
  searchByVector(repo: string, vector: number[], topK?: number, filter?: Record<string, unknown>): Promise<SearchResult[]>;
  deleteNamespace(repo: string): Promise<void>;
}

export interface SearchResult {
  pageContent: string;
  metadata: {
    path?: string;
    repo?: string;
    symbolName?: string;
    symbolType?: string;
    startLine?: number;
    endLine?: number;
  };
  score?: number;
}

const UPSERT_BATCH_SIZE = 100;
const DEFAULT_TOP_K = 5;

// Must match the dimension of your Pinecone index. Override via env if you
// provision the index at a different size (e.g. 1536 for the untruncated
// text-embedding-3-small/large output).
const DEFAULT_EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 512);

export class OpenAIEmbeddingsProvider implements EmbeddingsProvider {
  private embeddings: OpenAIEmbeddings;

  constructor(
    model = "text-embedding-3-small",
    dimensions = DEFAULT_EMBEDDING_DIMENSIONS
  ) {
    this.embeddings = new OpenAIEmbeddings({ model, dimensions });
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }
}

function repoToNamespace(repo: string): string {
  return repo.replace("/", "-");
}

function getPineconeClient() {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY not configured");
  }
  return new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
}

function getIndex(namespace: string) {
  const indexName = process.env.PINECONE_INDEX || "git-wiki";
  return getPineconeClient().index({ name: indexName }).namespace(namespace);
}

function buildRecordId(repo: string, path: string | undefined, content: string) {
  return createHash("sha256").update(`${repo}:${path ?? ""}:${content}`).digest("hex");
}

function toSearchResult(match: { metadata?: Record<string, unknown>; score?: number }): SearchResult {
  return {
    pageContent: (match.metadata?.text as string) ?? "",
    metadata: {
      path: match.metadata?.path as string | undefined,
      repo: match.metadata?.repo as string | undefined,
      symbolName: match.metadata?.symbolName as string | undefined,
      symbolType: match.metadata?.symbolType as string | undefined,
      startLine: match.metadata?.startLine as number | undefined,
      endLine: match.metadata?.endLine as number | undefined,
    },
    score: match.score,
  };
}

export class PineconeVectorStore implements VectorStore {
  constructor(private embeddings: EmbeddingsProvider = new OpenAIEmbeddingsProvider()) {}

  async saveChunks(repo: string, documents: Chunk[]): Promise<{ saved: boolean; chunkCount: number }> {
    const chunks = documents.filter((d) => d.pageContent.trim().length > 0);
    if (!chunks.length) return { saved: false, chunkCount: 0 };

    const namespace = repoToNamespace(repo);
    const index = getIndex(namespace);
    const texts = chunks.map((d) => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);

    const records = chunks.map((doc, i) => ({
      id: buildRecordId(repo, doc.metadata.path, doc.pageContent),
      values: vectors[i],
      metadata: {
        text: doc.pageContent,
        path: doc.metadata.path,
        repo: doc.metadata.repo ?? repo,
        ...(doc.metadata.language ? { language: doc.metadata.language } : {}),
        ...(doc.metadata.symbolName ? { symbolName: doc.metadata.symbolName } : {}),
        ...(doc.metadata.symbolType ? { symbolType: doc.metadata.symbolType } : {}),
        ...(doc.metadata.startLine != null ? { startLine: doc.metadata.startLine } : {}),
        ...(doc.metadata.endLine != null ? { endLine: doc.metadata.endLine } : {}),
      },
    }));

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      await index.upsert({ records: records.slice(i, i + UPSERT_BATCH_SIZE) });
    }

    return { saved: true, chunkCount: chunks.length };
  }

  async search(repo: string, question: string, topK = DEFAULT_TOP_K): Promise<SearchResult[]> {
    const vector = await this.embeddings.embedQuery(question);
    return this.searchByVector(repo, vector, topK);
  }

  async searchByVector(
    repo: string,
    vector: number[],
    topK = DEFAULT_TOP_K,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    const namespace = repoToNamespace(repo);
    const index = getIndex(namespace);

    const response = await index.query({
      vector,
      topK,
      includeMetadata: true,
      ...(filter ? { filter } : {}),
    });

    return (response.matches ?? []).map(toSearchResult).filter((doc) => doc.pageContent.trim().length > 0);
  }

  async deleteNamespace(repo: string): Promise<void> {
    const namespace = repoToNamespace(repo);
    const index = getIndex(namespace);
    try {
      await index.deleteAll();
    } catch (error) {
      console.warn(`Failed to delete Pinecone namespace ${namespace}:`, error);
    }
  }
}

let vectorStoreInstance: VectorStore | null = null;
let embeddingsProviderInstance: EmbeddingsProvider | null = null;

export function getVectorStore(): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = createVectorStore();
  }
  return vectorStoreInstance;
}

export function getEmbeddingsProvider(): EmbeddingsProvider {
  if (!embeddingsProviderInstance) {
    embeddingsProviderInstance = createEmbeddingsProvider();
  }
  return embeddingsProviderInstance;
}

function createEmbeddingsProvider(): EmbeddingsProvider {
  const provider = process.env.EMBEDDINGS_PROVIDER || "openai";
  switch (provider) {
    case "openai":
      return new OpenAIEmbeddingsProvider();
    default:
      console.warn(`Unknown embeddings provider: ${provider}, falling back to OpenAI`);
      return new OpenAIEmbeddingsProvider();
  }
}

function createVectorStore(): VectorStore {
  const provider = process.env.VECTOR_STORE_PROVIDER || "pinecone";
  const embeddings = getEmbeddingsProvider();

  switch (provider) {
    case "pinecone":
      return new PineconeVectorStore(embeddings);
    default:
      console.warn(`Unknown vector store provider: ${provider}, falling back to Pinecone`);
      return new PineconeVectorStore(embeddings);
  }
}

// Backward compatibility exports
export async function saveChunks(repo: string, documents: Chunk[]) {
  return getVectorStore().saveChunks(repo, documents);
}

export async function search(repo: string, question: string, topK = DEFAULT_TOP_K): Promise<SearchResult[]> {
  return getVectorStore().search(repo, question, topK);
}

export async function searchByVector(
  repo: string,
  vector: number[],
  topK = DEFAULT_TOP_K,
  filter?: Record<string, unknown>
): Promise<SearchResult[]> {
  return getVectorStore().searchByVector(repo, vector, topK, filter);
}

export async function deleteNamespace(repo: string): Promise<void> {
  return getVectorStore().deleteNamespace(repo);
}

export async function embedQuery(question: string): Promise<number[]> {
  return getEmbeddingsProvider().embedQuery(question);
}