import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, getGithubTokenForUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { parseRepo } from "@/lib/github";
import { inngest } from "@/lib/inngest/client";
import { withLogging } from "@/middleware/logging";

const connectSchema = z.object({
  repo: z.string().min(3, "Enter a GitHub repo, e.g. vercel/next.js"),
});

async function getHandler() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);

  const repositories = await prisma.repository.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    include: { snapshots: { orderBy: { startedAt: "desc" }, take: 1 } },
  });

  return NextResponse.json({ repositories });
}

async function postHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  let owner: string, repo: string, repoKey: string;
  try {
    ({ owner, repo, repoKey } = parseRepo(parsed.data.repo));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid repo" }, { status: 400 });
  }

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);

  const repository = await prisma.repository.upsert({
    where: { organizationId_fullName: { organizationId: org.id, fullName: repoKey } },
    create: {
      organizationId: org.id,
      ownerLogin: owner,
      repoName: repo,
      fullName: repoKey,
      connectedById: session.user.id,
    },
    update: {},
  });

  const snapshot = await prisma.repositorySnapshot.create({
    data: { repositoryId: repository.id, branch: "unknown", status: "PENDING" },
  });

  const githubToken = await getGithubTokenForUser(session.user.id);

  await inngest.send({
    name: "repo/index.requested",
    data: { snapshotId: snapshot.id, githubToken, owner, repo, repoKey },
  });

  return NextResponse.json({ repository, snapshot }, { status: 202 });
}

export const GET = withLogging(getHandler);
export const POST = withLogging(postHandler);
