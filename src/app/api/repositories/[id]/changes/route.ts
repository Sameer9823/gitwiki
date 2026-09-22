import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const org = await ensurePersonalOrganization(session.user.id, session.user.name);

  const repository = await prisma.repository.findFirst({
    where: { id, organizationId: org.id },
  });

  if (!repository) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reports = await prisma.changeReport.findMany({
    where: { repositoryId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ reports });
}