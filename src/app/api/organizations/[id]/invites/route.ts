import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";
import { z } from "zod";
import { ForbiddenError, handleError } from "@/lib/errors";
import { withRateLimit } from "@/lib/withRateLimit";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
});

async function createInviteHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: routeOrgId } = await params;
  const body = await req.json();
  const { email, role } = inviteSchema.parse(body);

  // The org being invited into must be the explicit :id from the URL — but the
  // caller's authority is still checked via their actual membership.
  const targetOrg = await prisma.organization.findUnique({ where: { id: routeOrgId } });
  if (!targetOrg) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId: targetOrg.id, userId: session.user.id },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    throw new ForbiddenError("Only owners and admins can invite members");
  }

  // Check if user is already a member
  const existingMember = await prisma.user.findUnique({ where: { email } });
  if (existingMember) {
    const existingMembership = await prisma.organizationMember.findFirst({
      where: { organizationId: targetOrg.id, userId: existingMember.id },
    });
    if (existingMembership) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }
  }

  // Check for existing pending invite
  const existingInvite = await prisma.invite.findFirst({
    where: { organizationId: targetOrg.id, email, status: "PENDING" },
  });
  if (existingInvite) {
    return NextResponse.json({ error: "Invite already pending for this email" }, { status: 409 });
  }

  // Create invite
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

  const invite = await prisma.invite.create({
    data: {
      organizationId: targetOrg.id,
      email,
      role,
      expiresAt,
    },
  });

  if (process.env.NODE_ENV !== "production") {
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    console.log(`Invite link: ${appUrl}/invite/${invite.token}`);
  }

  return NextResponse.json({ invite });
}

export const POST = withRateLimit(
  async (req: NextRequest) => {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const orgId = pathParts[pathParts.indexOf("organizations") + 1];

    try {
      return await createInviteHandler(req, {
        params: Promise.resolve({ id: orgId }),
      });
    } catch (error) {
      return handleError(error);
    }
  },
  { requests: 10, window: "1 m", keyPrefix: "org-invite" }
);
