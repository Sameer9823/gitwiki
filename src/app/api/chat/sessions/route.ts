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
    where: { 
      userId: session.user.id,
      repositories: { some: { repositoryId } }
    },
    orderBy: { updatedAt: "desc" },
    include: { 
      _count: { select: { messages: true } },
      repositories: { include: { repository: { select: { id: true, fullName: true } } } }
    },
  });
  return NextResponse.json({ sessions });
}

const createSchema = z.object({
  repositoryIds: z.array(z.string().min(1)).min(1, "At least one repository is required"),
  title: z.string().max(80).optional(),
});

async function createHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  const { repositoryIds, title } = parsed.data;
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repos = await prisma.repository.findMany({ where: { id: { in: repositoryIds }, organizationId: org.id } });
  if (repos.length !== repositoryIds.length) throw new NotFoundError("One or more repositories not found");
  const chatSession = await prisma.chatSession.create({
    data: { 
      userId: session.user.id, 
      title: title?.trim() || null,
      repositories: {
        create: repositoryIds.map(repositoryId => ({ repositoryId }))
      }
    },
    include: { repositories: { include: { repository: { select: { id: true, fullName: true } } } } }
  });
  return NextResponse.json({ session: chatSession }, { status: 201 });
}

export const GET = withRateLimit(asyncHandler(listHandler), { requests: 60, window: "1 m", keyPrefix: "chat-sessions-list" });
export const POST = withRateLimit(asyncHandler(createHandler), { requests: 30, window: "1 m", keyPrefix: "chat-sessions-create" });
