/** Whole rupees: ₹1,97,000; a minus goes in front (−₹4,000). */
export const inr = (n: number) => {
  const r = Math.round(n || 0);
  return (r < 0 ? "−₹" : "₹") + Math.abs(r).toLocaleString("en-IN");
};

/** Short rupee form: ₹1.2 L, ₹3.40 Cr. */
export function inrS(n: number): string {
  n = n || 0;
  if (n < 0) return "−" + inrS(-n);
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(1) + " L";
  return inr(n);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const AV_COLORS = ["#3D3BA8", "#7A48B8", "#1C86C4", "#D9412D", "#0E8F79", "#C77A00", "#C2417A", "#4A8F3C", "#7A5C3E", "#5B6B8C", "#B0570F"];

/** Stable avatar colour per user id. */
export function avatarColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

/** Exact rupees with paise when present: ₹1,97,000 or ₹2,800.50. */
export const inrExact = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "2026-10-01" → "01/10/2026". */
export const dmy = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "—");
