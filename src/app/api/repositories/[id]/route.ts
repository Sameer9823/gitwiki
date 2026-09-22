import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, getGithubTokenForUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { asyncHandler, UnauthorizedError, NotFoundError, ValidationError } from "@/lib/errors";
import { withRateLimit } from "@/lib/withRateLimit";
import { deleteNamespace } from "@/lib/vectorStore";

async function getHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const { id } = await params;
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({
    where: { id, organizationId: org.id },
    include: { snapshots: { orderBy: { startedAt: "desc" }, take: 5 } },
  });
  if (!repository) throw new NotFoundError("Repository");
  return NextResponse.json({ repository });
}

const patchSchema = z.object({ displayName: z.string().min(1, "Name cannot be empty").max(80, "Name is too long").transform((s) => s.trim()).refine((s) => s.length > 0, "Name cannot be empty") });

async function patchHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) throw new NotFoundError("Repository");
  const updated = await prisma.repository.update({ where: { id }, data: { displayName: parsed.data.displayName } });
  return NextResponse.json({ repository: updated });
}

async function deleteHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const { id } = await params;
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) throw new NotFoundError("Repository");

  const fullName = repository.fullName;

  // Gather ids for explicit cleanup where cascade may not cover indirectly
  // Prisma schema has onDelete:Cascade for most relations, but be explicit for safety
  await prisma.$transaction(async (tx) => {
    const sessions = await tx.chatSession.findMany({ 
      where: { repositories: { some: { repositoryId: id } } }, 
      select: { id: true } 
    });
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length) await tx.chatMessage.deleteMany({ where: { chatSessionId: { in: sessionIds } } });
    await tx.chatSession.deleteMany({ where: { repositories: { some: { repositoryId: id } } } });
    await tx.wikiPageSource.deleteMany({ where: { wikiPage: { repositoryId: id } } });
    await tx.wikiPage.deleteMany({ where: { repositoryId: id } });
    await tx.changeReport.deleteMany({ where: { repositoryId: id } });
    await tx.commit.deleteMany({ where: { repositoryId: id } });
    // RepositoryFile -> RepositorySymbol -> RepositoryRelationship needs ordered delete
    const files = await tx.repositoryFile.findMany({ where: { repositoryId: id }, select: { id: true } });
    const fileIds = files.map((f) => f.id);
    if (fileIds.length) {
      const symbols = await tx.repositorySymbol.findMany({ where: { fileId: { in: fileIds } }, select: { id: true } });
      const symbolIds = symbols.map((s) => s.id);
      if (symbolIds.length) {
        await tx.repositoryRelationship.deleteMany({ where: { OR: [{ fromSymbolId: { in: symbolIds } }, { toSymbolId: { in: symbolIds } }] } });
      }
      await tx.repositorySymbol.deleteMany({ where: { fileId: { in: fileIds } } });
    }
    await tx.repositoryFile.deleteMany({ where: { repositoryId: id } });
    await tx.repositorySnapshot.deleteMany({ where: { repositoryId: id } });
    await tx.repository.delete({ where: { id } });
  });

  // Best-effort vector cleanup — do not fail the request if Pinecone is unavailable
  try {
    await deleteNamespace(fullName);
  } catch (e) {
    console.warn("[repo delete] deleteNamespace failed for", fullName, e);
  }

  return NextResponse.json({ ok: true });
}

export const GET = withRateLimit(asyncHandler(getHandler), { requests: 60, window: "1 m", keyPrefix: "repo-get" });
export const PATCH = withRateLimit(asyncHandler(patchHandler), { requests: 30, window: "1 m", keyPrefix: "repo-patch" });
export const DELETE = withRateLimit(asyncHandler(deleteHandler), { requests: 10, window: "1 m", keyPrefix: "repo-delete" });
