import { NextRequest, NextResponse } from "next/server";
import { auth, getGithubTokenForUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { inngest } from "@/lib/inngest/client";
import { asyncHandler, UnauthorizedError, NotFoundError } from "@/lib/errors";
import { withRateLimit } from "@/lib/withRateLimit";

async function handler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  const { id } = await params;
  const org = await ensurePersonalOrganization(session.user.id, session.user.name);
  const repository = await prisma.repository.findFirst({ where: { id, organizationId: org.id } });
  if (!repository) throw new NotFoundError("Repository");
  const snapshot = await prisma.repositorySnapshot.create({
    data: { repositoryId: repository.id, branch: repository.defaultBranch ?? "unknown", status: "PENDING" },
  });
  const githubToken = await getGithubTokenForUser(session.user.id);
  await inngest.send({
    name: "repo/index.requested",
    data: { snapshotId: snapshot.id, githubToken, owner: repository.ownerLogin, repo: repository.repoName, repoKey: repository.fullName },
  });
  return NextResponse.json({ snapshot }, { status: 202 });
}

export const POST = withRateLimit(asyncHandler(handler), { requests: 10, window: "1 m", keyPrefix: "reindex" });
