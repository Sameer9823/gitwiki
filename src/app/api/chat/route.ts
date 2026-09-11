import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { askQuestionStream } from "@/lib/rag";
import { asyncHandler, UnauthorizedError, NotFoundError, ValidationError } from "@/lib/errors";
import { withRateLimit } from "@/lib/withRateLimit";

const chatSchema = z.object({
  repositoryId: z.string().min(1),
  question: z.string().min(1, "Ask a question first"),
  chatSessionId: z.string().optional(),
});

async function chatHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();

  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.flatten().fieldErrors);
  }
  const { repositoryId, question, chatSessionId } = parsed.data;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({
    where: { id: repositoryId, organizationId: org.id },
    include: { snapshots: { orderBy: { startedAt: "desc" }, take: 1 } },
  });
  if (!repository) throw new NotFoundError("Repository");

  const latestSnapshot = repository.snapshots[0];
  if (!latestSnapshot || latestSnapshot.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "This repository hasn't finished indexing yet. Try again once indexing completes." },
      { status: 409 }
    );
  }

  const chatSession =
    chatSessionId
      ? await prisma.chatSession.findFirst({ where: { id: chatSessionId, repositoryId } })
      : null;

  const session_ =
    chatSession ??
    (await prisma.chatSession.create({ data: { repositoryId, userId: session.user.id } }));

  await prisma.chatMessage.create({
    data: { chatSessionId: session_.id, role: "USER", content: question },
  });

  // Auto-title from first user message (only if not manually set and no title yet)
  if (!chatSession && !session_.titleManuallySet && !session_.title) {
    const raw = question.trim().replace(/\s+/g, " ").slice(0, 80);
    const title = raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\?$/, "");
    await prisma.chatSession.update({ where: { id: session_.id }, data: { title } }).catch(() => {});
  }

  // Use streaming version
  const { answer, sources } = await askQuestionStream(repository.id, repository.fullName, question);

  const assistantMessage = await prisma.chatMessage.create({
    data: { chatSessionId: session_.id, role: "ASSISTANT", content: answer, sources },
  });

  return NextResponse.json({
    chatSessionId: session_.id,
    message: { id: assistantMessage.id, role: "ASSISTANT", content: answer, sources },
  });
}

export const POST = withRateLimit(asyncHandler(chatHandler), {
  requests: 30,
  window: "1 m",
  keyPrefix: "chat",
});
