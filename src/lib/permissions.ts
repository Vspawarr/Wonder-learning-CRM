// Role rules, shared by server checks and UI (no database access here).
import type { Role } from "@/generated/prisma/enums";

export type SessionUser = { id: string; name: string; email: string; role: Role };

/** Everyone except a Sales Executive sees the whole team's sales data. */
export const seesAllSales = (role: Role) => role !== "SALES_EXECUTIVE";

/** Directors and Admins manage users, products and cities. */
export const canManageSettings = (role: Role) => role === "DIRECTOR" || role === "ADMIN";

/** Anyone who sees all sales data may view the user list. */
export const canViewUsers = seesAllSales;

/** Roles that can own leads, opportunities and sales tasks. */
export const SALES_ROLES: readonly Role[] = ["SALES_HEAD", "SALES_MANAGER", "SALES_EXECUTIVE"];

/** Sales Executives can only assign work to themselves. */
export const canAssignOthers = seesAllSales;
