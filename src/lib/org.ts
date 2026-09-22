import { prisma } from "@/lib/prisma";

/**
 * Phase 1 simplification: every user gets one personal organization,
 * auto-created on first login. Multi-member orgs / invites are Phase 6.
 * 
 * Decision: users who accept an invite first still get a personal organization.
 * The invited org becomes an additional membership. This keeps the single-org
 * assumption valid for most code paths, while still allowing multi-org users.
 */
export async function ensurePersonalOrganization(userId: string, userName?: string | null) {
  // First check for personal org (marked by OWNER role on an org they created)
  const personalOrg = await prisma.organizationMember.findFirst({
    where: { userId, role: "OWNER" },
    include: { organization: true },
  });
  if (personalOrg) return personalOrg.organization;

  // No personal org yet - create one
  const base = (userName || "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "workspace";
  const slug = `${base}-${userId.slice(0, 6)}`;

  const org = await prisma.organization.create({
    data: {
      name: userName ? `${userName}'s workspace` : "My workspace",
      slug,
      members: { create: { userId, role: "OWNER" } },
    },
  });

  return org;
}

/**
 * Get all organizations a user belongs to (for org switcher).
 */
export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { role: "desc" }, // OWNER first
  });
  return memberships.map((m) => m.organization);
}
