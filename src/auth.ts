import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import { recordFailedLogin, recordGoodLogin } from "@/server/password";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Hash of a throwaway string, compared against when the email is unknown.
const DUMMY_HASH = "$2b$12$jXVNtennytXKw44xTl8DEe8rGPgqRhs5lSWy/8Q2xnMDGmrOMqsKm";

class InvalidLogin extends CredentialsSignin {
  code = "invalid";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) throw new InvalidLogin();
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        // Compare even when the user is missing so response time doesn't reveal which emails exist.
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        if (user?.lockedUntil && user.lockedUntil > new Date()) throw new InvalidLogin();
        if (user && !ok) await recordFailedLogin(user.id);
        if (!user || !ok || !user.active) throw new InvalidLogin();
        if (user.failedLogins || user.lockedUntil) await recordGoodLogin(user.id);
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      // /q/<secret> is the shareable quotation PDF link sent on WhatsApp.
      // /i/<secret> is the same for an invoice.
      // /r/<secret> is a payment receipt; /download-app is the public page with the Android app.
      if (["/login", "/q/", "/i/", "/r/", "/download-app", "/forgot-password", "/reset-password/"].some((p) => path.startsWith(p))) return true;
      return !!auth?.user;
    },
  },
});
