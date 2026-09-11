import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { buildImportGraph } from "@/lib/dependencies";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);

  const repository = await prisma.repository.findFirst({
    where: { id, organizationId: org.id },
    include: { snapshots: { where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 1 } },
  });

  if (!repository) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = repository.snapshots[0];
  if (!snapshot) return NextResponse.json({ nodes: [], edges: [] });

  const edges = await buildImportGraph(snapshot.id);

  // Build nodes from files
  const files = await prisma.repositoryFile.findMany({
    where: { snapshotId: snapshot.id },
    select: { path: true, language: true },
  });

  const fileTypes: Record<string, string> = {};
  for (const f of files) {
    const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
    if (["ts", "tsx"].includes(ext)) fileTypes[f.path] = "typescript";
    else if (["js", "jsx"].includes(ext)) fileTypes[f.path] = "javascript";
    else if (["py"].includes(ext)) fileTypes[f.path] = "python";
    else if (["prisma"].includes(ext)) fileTypes[f.path] = "prisma";
    else fileTypes[f.path] = "other";
  }

  const nodes = files.map((f: { path: string; language: string | null }) => ({
    id: f.path,
    label: f.path.split("/").pop() ?? f.path,
    type: fileTypes[f.path],
    path: f.path,
  }));

  const graphEdges = edges.map((e) => ({ source: e.fromFile, target: e.toFile }));

  return NextResponse.json({ nodes, edges: graphEdges });
}