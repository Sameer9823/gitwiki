// Tests for the critique/revise loop in src/lib/wiki/writer.ts.
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn(),
}));

jest.mock("@/lib/hybridSearch", () => ({
  hybridSearch: jest.fn(),
}));

jest.mock("@/lib/wiki/critic", () => ({
  critiquePage: jest.fn(),
}));

import { ChatOpenAI } from "@langchain/openai";
import { hybridSearch } from "@/lib/hybridSearch";
import { critiquePage } from "@/lib/wiki/critic";
import { writeWikiPage } from "@/lib/wiki/writer";

const page = { slug: "overview", title: "Overview", query: "What does this project do?" };

function mockWriterLlm(responses: string[]) {
  const invoke = jest.fn();
  responses.forEach((r) => invoke.mockResolvedValueOnce({ content: r }));
  (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({ invoke }));
  return invoke;
}

describe("writeWikiPage", () => {
  const originalEnv = process.env.WIKI_CRITIC_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WIKI_CRITIC_ENABLED;
    (hybridSearch as jest.Mock).mockResolvedValue([
      { pageContent: "function login() { ... }", metadata: { path: "src/auth.ts", startLine: 1, endLine: 5, symbolName: "login" } },
    ]);
  });

  afterAll(() => {
    process.env.WIKI_CRITIC_ENABLED = originalEnv;
  });

  test("returns a placeholder with no LLM calls when hybridSearch finds nothing", async () => {
    (hybridSearch as jest.Mock).mockResolvedValue([]);
    const invoke = mockWriterLlm(["should not be called"]);

    const result = await writeWikiPage("repo-1", "owner/repo", page);

    expect(result.content).toContain("Not enough indexed content");
    expect(result.sources).toEqual([]);
    expect(result.revised).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  test("does not revise when the critic approves the first draft", async () => {
    const invoke = mockWriterLlm(["This is the first draft."]);
    (critiquePage as jest.Mock).mockResolvedValue({ approved: true, issues: [] });

    const result = await writeWikiPage("repo-1", "owner/repo", page);

    expect(result.content).toBe("This is the first draft.");
    expect(result.revised).toBe(false);
    expect(result.critiqueIssues).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1); // writer only, no revision call
  });

  test("revises once when the critic flags issues, and returns the revised content", async () => {
    const invoke = mockWriterLlm(["First draft with a made-up claim.", "Revised draft, claim removed."]);
    (critiquePage as jest.Mock).mockResolvedValue({
      approved: false,
      issues: ["claims the project supports OAuth but sources only show session-based login"],
    });

    const result = await writeWikiPage("repo-1", "owner/repo", page);

    expect(result.content).toBe("Revised draft, claim removed.");
    expect(result.revised).toBe(true);
    expect(result.critiqueIssues).toEqual(["claims the project supports OAuth but sources only show session-based login"]);
    expect(invoke).toHaveBeenCalledTimes(2); // draft + one revision, no more

    // The revision call should carry the critique's issues in its prompt.
    const revisionPrompt = invoke.mock.calls[1][0] as string;
    expect(revisionPrompt).toContain("claims the project supports OAuth but sources only show session-based login");
  });

  test("does not revise when critic disapproves but reports zero issues", async () => {
    const invoke = mockWriterLlm(["First draft."]);
    (critiquePage as jest.Mock).mockResolvedValue({ approved: false, issues: [] });

    const result = await writeWikiPage("repo-1", "owner/repo", page);

    expect(result.revised).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  test("skips the critic entirely when WIKI_CRITIC_ENABLED=false", async () => {
    process.env.WIKI_CRITIC_ENABLED = "false";
    const invoke = mockWriterLlm(["First draft, unreviewed."]);

    const result = await writeWikiPage("repo-1", "owner/repo", page);

    expect(result.content).toBe("First draft, unreviewed.");
    expect(result.revised).toBe(false);
    expect(critiquePage).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  test("dedupes sources by path+startLine", async () => {
    (hybridSearch as jest.Mock).mockResolvedValue([
      { pageContent: "a", metadata: { path: "src/a.ts", startLine: 1, endLine: 5 } },
      { pageContent: "a again", metadata: { path: "src/a.ts", startLine: 1, endLine: 5 } },
      { pageContent: "b", metadata: { path: "src/b.ts", startLine: 1, endLine: 5 } },
    ]);
    mockWriterLlm(["draft"]);
    (critiquePage as jest.Mock).mockResolvedValue({ approved: true, issues: [] });

    const result = await writeWikiPage("repo-1", "owner/repo", page);

    expect(result.sources).toHaveLength(2);
  });
});
