import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { canManageSettings, type SessionUser } from "@/lib/permissions";

/**
 * The signed-in user, re-read from the database on every request so that
 * deactivation or a role change takes effect immediately.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const u = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireSettingsAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!canManageSettings(u.role)) notFound();
  return u;
}
