import { ChatOpenAI } from "@langchain/openai";
import { hybridSearch, type HybridSearchResult } from "@/lib/hybridSearch";
import type { PlannedPage } from "@/lib/wiki/planner";
import { critiquePage } from "@/lib/wiki/critic";

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
  /** Whether the critic flagged the first draft and a revision was attempted. */
  revised: boolean;
  /** Issues the critic raised on the first draft, if any (present even if a revision was attempted). */
  critiqueIssues: string[];
}

const WIKI_WRITER_TOPK = 10;

function writerPrompt(pageTitle: string, context: string, revisionNote?: string): string {
  return [
    "You are writing one page of technical documentation for a software repository's wiki.",
    `Page title: "${pageTitle}"`,
    "Use ONLY the source snippets below — do not invent behavior that isn't shown.",
    "Write in clear, direct technical prose with markdown headings where useful.",
    "When you reference a specific file, mention its path inline (e.g. `src/auth/auth.service.js`).",
    "If the sources don't fully cover the topic, say plainly what's missing rather than guessing.",
    ...(revisionNote
      ? [
          "",
          "A reviewer checked your previous draft against these same sources and found issues. Revise the page to fix them — still using ONLY the sources below:",
          revisionNote,
        ]
      : []),
    "",
    "Sources:",
    context,
  ].join("\n");
}

export async function writeWikiPage(repositoryId: string, repoKey: string, page: PlannedPage): Promise<WrittenPage> {
  const docs = await hybridSearch([repositoryId], [repoKey], page.query, WIKI_WRITER_TOPK);

  if (!docs.length) {
    return {
      slug: page.slug,
      title: page.title,
      content: `_Not enough indexed content was found to generate this page yet._`,
      sources: [],
      revised: false,
      critiqueIssues: [],
    };
  }

  const context = docs
    .map((doc: HybridSearchResult) => {
      const label = doc.metadata.symbolName ? `${doc.metadata.path} (${doc.metadata.symbolName})` : doc.metadata.path;
      return `File: ${label}\n${doc.pageContent}`;
    })
    .join("\n\n---\n\n");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 });
  const draftResponse = await llm.invoke(writerPrompt(page.title, context));
  let content = toText(draftResponse.content);

  let revised = false;
  let critiqueIssues: string[] = [];

  const criticEnabled = process.env.WIKI_CRITIC_ENABLED !== "false";
  if (criticEnabled) {
    // One review pass, one revision attempt — a critique/revise loop that
    // kept going could double or triple the LLM calls per page for
    // diminishing returns, so this is deliberately capped at a single round.
    const critique = await critiquePage(page.title, context, content);
    critiqueIssues = critique.issues;
    if (!critique.approved && critique.issues.length > 0) {
      const revisionResponse = await llm.invoke(
        writerPrompt(page.title, context, critique.issues.map((i) => `- ${i}`).join("\n"))
      );
      content = toText(revisionResponse.content);
      revised = true;
    }
  }

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

  return { slug: page.slug, title: page.title, content, sources, revised, critiqueIssues };
}
