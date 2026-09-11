import { ChatOpenAI } from "@langchain/openai";
import { hybridSearch } from "@/lib/hybridSearch";

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("");
  }
  return String(content ?? "");
}

export interface Citation {
  path: string;
  symbolName?: string;
  startLine?: number;
  endLine?: number;
}

export interface AskResult {
  answer: string;
  sources: string[];
  citations: Citation[];
}

function formatSource(c: Citation): string {
  const location = c.startLine && c.endLine ? `${c.path}:${c.startLine}-${c.endLine}` : c.path;
  return c.symbolName ? `${location} — ${c.symbolName}` : location;
}

async function buildContextAndCitations(repositoryId: string, repoKey: string, question: string, topK = 5) {
  const docs = await hybridSearch(repositoryId, repoKey, question, topK);
  if (!docs.length) {
    return { context: "", citations: [] as Citation[], sources: [] as string[] };
  }
  const context = docs
    .map((doc) => {
      const label = doc.metadata.symbolName ? `${doc.metadata.path} (${doc.metadata.symbolName})` : doc.metadata.path;
      return `File: ${label}\n${doc.pageContent}`;
    })
    .join("\n\n");
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    if (!doc.metadata.path) continue;
    const key = `${doc.metadata.path}:${doc.metadata.symbolName ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      path: doc.metadata.path,
      symbolName: doc.metadata.symbolName,
      startLine: doc.metadata.startLine,
      endLine: doc.metadata.endLine,
    });
  }
  const sources = citations.map(formatSource);
  return { context, citations, sources };
}

function isGreetingQuestion(q: string): boolean {
  return /^(hi+|hello|hey|hihi|thanks|thank you|how are you|hey there|hi there)[\s!.?]*$/i.test(q.trim());
}

export async function askQuestion(repositoryId: string, repoKey: string, question: string, topK = 5): Promise<AskResult> {
  const greeting = isGreetingQuestion(question);
  const { context, citations, sources } = await buildContextAndCitations(repositoryId, repoKey, question, topK);

  if (!context) {
    if (greeting) {
      const llm = new ChatOpenAI({ model: "gpt-4o-mini" });
      const prompt = `You are Codexa for ${repoKey}. Greet warmly in one short paragraph and offer help exploring the repo. Question: ${question}`;
      const response = await llm.invoke(prompt);
      return { answer: toText(response.content), sources: [], citations: [] };
    }
    return {
      answer: "No indexed content was found for this repo. Index it first, then try again.",
      sources: [],
      citations: [],
    };
  }

  const systemHint = greeting
    ? `You are Codexa for ${repoKey}. Greet warmly in one short paragraph and offer help exploring the repo.`
    : `You are Codexa for "${repoKey}". Answer using the repository context. If the context lacks the answer, say so clearly and suggest where to look. Be concise, use markdown.`;

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });
  const response = await llm.invoke(`${systemHint}\n\n--- Repository context ---\n${context}\n\n--- Question ---\n${question}`);
  return { answer: toText(response.content), sources, citations };
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onSources?: (sources: string[]) => void;
  onCitations?: (citations: Citation[]) => void;
  onComplete?: (answer: string) => void;
  onError?: (error: Error) => void;
}

export async function askQuestionStream(
  repositoryId: string,
  repoKey: string,
  question: string,
  topK = 5,
  callbacks?: StreamCallbacks
): Promise<AskResult> {
  const greeting = isGreetingQuestion(question);
  const { context, citations, sources } = await buildContextAndCitations(repositoryId, repoKey, question, topK);

  callbacks?.onSources?.(sources);
  callbacks?.onCitations?.(citations);

  if (!context) {
    if (greeting) {
      const llm = new ChatOpenAI({ model: "gpt-4o-mini", streaming: true });
      const prompt = `You are Codexa, a friendly codebase intelligence assistant for ${repoKey}. Greet the user warmly in one short paragraph and offer help exploring the repository. Do not mention missing context. Question: ${question}`;
      let fullAnswer = "";
      const stream = await llm.stream(prompt);
      for await (const chunk of stream) {
        const token = toText(chunk.content);
        if (token) {
          fullAnswer += token;
          callbacks?.onToken?.(token);
        }
      }
      callbacks?.onComplete?.(fullAnswer);
      return { answer: fullAnswer, sources: [], citations: [] };
    }
    const answer = "No indexed content was found for this repo. Index it first, then try again.";
    callbacks?.onComplete?.(answer);
    return { answer, sources: [], citations: [] };
  }

  const systemHint = greeting
    ? `You are Codexa, a friendly codebase intelligence assistant for ${repoKey}. Greet the user warmly in one short paragraph and offer help exploring the repository. Do not mention missing context.`
    : `You are Codexa, a senior engineer answering about the repository "${repoKey}".\nAnswer using the repository context below. Be concise and accurate.\n- For technical questions: use the context. If the context does not contain the answer, say clearly: "I couldn't find that in the indexed code — try rephrasing or checking..." and suggest where to look.\n- Never invent file paths or code that is not in the context.\n- Use markdown and fenced code blocks where helpful.`;

  const prompt = `${systemHint}\n\n--- Repository context ---\n${context}\n\n--- Question ---\n${question}`;

  // Single streaming path — deltas only. Never use callbacks + stream iteration both.
  const llm = new ChatOpenAI({ model: "gpt-4o-mini", streaming: true });
  let fullAnswer = "";
  const stream = await llm.stream(prompt);
  for await (const chunk of stream) {
    const token = toText(chunk.content);
    if (token) {
      fullAnswer += token;
      callbacks?.onToken?.(token);
    }
  }
  callbacks?.onComplete?.(fullAnswer);
  return { answer: fullAnswer, sources, citations };
}
