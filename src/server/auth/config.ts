import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { requireAuthSecret } from "@/lib/auth-secret";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const authSecret = requireAuthSecret();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, password: true, role: true },
        });

        if (!user) {
          return null;
        }

        const isValid = await compare(password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = (user.role as Role) ?? "LEARNER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as Role) ?? "LEARNER";
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
  secret: authSecret,
});
