// States and cities: the one list behind the lead form's dropdowns, the Excel
// template's State/City validation and the upload check. Managed in
// Settings → Locations; only active entries are offered.
import type { Db } from "@/lib/db";
import { db as defaultDb } from "@/lib/db";
import { DomainError } from "./errors";

export type Locations = { states: string[]; cities: Record<string, string[]> };

export async function getLocations(db: Db = defaultDb): Promise<Locations> {
  const [states, cities] = await Promise.all([
    db.state.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
    db.city.findMany({ where: { active: true, state: { active: true } }, orderBy: { name: "asc" }, select: { stateName: true, name: true } }),
  ]);
  const out: Record<string, string[]> = Object.fromEntries(states.map((s) => [s.name, [] as string[]]));
  for (const c of cities) out[c.stateName]?.push(c.name);
  return { states: states.map((s) => s.name), cities: out };
}

/** Why a state/city pair is not allowed, or null when it is. */
export function locationProblem(loc: Locations, state: string, city: string): string | null {
  if (!loc.states.includes(state)) return `"${state}" is not in the list of states.`;
  if (!loc.cities[state]?.includes(city)) return `"${city}" is not a listed city of ${state}.`;
  return null;
}

/**
 * State and city must come from Settings → Locations. A lead that already has a
 * state/city no longer listed may keep it unchanged when edited.
 */
export async function assertLocation(db: Db, state: string, city: string, current?: { state: string; city: string }) {
  if (current && current.state === state && current.city === city) return;
  const problem = locationProblem(await getLocations(db), state, city);
  if (problem) throw new DomainError(`${problem} Ask an admin to add it in Settings → Locations.`);
}
