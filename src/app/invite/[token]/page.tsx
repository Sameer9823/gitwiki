import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    notFound();
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/invite/${token}`);
  }

  // Check if user's email matches the invite
  if (session.user.email !== invite.email) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="mb-4 text-2xl font-medium text-text">Email Mismatch</h1>
        <p className="text-muted">
          This invite was sent to <strong>{invite.email}</strong>, but you&apos;re signed in as{" "}
          <strong>{session.user.email}</strong>. Please sign in with the correct account.
        </p>
        <a href="/api/auth/signout" className="mt-4 inline-block text-accent underline">
          Sign out
        </a>
      </main>
    );
  }

  // Check if already a member
  const existingMembership = await prisma.organizationMember.findFirst({
    where: { organizationId: invite.organizationId, userId: session.user.id },
  });
  if (existingMembership) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="mb-4 text-2xl font-medium text-text">Already a Member</h1>
        <p className="text-muted">
          You&apos;re already a member of <strong>{invite.organization.name}</strong>.
        </p>
        <a href={`/dashboard`} className="mt-4 inline-block text-accent underline">
          Go to Dashboard
        </a>
      </main>
    );
  }

  // Accept the invite
  await prisma.$transaction([
    prisma.organizationMember.create({
      data: {
        organizationId: invite.organizationId,
        userId: session.user.id,
        role: invite.role,
      },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: session.user.id },
    }),
  ]);

  redirect(`/dashboard`);
}
