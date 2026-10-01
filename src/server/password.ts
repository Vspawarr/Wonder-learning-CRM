// Sign-in protection and "forgot password".
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { DomainError } from "./errors";
import { isEmailConfigured, sendMail } from "./mailer";

export const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const timeIST = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

/** The message to show when this email is locked out, or null. */
export async function lockMessage(email: string) {
  const u = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { lockedUntil: true } });
  if (u?.lockedUntil && u.lockedUntil > new Date())
    return `Too many wrong passwords. This account is locked until ${timeIST(u.lockedUntil)}. Use "Forgot password?" or ask your admin to reset it.`;
  return null;
}

/** Counts a wrong password; the fifth in a row locks the account for 15 minutes. */
export async function recordFailedLogin(userId: string) {
  const u = await db.user.update({ where: { id: userId }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } });
  if (u.failedLogins >= MAX_FAILED_LOGINS)
    await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } });
}

export async function recordGoodLogin(userId: string) {
  await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
}

/**
 * Emails a one-hour reset link. Says the same thing whether or not the email exists,
 * so the page can't be used to find out who has an account.
 */
export async function requestPasswordReset(email: string, origin: string) {
  if (!isEmailConfigured()) return { sent: false as const };
  const u = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (u?.active) {
    const token = randomBytes(32).toString("base64url");
    await db.passwordReset.create({ data: { userId: u.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    await sendMail({
      to: u.email,
      subject: "Reset your Wonder Learning CRM password",
      text: `Hello ${u.name},\n\nSomeone (hopefully you) asked to reset your CRM password. Open this link within 1 hour to choose a new one:\n\n${origin}/reset-password/${token}\n\nIf you didn't ask for this, ignore this email; your password stays the same.\n\nWonder Learning CRM`,
    });
  }
  return { sent: true as const };
}

export async function resetPassword(token: string, password: string) {
  if (!password || password.length < 8) throw new DomainError("The new password must be at least 8 characters.");
  const r = await db.passwordReset.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!r || r.usedAt || r.expiresAt < new Date() || !r.user.active)
    throw new DomainError("This reset link has expired or was already used. Ask for a new one.");
  await db.$transaction([
    db.user.update({ where: { id: r.userId }, data: { passwordHash: await bcrypt.hash(password, 12), failedLogins: 0, lockedUntil: null } }),
    db.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
  ]);
}
