import { ChatOpenAI } from "@langchain/openai";
import { hybridSearch, type HybridSearchResult } from "@/lib/hybridSearch";
import type { PlannedPage } from "@/lib/wiki/planner";

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("");
  }
  return String(content ?? "");
}

export interface WrittenPage {
  slug: string;
  title: string;
  content: string;
  sources: { path: string; startLine?: number; endLine?: number }[];
}

const WIKI_WRITER_TOPK = 10;

export async function writeWikiPage(repositoryId: string, repoKey: string, page: PlannedPage): Promise<WrittenPage> {
  const docs = await hybridSearch(repositoryId, repoKey, page.query, WIKI_WRITER_TOPK);

  if (!docs.length) {
    return {
      slug: page.slug,
      title: page.title,
      content: `_Not enough indexed content was found to generate this page yet._`,
      sources: [],
    };
  }

  const context = docs
    .map((doc: HybridSearchResult) => {
      const label = doc.metadata.symbolName ? `${doc.metadata.path} (${doc.metadata.symbolName})` : doc.metadata.path;
      return `File: ${label}\n${doc.pageContent}`;
    })
    .join("\n\n---\n\n");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 });
  const response = await llm.invoke(
    [
      "You are writing one page of technical documentation for a software repository's wiki.",
      `Page title: "${page.title}"`,
      "Use ONLY the source snippets below — do not invent behavior that isn't shown.",
      "Write in clear, direct technical prose with markdown headings where useful.",
      "When you reference a specific file, mention its path inline (e.g. `src/auth/auth.service.js`).",
      "If the sources don't fully cover the topic, say plainly what's missing rather than guessing.",
      "",
      "Sources:",
      context,
    ].join("\n"),
  );

  const seen = new Set<string>();
  const sources = docs
    .filter((doc) => {
      if (!doc.metadata.path) return false;
      const key = `${doc.metadata.path}:${doc.metadata.startLine ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((doc) => ({ path: doc.metadata.path as string, startLine: doc.metadata.startLine, endLine: doc.metadata.endLine }));

  return { slug: page.slug, title: page.title, content: toText(response.content), sources };
}
