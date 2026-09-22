import { Octokit } from "@octokit/rest";
import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "@/lib/prisma";
import { computeImpact, findAffectedWikiPages } from "@/lib/dependencies";

export interface PrFileChange {
  path: string;
  status: string; // "added" | "removed" | "modified" | "renamed" | ...
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GeneratePrReviewParams {
  repositoryId: string;
  repoKey: string;
  owner: string;
  repo: string;
  githubToken: string | undefined;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  baseSha: string;
  headSha: string;
}

export interface PrReviewResult {
  posted: boolean;
  reason?: string;
  changeReportId?: string;
  filesReviewed: number;
  filesTruncated: boolean;
  commentUrl?: string;
}

const MAX_FILES = 60;
const MAX_PATCH_CHARS_PER_FILE = 3000;
const MAX_TOTAL_DIFF_CHARS = 24000;

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("");
  }
  return String(content ?? "");
}

/**
 * Fetches a PR's changed files via GitHub's compare/listFiles API. Only one
 * page (up to 100 files, GitHub's per-page max) is requested — large PRs get
 * `filesTruncated: true` rather than an unbounded number of API calls.
 */
async function fetchPrFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ files: PrFileChange[]; filesTruncated: boolean }> {
  const { data } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });
  const files: PrFileChange[] = data.map((f) => ({
    path: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));
  return { files, filesTruncated: data.length >= 100 };
}

function buildDiffContext(files: PrFileChange[]): { diffText: string; filesIncluded: number } {
  let budget = MAX_TOTAL_DIFF_CHARS;
  const parts: string[] = [];
  let filesIncluded = 0;

  for (const file of files.slice(0, MAX_FILES)) {
    if (budget <= 0) break;
    const patch = (file.patch ?? "(no diff available — binary file or too large)").slice(0, MAX_PATCH_CHARS_PER_FILE);
    const entry = `### ${file.status.toUpperCase()}: ${file.path} (+${file.additions}/-${file.deletions})\n\`\`\`diff\n${patch}\n\`\`\``;
    if (entry.length > budget && filesIncluded > 0) break; // keep at least one file even if it blows the budget
    parts.push(entry);
    budget -= entry.length;
    filesIncluded += 1;
  }

  return { diffText: parts.join("\n\n"), filesIncluded };
}

const REVIEW_PROMPT = (repoKey: string, prTitle: string, diffText: string, impactLines: string, affectedWikiPages: string[]) => `You are a senior engineer doing a code review for a pull request in "${repoKey}".

PR title: ${prTitle}

--- Diff ---
${diffText}

--- Files elsewhere in the indexed codebase that import the changed files (potential blast radius) ---
${impactLines || "(none detected, or these are new files)"}

--- Wiki pages documenting the changed files (may need updating) ---
${affectedWikiPages.join(", ") || "(none)"}

Write a concise PR review in markdown with this structure:

**Summary** — one or two sentences on what this PR does.

**Risks & concerns** — bullet points on correctness issues, missing edge cases, or breaking changes you can actually see in the diff. If a file that imports a changed file isn't itself touched by this PR, flag it as worth checking. Don't invent risks that aren't grounded in the diff.

**Suggestions** — bullet points, optional, only if you have concrete ones.

Keep it under 250 words. Be direct and specific — reference actual file names and lines from the diff, not generic advice. If the diff looks fine with nothing notable, say so briefly rather than padding with filler.`;

/**
 * Generates an AI review for a pull request and posts it as a PR comment.
 * Also persists a ChangeReport (same model push-triggered change reports
 * use) so the review shows up in the repo's existing Changes view.
 */
export async function generatePrReview(params: GeneratePrReviewParams): Promise<PrReviewResult> {
  const { repositoryId, repoKey, owner, repo, githubToken, prNumber, prTitle, prUrl, baseSha, headSha } = params;
  const octokit = new Octokit({ auth: githubToken });

  const { files, filesTruncated } = await fetchPrFiles(octokit, owner, repo, prNumber);
  if (files.length === 0) {
    return { posted: false, reason: "no-files-changed", filesReviewed: 0, filesTruncated: false };
  }

  const latestSnapshot = await prisma.repositorySnapshot.findFirst({
    where: { repositoryId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true },
  });

  let impactLines = "";
  let importersByFile: Record<string, string[]> = {};
  let affectedWikiPages: string[] = [];
  if (latestSnapshot) {
    const impact = await computeImpact(latestSnapshot.id, files.map((f) => f.path));
    importersByFile = impact.importersByFile;
    impactLines = Object.entries(importersByFile)
      .map(([file, importers]) => `${file} → imported by ${[...new Set(importers)].join(", ")}`)
      .join("\n");
    affectedWikiPages = await findAffectedWikiPages(repositoryId, files.map((f) => f.path));
  }

  const { diffText, filesIncluded } = buildDiffContext(files);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });
  const response = await llm.invoke(REVIEW_PROMPT(repoKey, prTitle, diffText, impactLines, affectedWikiPages));
  const reviewText = toText(response.content);

  const footer = `\n\n---\n*Automated review by Codexa on ${filesIncluded} of ${files.length} changed file${files.length === 1 ? "" : "s"}${filesTruncated ? " (file list truncated at 100)" : ""}.*`;
  const commentBody = reviewText + footer;

  const changeReport = await prisma.changeReport.create({
    data: {
      repositoryId,
      baseSha,
      headSha,
      summary: reviewText,
      affected: {
        files: files.map((f) => f.path),
        wikiPages: affectedWikiPages,
        importers: importersByFile,
        prNumber,
        prUrl,
      },
    },
  });

  let commentUrl: string | undefined;
  try {
    const { data: comment } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    });
    commentUrl = comment.html_url;
  } catch (err) {
    // Posting can fail independently of everything above (token lacks
    // pull-requests:write, PR was closed mid-flight, etc.) — the review is
    // still saved and visible in-app even if we couldn't post it to GitHub.
    console.warn(`[prReview] failed to post comment on ${repoKey}#${prNumber}:`, err instanceof Error ? err.message : err);
    return { posted: false, reason: "comment-post-failed", changeReportId: changeReport.id, filesReviewed: filesIncluded, filesTruncated };
  }

  return { posted: true, changeReportId: changeReport.id, filesReviewed: filesIncluded, filesTruncated, commentUrl };
}
