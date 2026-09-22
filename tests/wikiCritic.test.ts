// Tests for src/lib/wiki/critic.ts. Overrides the global @langchain/openai
// mock (which always returns a fixed "Test response") so we can control
// exactly what the critic LLM "says" per test.
jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn(),
}));

import { ChatOpenAI } from "@langchain/openai";
import { critiquePage } from "@/lib/wiki/critic";

function mockLlmResponse(content: string) {
  const invoke = jest.fn().mockResolvedValue({ content });
  (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({ invoke }));
  return invoke;
}

describe("critiquePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("parses a clean JSON approval", async () => {
    mockLlmResponse('{"approved": true, "issues": []}');
    const result = await critiquePage("Overview", "some source context", "some draft");
    expect(result).toEqual({ approved: true, issues: [] });
  });

  test("parses a rejection with issues", async () => {
    mockLlmResponse('{"approved": false, "issues": ["claims OAuth support but sources only show session cookies"]}');
    const result = await critiquePage("Authentication", "context", "draft");
    expect(result.approved).toBe(false);
    expect(result.issues).toEqual(["claims OAuth support but sources only show session cookies"]);
  });

  test("strips a markdown JSON fence the model added despite instructions", async () => {
    mockLlmResponse('```json\n{"approved": true, "issues": []}\n```');
    const result = await critiquePage("Overview", "context", "draft");
    expect(result).toEqual({ approved: true, issues: [] });
  });

  test("strips a bare fence with no language tag", async () => {
    mockLlmResponse('```\n{"approved": false, "issues": ["x"]}\n```');
    const result = await critiquePage("Overview", "context", "draft");
    expect(result).toEqual({ approved: false, issues: ["x"] });
  });

  test("filters out non-string entries in issues", async () => {
    mockLlmResponse('{"approved": false, "issues": ["real issue", 42, null]}');
    const result = await critiquePage("Overview", "context", "draft");
    expect(result.issues).toEqual(["real issue"]);
  });

  test("fails open (approves) when the response isn't valid JSON", async () => {
    mockLlmResponse("I think this draft looks pretty good actually, no issues found.");
    const result = await critiquePage("Overview", "context", "draft");
    expect(result).toEqual({ approved: true, issues: [] });
  });

  test("defaults approved to false if the field is missing, but issues to [] if absent", async () => {
    mockLlmResponse("{}");
    const result = await critiquePage("Overview", "context", "draft");
    expect(result).toEqual({ approved: false, issues: [] });
  });
});
