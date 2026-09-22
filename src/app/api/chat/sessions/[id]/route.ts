import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { asyncHandler, UnauthorizedError, NotFoundError, ValidationError } from "@/lib/errors";
import { withRateLimit } from "@/lib/withRateLimit";

function generateTitle(question: string): string {
  const t = question.trim().replace(/\s+/g, " ").slice(0, 80);
  // Simple humanization: capitalize first letter, strip trailing ?
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/\?$/, "");
}

const patchSchema = z.object({ title: z.string().min(1).max(80) });

async function patchHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const { id } = await params;
  const existing = await prisma.chatSession.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) throw new NotFoundError("Chat session");
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  const updated = await prisma.chatSession.update({
    where: { id },
    data: { title: parsed.data.title.trim(), titleManuallySet: true },
    include: { repositories: { include: { repository: { select: { id: true, fullName: true } } } } }
  });
  return NextResponse.json({ session: updated });
}

async function deleteHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const { id } = await params;
  const existing = await prisma.chatSession.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) throw new NotFoundError("Chat session");
  await prisma.chatMessage.deleteMany({ where: { chatSessionId: id } });
  await prisma.chatSessionRepository.deleteMany({ where: { chatSessionId: id } });
  await prisma.chatSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

async function getHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const { id } = await params;
  const chatSession = await prisma.chatSession.findFirst({
    where: { id, userId: session.user.id },
    include: { 
      messages: { orderBy: { createdAt: "asc" } },
      repositories: { include: { repository: { select: { id: true, fullName: true } } } }
    },
  });
  if (!chatSession) throw new NotFoundError("Chat session");
  return NextResponse.json({ session: chatSession });
}

export const PATCH = withRateLimit(asyncHandler(patchHandler), { requests: 30, window: "1 m", keyPrefix: "chat-session-patch" });
export const DELETE = withRateLimit(asyncHandler(deleteHandler), { requests: 20, window: "1 m", keyPrefix: "chat-session-delete" });
export const GET = withRateLimit(asyncHandler(getHandler), { requests: 60, window: "1 m", keyPrefix: "chat-session-get" });
