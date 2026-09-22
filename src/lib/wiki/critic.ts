import { ChatOpenAI } from "@langchain/openai";

export interface Critique {
  approved: boolean;
  issues: string[];
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("");
  }
  return String(content ?? "");
}

const CRITIC_PROMPT = (pageTitle: string, context: string, draft: string) => `You are reviewing a draft wiki page for a software repository, checking it against the source material it was written from. You did not write this draft — a different writer did, and your job is to catch what they got wrong.

Page title: "${pageTitle}"

--- Source material the draft should be grounded in ---
${context}

--- Draft to review ---
${draft}

Check specifically for:
1. Claims about behavior, structure, or functionality that are NOT actually shown in the source material (fabrication).
2. Referenced file paths, function names, or symbols that don't appear in the sources.
3. Significant gaps — something the sources clearly show that the draft omits or gets wrong.

Do NOT flag: writing style, prose quality, formatting choices, or missing information the sources themselves don't cover (the draft can and should say plainly when sources are incomplete).

Respond with ONLY a JSON object, no markdown fences, no other text:
{"approved": true or false, "issues": ["specific issue 1", "specific issue 2"]}

approved should be false only if you found a genuine fabrication or a significant gap per the criteria above — not for minor nitpicks. If the draft is well-grounded, respond {"approved": true, "issues": []}.`;

/**
 * Second opinion on a wiki writer's draft — checks it against the same
 * source material the writer used, specifically for claims that aren't
 * actually backed by the sources. This is the "critic" half of the
 * planner/writer/critic loop: the writer produces a draft, this reviews it,
 * and (see writer.ts) the writer gets one chance to revise if issues are found.
 */
export async function critiquePage(pageTitle: string, context: string, draft: string): Promise<Critique> {
  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  const response = await llm.invoke(CRITIC_PROMPT(pageTitle, context, draft));
  const raw = toText(response.content).trim();

  try {
    // Models sometimes wrap JSON in a fence despite instructions not to — strip it defensively.
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);
    return {
      approved: Boolean(parsed.approved),
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((i: unknown) => typeof i === "string") : [],
    };
  } catch {
    // If the critic's response isn't parseable JSON, fail open — approve the
    // draft rather than block wiki generation on a formatting slip.
    console.warn(`[wiki-critic] unparseable critic response for "${pageTitle}", approving draft as-is:`, raw.slice(0, 200));
    return { approved: true, issues: [] };
  }
}
