import { db } from "@/lib/db";
import { DEFAULT_FEATURES, FEATURES, type FeatureKey, type Features } from "@/lib/features";
import { canManageSettings, type SessionUser } from "@/lib/permissions";
import { DomainError } from "./errors";

const KEY = "features";

export async function getFeatures(): Promise<Features> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  const saved = (row?.value ?? {}) as Partial<Record<string, unknown>>;
  return Object.fromEntries(
    (Object.keys(FEATURES) as FeatureKey[]).map((k) => [k, typeof saved[k] === "boolean" ? saved[k] : DEFAULT_FEATURES[k]]),
  ) as Features;
}

export async function setFeature(user: SessionUser, key: string, on: boolean) {
  if (!canManageSettings(user.role)) throw new DomainError("Only a Director or Admin can switch features.");
  if (!(key in FEATURES)) throw new DomainError("Unknown feature.");
  const value = { ...(await getFeatures()), [key]: on };
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedById: user.id }, update: { value, updatedById: user.id } });
}
