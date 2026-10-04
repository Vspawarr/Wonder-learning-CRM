// Role rules, shared by server checks and UI (no database access here).
import type { Role } from "@/generated/prisma/enums";

export type SessionUser = { id: string; name: string; email: string; role: Role };

/**
 * Directors, Admins and the Sales Head see the whole team's sales data.
 * Sales Managers and Sales Executives see only what is assigned to them.
 */
export const seesAllSales = (role: Role) => role === "DIRECTOR" || role === "ADMIN" || role === "SALES_HEAD";

/** Directors and Admins manage users, products and cities. */
export const canManageSettings = (role: Role) => role === "DIRECTOR" || role === "ADMIN";

/** Directors, Admins and the Sales Head manage products and their prices. */
export const canManageProducts = (role: Role) => canManageSettings(role) || role === "SALES_HEAD";

/** Directors, Admins and the Sales Head control money corrections: cancel invoices, delete payments, credit notes. */
export const canManageFinance = seesAllSales;

/**
 * The Accounts section: approving payments recorded by the team (R36). For now Directors and Admins;
 * a separate Accounts role can be added here later.
 */
export const canApprovePayments = canManageSettings;

/** Anyone who sees all sales data may view the user list. */
export const canViewUsers = seesAllSales;

/** Roles that can own leads, opportunities and sales tasks. */
export const SALES_ROLES: readonly Role[] = ["SALES_HEAD", "SALES_MANAGER", "SALES_EXECUTIVE"];

/** Those who see only their own data can only assign work to themselves. */
export const canAssignOthers = seesAllSales;
