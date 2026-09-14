import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { fetchRepoFiles } from "@/lib/github";
import { getGithubTokenForUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path"); // optional: get specific file content

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);

  const repository = await prisma.repository.findFirst({
    where: { id, organizationId: org.id },
    include: { snapshots: { where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 1 } },
  });

  if (!repository) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = repository.snapshots[0];
  if (!snapshot) return NextResponse.json({ error: "No completed snapshot" }, { status: 404 });

  if (path) {
    const githubToken = await getGithubTokenForUser(session.user.id);
    // Prefer a single-file fetch (one GitHub API call) over re-fetching the entire tree.
    try {
      const { Octokit } = await import("@octokit/rest");
      const octokit = new Octokit({ auth: githubToken });
      const { data } = await octokit.rest.repos.getContent({
        owner: repository.ownerLogin,
        repo: repository.repoName,
        path,
      });
      // getContent returns file | directory | symlink | submodule. Handle file only.
      if (Array.isArray(data)) {
        return NextResponse.json({ error: "Path is a directory" }, { status: 400 });
      }
      if (data.type !== "file" || !("content" in data)) {
        return NextResponse.json({ error: "Not a file" }, { status: 400 });
      }
      const content =
        (data as { content?: string; encoding?: string }).encoding === "base64" && typeof (data as { content: string }).content === "string"
          ? Buffer.from((data as { content: string }).content, "base64").toString("utf8")
          : (data as { content: string }).content ?? "";
      return NextResponse.json({ path, content });
    } catch (err: unknown) {
      // Fall back to tree scan for edge cases (very large files, LFS, private repo quirks).
      const msg = err instanceof Error ? err.message : String(err);
      const status = typeof err === "object" && err !== null && "status" in err ? (err as { status?: number }).status : undefined;
      if (status === 404) return NextResponse.json({ error: "File not found" }, { status: 404 });
      // Try legacy full-tree fetch as last resort before surfacing the real error.
      try {
        const { files } = await fetchRepoFiles(githubToken, repository.ownerLogin, repository.repoName);
        const file = files.find((f) => f.path === path);
        if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
        return NextResponse.json({ path, content: file.content });
      } catch {
        return NextResponse.json({ error: msg || "Failed to fetch file from GitHub" }, { status: status ?? 502 });
      }
    }
  }

  // Return file tree from snapshot
  const files = await prisma.repositoryFile.findMany({
    where: { snapshotId: snapshot.id },
    select: { path: true, language: true },
    orderBy: { path: "asc" },
  });

  // Build tree structure
  interface TreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: TreeNode[];
    language?: string | null;
  }

  const root: TreeNode = { name: repository.repoName, path: "", type: "directory", children: [] };
  const pathMap = new Map<string, TreeNode>();
  pathMap.set("", root);

  for (const file of files) {
    const parts = file.path.split("/");
    let currentPath = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!pathMap.has(currentPath)) {
        const isLast = i === parts.length - 1;
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? "file" : "directory",
          ...(isLast ? { language: file.language } : { children: [] }),
        };
        pathMap.set(currentPath, node);
        const slash = currentPath.lastIndexOf("/");
        const parentPath = slash === -1 ? "" : currentPath.slice(0, slash);
        pathMap.get(parentPath)?.children?.push(node);
      }
    }
  }

  return NextResponse.json({ tree: root.children ?? [] });
}