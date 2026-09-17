import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { requireAuthSecret } from "@/lib/auth-secret";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { LoginSchema } from "@/server/validation/schemas";
import { equalizePasswordWork } from "@/server/auth/opaque-response";
import {
  clearLoginFailures,
  isLoginLocked,
  loginSubjects,
  recordLoginFailure,
} from "@/server/auth/login-throttle";

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

/**
 * Thrown before any account lookup when the email or client IP is locked
 * (Plan13 A2). The same code is used whether or not the account exists.
 */
export class AuthLockedError extends CredentialsSignin {
  code = "auth_locked";
}

/** How long a JWT may keep its role/verification claims before re-reading them. */
export const ROLE_REFRESH_INTERVAL_MS = 5 * 60_000;

type RefreshableToken = {
  id?: unknown;
  role?: unknown;
  isEmailVerified?: unknown;
  roleCheckedAt?: unknown;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = LoginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const subjects = loginSubjects(email, request);

        // The lock check precedes the account read so a locked address costs
        // the same whether or not it belongs to a real account.
        if (await isLoginLocked(subjects)) {
          throw new AuthLockedError();
        }

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
          // An unknown address pays the same bcrypt cost as a wrong password,
          // so login latency does not reveal whether the account exists.
          await equalizePasswordWork();
          await recordLoginFailure(subjects);
          return null;
        }

        const isValid = await compare(password, user.password);
        if (!isValid) {
          await recordLoginFailure(subjects);
          return null;
        }

        // A correct password is not a brute-force signal, verified or not.
        await clearLoginFailures(subjects);

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
      const claims = token as RefreshableToken;
      if (user) {
        token.id = user.id ?? "";
        token.role = (user.role as Role) ?? "LEARNER";
        token.isEmailVerified = user.isEmailVerified === true;
        claims.roleCheckedAt = Date.now();
        return token;
      }

      // Role refresh (Plan13 P130 §5): a 30-day JWT must not freeze a role
      // change or outlive a deleted account. Re-read at most every 5 minutes;
      // a flapping database keeps the existing claims rather than logging
      // the person out.
      const checkedAt = typeof claims.roleCheckedAt === "number" ? claims.roleCheckedAt : 0;
      if (Date.now() - checkedAt <= ROLE_REFRESH_INTERVAL_MS) return token;

      const userId = typeof claims.id === "string" ? claims.id : "";
      if (!userId) return token;

      try {
        const current = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, emailVerifiedAt: true },
        });
        if (!current) return null;

        token.role = current.role;
        token.isEmailVerified = current.emailVerifiedAt !== null;
        claims.roleCheckedAt = Date.now();
      } catch (error) {
        logger.warn(
          { userId, errorName: error instanceof Error ? error.name : "unknown" },
          "Role refresh failed; keeping the existing session claims",
        );
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
