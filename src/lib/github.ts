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
}

export async function fetchRepoFiles(token: string | undefined, owner: string, repo: string): Promise<FetchRepoFilesResult> {
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

  const files: RepoFile[] = [];

  for (const item of tree.tree) {
    if (item.type !== "blob" || !item.path) continue;
    if (shouldSkipFile(item.path, item.size)) continue;
    if (!item.sha) continue;

    const { data: blob } = await octokit.rest.git.getBlob({ owner, repo, file_sha: item.sha });

    files.push({
      path: item.path,
      content: Buffer.from(blob.content, "base64").toString("utf8"),
    });

    if (files.length >= 200) break;
  }

  return { files, defaultBranch: repoInfo.default_branch, commitSha };
}
