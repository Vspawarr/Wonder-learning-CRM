// Default company account for a kind of money (R39): cash payments → office cash, card spends → the company card,
// everything else → the first bank account. Empty until Accounts sets up their accounts.
import { db } from "@/lib/db";

export async function defaultAccountId(kind: "BANK" | "CASH" | "CARD") {
  const a = await db.moneyAccount.findFirst({ where: { kind, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  return a?.id ?? null;
}

/** Default account for money by its payment mode: cash → office cash, anything else → the bank. */
export const accountForMode = (mode: string | null | undefined) => defaultAccountId(mode && /cash/i.test(mode) ? "CASH" : "BANK");

/** A chosen account if it exists, else the default for the mode. */
export async function accountOrDefault(id: string | null | undefined, mode?: string | null) {
  if (id && (await db.moneyAccount.count({ where: { id } }))) return id;
  return accountForMode(mode);
}
