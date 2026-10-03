// A kit changed for one school on a quotation: items taken out (to lower the price) and optional
// items added. Prices come from the kit's item prices and the optional items' prices (Settings → Products).
import type { ItemPrice, KitSection } from "./quotation-text";

export type KitAdd = { productId: string | null; name: string; sp: number; mrp: number };
export type KitCustom = { removed: string[]; added: KitAdd[] };

export const emptyCustom = (): KitCustom => ({ removed: [], added: [] });
export const isCustomised = (c: KitCustom | null | undefined): c is KitCustom => !!c && (c.removed.length > 0 || c.added.length > 0);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Price of a kit item by name (first match), or null if it has none. */
export function itemPrice(sections: KitSection[], name: string): ItemPrice | null {
  for (const s of sections) {
    const i = s.items.indexOf(name);
    if (i >= 0) return s.prices?.[i] ?? null;
  }
  return null;
}

/** How much the changes add to (or, if negative, take off) the kit's school price and MRP. */
export function customDelta(sections: KitSection[], c: KitCustom | null | undefined): ItemPrice {
  if (!c) return { sp: 0, mrp: 0 };
  let sp = 0;
  let mrp = 0;
  for (const name of c.removed) {
    const p = itemPrice(sections, name);
    if (p) {
      sp -= p.sp;
      mrp -= p.mrp;
    }
  }
  for (const a of c.added) {
    sp += a.sp;
    mrp += a.mrp;
  }
  return { sp: r2(sp), mrp: r2(mrp) };
}

/** Line text for the quotation: "Nursery Focus Kit (without Shape Kit; with Bag, Diary)". */
export function customLabel(kitName: string, c: KitCustom | null | undefined) {
  if (!isCustomised(c)) return kitName;
  const parts = [c.removed.length ? `without ${c.removed.join(", ")}` : "", c.added.length ? `with ${c.added.map((a) => a.name).join(", ")}` : ""];
  return `${kitName} (${parts.filter(Boolean).join("; ")})`.slice(0, 200);
}

/** The kit's checklist groups after the changes: removed items left out, added items in their own group. */
export function customSections(sections: KitSection[], c: KitCustom | null | undefined): KitSection[] {
  if (!isCustomised(c)) return sections;
  const gone = new Set(c.removed);
  const kept = sections
    .map((s) => {
      const idx = s.items.map((_, i) => i).filter((i) => !gone.has(s.items[i]));
      // A count like "Common Kit | 19 objects" is no longer right once something is taken out.
      const title = idx.length < s.items.length ? s.title.split(" | ")[0] : s.title;
      return { title, items: idx.map((i) => s.items[i]), ...(s.prices ? { prices: idx.map((i) => s.prices![i]) } : {}) };
    })
    .filter((s) => s.items.length);
  return c.added.length ? [...kept, { title: "Added for this school", items: c.added.map((a) => a.name) }] : kept;
}
