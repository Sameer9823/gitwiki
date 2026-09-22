import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { askQuestionStream } from "@/lib/rag";
import { asyncHandler, UnauthorizedError, NotFoundError, ValidationError } from "@/lib/errors";
import { withRateLimit } from "@/lib/withRateLimit";

const chatSchema = z.object({
  repositoryIds: z.array(z.string().min(1)).min(1, "At least one repository is required"),
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
  const { repositoryIds, question, chatSessionId } = parsed.data;

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  
  // Verify all repositories belong to the organization
  const repositories = await prisma.repository.findMany({
    where: { id: { in: repositoryIds }, organizationId: org.id },
    include: { snapshots: { orderBy: { startedAt: "desc" }, take: 1 } },
  });
  
  if (repositories.length !== repositoryIds.length) {
    throw new NotFoundError("One or more repositories not found");
  }

  // Check that all repositories have completed indexing
  for (const repository of repositories) {
    const latestSnapshot = repository.snapshots[0];
    if (!latestSnapshot || latestSnapshot.status !== "COMPLETED") {
      return NextResponse.json(
        { error: `Repository ${repository.fullName} hasn't finished indexing yet. Try again once indexing completes.` },
        { status: 409 }
      );
    }
  }

  let chatSession =
    chatSessionId
      ? await prisma.chatSession.findFirst({ 
          where: { id: chatSessionId, userId: session.user.id },
          include: { repositories: true }
        })
      : null;

  // If session exists, verify all requested repositories are part of it
  if (chatSession) {
    const sessionRepoIds = chatSession.repositories.map(r => r.repositoryId);
    const missingRepos = repositoryIds.filter(id => !sessionRepoIds.includes(id));
    if (missingRepos.length > 0) {
      // Add missing repositories to the session
      await prisma.chatSessionRepository.createMany({
        data: missingRepos.map(repositoryId => ({ chatSessionId: chatSession!.id, repositoryId })),
        skipDuplicates: true,
      });
    }
  } else {
    // Create new session with all repositories
    chatSession = await prisma.chatSession.create({
      data: { 
        userId: session.user.id,
        repositories: {
          create: repositoryIds.map(repositoryId => ({ repositoryId }))
        }
      },
      include: { repositories: true }
    });
  }

  // chatSession is guaranteed to be non-null at this point
  const session_ = chatSession!;

  await prisma.chatMessage.create({
    data: { chatSessionId: session_.id, role: "USER", content: question },
  });

  // Auto-title from first user message (only if not manually set and no title yet)
  if (!chatSessionId && !session_.titleManuallySet && !session_.title) {
    const raw = question.trim().replace(/\s+/g, " ").slice(0, 80);
    const title = raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\?$/, "");
    await prisma.chatSession.update({ where: { id: chatSession.id }, data: { title } }).catch(() => {});
  }

  // Use streaming version
  const repoKeys = repositories.map(r => r.fullName);
  const { answer, sources } = await askQuestionStream(repositoryIds, repoKeys, question);

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
