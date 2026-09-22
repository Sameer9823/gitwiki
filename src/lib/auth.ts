import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { ensurePersonalOrganization } from "@/lib/org";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:user user:email repo" } },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) await ensurePersonalOrganization(user.id, user.name);
    },
  },
});

/**
 * Repo indexing needs a GitHub token. Prefer the signed-in user's own
 * OAuth access token (so private repos they can see are indexable);
 * fall back to a server-wide GITHUB_TOKEN for convenience in dev.
 */
export async function getGithubTokenForUser(userId: string): Promise<string | undefined> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  return account?.access_token ?? process.env.GITHUB_TOKEN;
}
