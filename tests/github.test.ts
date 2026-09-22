// Tests for src/lib/github.ts's fetchRepoFiles — the global setup.ts mock
// stubs this module for every other test file, so we unmock it here and
// drive the real implementation against a mocked Octokit instead.
jest.unmock("@/lib/github");
jest.mock("@octokit/rest", () => ({ Octokit: jest.fn() }));

import { Octokit } from "@octokit/rest";
import { fetchRepoFiles } from "@/lib/github";

interface TreeItem {
  path: string;
  type: "blob" | "tree";
  sha?: string;
  size?: number;
}

function mockOctokit({
  treeItems,
  treeTruncated = false,
  blobContent = {},
}: {
  treeItems: TreeItem[];
  treeTruncated?: boolean;
  blobContent?: Record<string, string>;
}) {
  const getBlob = jest.fn(async ({ file_sha }: { file_sha: string }) => ({
    data: { content: Buffer.from(blobContent[file_sha] ?? "").toString("base64") },
  }));

  (Octokit as unknown as jest.Mock).mockImplementation(() => ({
    rest: {
      repos: {
        get: jest.fn().mockResolvedValue({ data: { default_branch: "main" } }),
        getBranch: jest.fn().mockResolvedValue({ data: { commit: { sha: "head-sha" } } }),
      },
      git: {
        getTree: jest.fn().mockResolvedValue({ data: { tree: treeItems, truncated: treeTruncated } }),
        getBlob,
      },
    },
  }));

  return { getBlob };
}

describe("fetchRepoFiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns all eligible files and reports filesTruncated=false when under the cap", async () => {
    mockOctokit({
      treeItems: [
        { path: "src/a.ts", type: "blob", sha: "sha-a", size: 10 },
        { path: "src/b.ts", type: "blob", sha: "sha-b", size: 10 },
      ],
      blobContent: { "sha-a": "content a", "sha-b": "content b" },
    });

    const result = await fetchRepoFiles("token", "owner", "repo", 10);

    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.path).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.filesTruncated).toBe(false);
    expect(result.treeTruncated).toBe(false);
  });

  test("caps at maxFiles and reports filesTruncated=true when more eligible files exist", async () => {
    mockOctokit({
      treeItems: [
        { path: "src/a.ts", type: "blob", sha: "sha-a", size: 10 },
        { path: "src/b.ts", type: "blob", sha: "sha-b", size: 10 },
        { path: "src/c.ts", type: "blob", sha: "sha-c", size: 10 },
      ],
      blobContent: { "sha-a": "a", "sha-b": "b", "sha-c": "c" },
    });

    const result = await fetchRepoFiles("token", "owner", "repo", 2);

    expect(result.files).toHaveLength(2);
    expect(result.filesTruncated).toBe(true);
  });

  test("skips binaries, lockfiles, oversized files, and node_modules regardless of the cap", async () => {
    mockOctokit({
      treeItems: [
        { path: "src/a.ts", type: "blob", sha: "sha-a", size: 10 },
        { path: "image.png", type: "blob", sha: "sha-img", size: 10 },
        { path: "package-lock.json", type: "blob", sha: "sha-lock", size: 10 },
        { path: "node_modules/dep/index.js", type: "blob", sha: "sha-dep", size: 10 },
        { path: "huge.ts", type: "blob", sha: "sha-huge", size: 300_000 },
        { path: "src", type: "tree", sha: "sha-tree" },
      ],
      blobContent: { "sha-a": "content a" },
    });

    const result = await fetchRepoFiles("token", "owner", "repo", 800);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/a.ts");
    expect(result.filesTruncated).toBe(false);
  });

  test("surfaces GitHub's own tree truncation separately from the file cap", async () => {
    mockOctokit({
      treeItems: [{ path: "src/a.ts", type: "blob", sha: "sha-a", size: 10 }],
      treeTruncated: true,
      blobContent: { "sha-a": "content a" },
    });

    const result = await fetchRepoFiles("token", "owner", "repo", 800);

    expect(result.treeTruncated).toBe(true);
    expect(result.filesTruncated).toBe(false); // only 1 eligible file, well under the cap
  });

  test("fetches blob content concurrently but preserves tree order in the result", async () => {
    const items: TreeItem[] = Array.from({ length: 20 }, (_, i) => ({
      path: `src/file${i}.ts`,
      type: "blob",
      sha: `sha-${i}`,
      size: 10,
    }));
    const blobContent = Object.fromEntries(items.map((it, i) => [it.sha!, `content ${i}`]));
    const { getBlob } = mockOctokit({ treeItems: items, blobContent });

    const result = await fetchRepoFiles("token", "owner", "repo", 800);

    expect(result.files).toHaveLength(20);
    expect(result.files.map((f) => f.path)).toEqual(items.map((it) => it.path));
    expect(getBlob).toHaveBeenCalledTimes(20);
  });
});
