import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { requireAuthSecret } from "@/lib/auth-secret";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { LoginSchema } from "@/server/validation/schemas";

/**
 * Resolved per read, not at module load.
 *
 * Importing this module must not require a runtime secret. Next collects route
 * configuration at build time by importing every route, and on Vercel the
 * secret is a Sensitive environment variable, which is deliberately absent
 * during a build. Resolving eagerly therefore failed the production build
 * rather than the request, which is both the wrong moment and the wrong signal.
 *
 * The fail-closed guarantee is unchanged: the getter still calls
 * `requireAuthSecret`, so a hosted request with no configured secret throws
 * exactly as before, at the point where a session would otherwise be issued.
 */
function readAuthSecret() {
  return requireAuthSecret();
}

/** The code is safe to show only after a successful password check. */
export class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            emailVerifiedAt: true,
          },
        });

        if (!user) {
          return null;
        }

        const isValid = await compare(password, user.password);
        if (!isValid) {
          return null;
        }

        if (!user.emailVerifiedAt) {
          throw new EmailNotVerifiedError();
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isEmailVerified: true,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = (user.role as Role) ?? "LEARNER";
        token.isEmailVerified = user.isEmailVerified === true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as Role) ?? "LEARNER";
        session.user.isEmailVerified = token.isEmailVerified === true;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  // Deployments may invoke Auth.js behind an internal reverse-proxy URL while
  // the browser uses the public HTTPS origin (including Vercel).
  trustHost: true,
  // Kept in one resolver with Proxy so a deployment cannot issue a session
  // that its request boundary rejects.
  get secret() {
    return readAuthSecret();
  },
});
