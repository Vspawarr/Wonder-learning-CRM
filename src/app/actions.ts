"use server";

// Thin server-action layer: authenticate, call the domain service, revalidate.
// All rules and access checks live in src/server/*.
import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import type { SessionUser } from "@/lib/permissions";
import { requireUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import * as leads from "@/server/leads";
import * as opps from "@/server/opportunities";
import * as tasks from "@/server/tasks";
import * as activities from "@/server/activities";
import * as settings from "@/server/settings";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: (u: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await fn(user);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* auth */
export async function login(_: string | null, form: FormData): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirectTo: "/dashboard",
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return "Email or password is incorrect, or the account is inactive.";
    throw e; // redirect on success
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function changePassword(current: string, next: string) {
  return run((u) => settings.changeOwnPassword(u, current, next));
}

/* leads */
export const createLead = async (data: unknown) => run((u) => leads.createLead(u, data));
export const updateLead = async (id: string, data: unknown) => run((u) => leads.updateLead(u, id, data));
export const disqualifyLead = async (id: string, data: unknown) => run((u) => leads.disqualifyLead(u, id, data));
export const convertLead = async (id: string) => run((u) => leads.convertLead(u, id));

/* opportunities */
export const updateOpportunity = async (id: string, data: unknown) => run((u) => opps.updateOpportunity(u, id, data));
export const moveOpportunity = async (id: string, data: unknown) => run((u) => opps.moveOpportunity(u, id, data));

/* tasks & activity */
export const createTask = async (data: unknown) => run((u) => tasks.createTask(u, data));
export const completeTask = async (id: string, data: unknown) => run((u) => tasks.completeTask(u, id, data));
export const logActivity = async (data: unknown) => run((u) => activities.logActivity(u, data));

/* settings */
export const createUser = async (data: unknown) => run((u) => settings.createUser(u, data));
export const updateUser = async (id: string, data: unknown) => run((u) => settings.updateUser(u, id, data));
export const saveProduct = async (id: string | null, data: unknown) => run((u) => settings.saveProduct(u, id, data));
export const addCity = async (data: unknown) => run((u) => settings.addCity(u, data));
export const setCityActive = async (id: string, active: boolean) => run((u) => settings.setCityActive(u, id, active));
