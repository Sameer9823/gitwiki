import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { asyncHandler, UnauthorizedError, NotFoundError, ValidationError } from "@/lib/errors";
import { withRateLimit } from "@/lib/withRateLimit";

async function listHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const url = new URL(req.url);
  const repositoryId = url.searchParams.get("repositoryId");
  if (!repositoryId) throw new ValidationError("repositoryId is required");
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repo = await prisma.repository.findFirst({ where: { id: repositoryId, organizationId: org.id } });
  if (!repo) throw new NotFoundError("Repository");
  const sessions = await prisma.chatSession.findMany({
    where: { repositoryId, userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json({ sessions });
}

const createSchema = z.object({
  repositoryId: z.string().min(1),
  title: z.string().max(80).optional(),
});

async function createHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  const { repositoryId, title } = parsed.data;
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repo = await prisma.repository.findFirst({ where: { id: repositoryId, organizationId: org.id } });
  if (!repo) throw new NotFoundError("Repository");
  const chatSession = await prisma.chatSession.create({
    data: { repositoryId, userId: session.user.id, title: title?.trim() || null },
  });
  return NextResponse.json({ session: chatSession }, { status: 201 });
}

export const GET = withRateLimit(asyncHandler(listHandler), { requests: 60, window: "1 m", keyPrefix: "chat-sessions-list" });
export const POST = withRateLimit(asyncHandler(createHandler), { requests: 30, window: "1 m", keyPrefix: "chat-sessions-create" });
