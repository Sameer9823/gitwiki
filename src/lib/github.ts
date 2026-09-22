import { Octokit } from "@octokit/rest";

const SKIP_DIRS = [
  "node_modules", ".git", "dist", "build", "out", "coverage",
  ".next", "vendor", "target", "__pycache__", ".gradle",
];

const SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp",
  "woff", "woff2", "ttf", "eot", "otf",
  "mp3", "mp4", "mov", "wav", "webm",
  "exe", "dll", "so", "dylib", "bin", "wasm",
  "class", "jar", "war", "ear",
  "zip", "tar", "gz", "tgz", "7z", "rar",
  "pdf", "lock", "map",
]);

const SKIP_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "composer.lock", "go.sum",
]);

function shouldSkipFile(path: string, size?: number) {
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];

  if (parts.some((part) => SKIP_DIRS.includes(part))) return true;
  if (SKIP_FILES.has(fileName)) return true;
  if (typeof size === "number" && size > 200_000) return true;

  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  if (SKIP_EXTENSIONS.has(ext)) return true;
  if (fileName.endsWith(".min.js")) return true;

  return false;
}

export function parseRepo(input: string) {
  const clean = input
    .replace("https://github.com/", "")
    .replace("http://github.com/", "")
    .replace(/\.git$/, "")
    .trim();

  const [owner, repo] = clean.split("/");
  if (!owner || !repo) {
    throw new Error(`Could not parse "owner/repo" from "${input}"`);
  }
  return { owner, repo, repoKey: `${owner}/${repo}` };
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface FetchRepoFilesResult {
  files: RepoFile[];
  defaultBranch: string;
  commitSha: string;
  /** True if more eligible files existed than `maxFiles` allowed — indexing only covers a subset. */
  filesTruncated: boolean;
  /** True if GitHub itself truncated the tree listing (repos with 100k+ entries) — some files may be invisible to us regardless of maxFiles. */
  treeTruncated: boolean;
}

/** Default cap on files indexed per repo. Override with the MAX_INDEX_FILES env var, or pass maxFiles explicitly. */
export const DEFAULT_MAX_FILES = Number(process.env.MAX_INDEX_FILES) || 800;

/** How many blob fetches to run in parallel. GitHub's REST rate limit is per-token, not per-request, so a small pool speeds up indexing without risking abuse-detection throttling. */
const BLOB_FETCH_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Lightweight check of the repo's current HEAD — used to kick off incremental
 * re-indexing without paying for a full tree/blob fetch first.
 */
export async function getLatestCommitSha(token: string | undefined, owner: string, repo: string): Promise<{ defaultBranch: string; commitSha: string }> {
  const octokit = new Octokit({ auth: token });
  const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
  const { data: branch } = await octokit.rest.repos.getBranch({ owner, repo, branch: repoInfo.default_branch });
  return { defaultBranch: repoInfo.default_branch, commitSha: branch.commit.sha };
}

export async function fetchRepoFiles(
  token: string | undefined,
  owner: string,
  repo: string,
  maxFiles: number = DEFAULT_MAX_FILES
): Promise<FetchRepoFilesResult> {
  const octokit = new Octokit({ auth: token });

  const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo }).catch((err) => {
    if (err.status === 404) {
      throw new Error(
        `GitHub could not find ${owner}/${repo}. Check the URL, or that your token can see this repo.`,
      );
    }
    throw err;
  });

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: repoInfo.default_branch,
    recursive: "true",
  });

  const { data: branch } = await octokit.rest.repos.getBranch({ owner, repo, branch: repoInfo.default_branch });
  const commitSha = branch.commit.sha;

  const eligible: { path: string; sha: string }[] = [];
  for (const item of tree.tree) {
    if (item.type !== "blob" || !item.path || !item.sha) continue;
    if (shouldSkipFile(item.path, item.size)) continue;
    eligible.push({ path: item.path, sha: item.sha });
  }

  const filesTruncated = eligible.length > maxFiles;
  const selected = eligible.slice(0, maxFiles);

  const files = await mapWithConcurrency(selected, BLOB_FETCH_CONCURRENCY, async ({ path, sha }) => {
    const { data: blob } = await octokit.rest.git.getBlob({ owner, repo, file_sha: sha });
    return { path, content: Buffer.from(blob.content, "base64").toString("utf8") };
  });

  return {
    files,
    defaultBranch: repoInfo.default_branch,
    commitSha,
    filesTruncated,
    treeTruncated: tree.truncated ?? false,
  };
}
