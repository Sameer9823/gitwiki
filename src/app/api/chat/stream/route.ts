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

async function streamHandler(req: NextRequest) {
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

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullAnswer = "";
      let sources: string[] = [];
      let citations: any[] = [];

      try {
        await askQuestionStream(repository.id, repository.fullName, question, 5, {
          onSources: (s) => {
            sources = s;
            controller.enqueue(encoder.encode(`event: sources\ndata: ${JSON.stringify(s)}\n\n`));
          },
          onCitations: (c) => {
            citations = c;
            controller.enqueue(encoder.encode(`event: citations\ndata: ${JSON.stringify(c)}\n\n`));
          },
          onToken: (token) => {
            fullAnswer += token;
            controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ token })}\n\n`));
          },
          onComplete: async (answer) => {
            // Save assistant message
            const assistantMessage = await prisma.chatMessage.create({
              data: { chatSessionId: session_.id, role: "ASSISTANT", content: answer, sources },
            });

            controller.enqueue(
              encoder.encode(
                `event: complete\ndata: ${JSON.stringify({
                  chatSessionId: session_.id,
                  message: { id: assistantMessage.id, role: "ASSISTANT", content: answer, sources },
                })}\n\n`
              )
            );
            controller.close();
          },
          onError: (error) => {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`));
            controller.close();
          },
        });
      } catch (error) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const POST = withRateLimit(asyncHandler(streamHandler), {
  requests: 20,
  window: "1 m",
  keyPrefix: "chat-stream",
});