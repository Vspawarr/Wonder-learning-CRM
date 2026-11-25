// R57: small helpers for the design templates (plain SVG strings, no other code needed, so the same templates run
// in the CRM and in the standalone HTML designer).

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Font for every design: Arial / Helvetica draw the same in the browser, in PNGs and in PDFs. */
export const FONT = "Arial, Helvetica, sans-serif";

/** Rough text width (Arial averages about 0.56 em; capitals and bold a little wider). */
export const textWidth = (text: string, size: number, bold = false) => {
  let w = 0;
  for (const ch of text) w += /[A-Z]/.test(ch) ? 0.68 : /[il.,:'|! ]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : 0.56;
  return w * size * (bold ? 1.07 : 1);
};

/** The largest size (from `size` down to `min`) at which the text fits `maxW`. */
export const fit = (text: string, maxW: number, size: number, min = 14, bold = false) => {
  let s = size;
  while (s > min && textWidth(text, s, bold) > maxW) s -= 1;
  return s;
};

export type TextOpts = { size: number; fill?: string; bold?: boolean; anchor?: "start" | "middle" | "end"; spacing?: number; weight?: number; family?: string; maxW?: number; min?: number };

/** One line of text; shrinks to `maxW` when given. */
export function text(x: number, y: number, s: string, o: TextOpts) {
  const size = o.maxW ? fit(s, o.maxW - (o.spacing ?? 0) * s.length, o.size, o.min ?? 14, o.bold) : o.size;
  return `<text x="${x}" y="${y}" font-family="${o.family ?? FONT}" font-size="${size}" fill="${o.fill ?? "#222"}"${o.bold ? ' font-weight="700"' : o.weight ? ` font-weight="${o.weight}"` : ""}${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.spacing ? ` letter-spacing="${o.spacing}"` : ""}>${esc(s)}</text>`;
}

/** Splits a school name into two balanced lines when it is long ("Blooming Buds" / "Nursery School"). */
export function twoLines(name: string, maxOneLine: number) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || name.length <= maxOneLine) return [name.trim()];
  let best = 1;
  let diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < diff) {
      diff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

let uid = 0;
/** An image fitted in a box (logo: whole image shown; photo: fills the box), with an optional rounded / round clip. */
export function image(href: string, x: number, y: number, w: number, h: number, o: { cover?: boolean; r?: number; circle?: boolean } = {}) {
  const id = `c${++uid}`;
  const clip = o.circle
    ? `<clipPath id="${id}"><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}"/></clipPath>`
    : o.r
      ? `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r}"/></clipPath>`
      : "";
  return `${clip}<image href="${esc(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${o.cover ? "xMidYMid slice" : "xMidYMid meet"}"${clip ? ` clip-path="url(#${id})"` : ""}/>`;
}

/* ---------- icons, drawn in a 60 × 60 box ---------- */

export function cakeIcon(x: number, y: number, s: number, c: { main: string; cream: string; flame?: string }) {
  const k = s / 60;
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect x="9" y="30" width="42" height="22" rx="5" fill="${c.main}"/><path d="M9 36 q5 5 10 0 q5 5 10 0 q5 5 11 0 q5 5 11 0 v-4 h-42z" fill="${c.cream}"/><rect x="18" y="17" width="4" height="13" rx="1.5" fill="${c.cream}"/><rect x="28" y="14" width="4" height="16" rx="1.5" fill="${c.cream}"/><rect x="38" y="17" width="4" height="13" rx="1.5" fill="${c.cream}"/><g fill="${c.flame ?? "#FF9F1C"}"><ellipse cx="20" cy="13" rx="2.6" ry="4"/><ellipse cx="30" cy="10" rx="2.6" ry="4"/><ellipse cx="40" cy="13" rx="2.6" ry="4"/></g><rect x="5" y="51" width="50" height="4" rx="2" fill="${c.main}"/></g>`;
}

export function mobileIcon(x: number, y: number, s: number, c: { main: string; screen: string }) {
  const k = s / 60;
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect x="16" y="4" width="28" height="52" rx="6" fill="${c.main}"/><rect x="20" y="11" width="20" height="34" rx="2" fill="${c.screen}"/><circle cx="30" cy="50" r="2.4" fill="${c.screen}"/></g>`;
}

export function homeIcon(x: number, y: number, s: number, c: { main: string; door: string; roof?: string }) {
  const k = s / 60;
  return `<g transform="translate(${x} ${y}) scale(${k})"><path d="M30 6 L56 30 H49 V54 H11 V30 H4 Z" fill="${c.main}"/><path d="M30 6 L56 30 H49 L30 13 L11 30 H4 Z" fill="${c.roof ?? c.main}"/><rect x="25" y="36" width="10" height="18" rx="1.5" fill="${c.door}"/></g>`;
}

/** Telephone handset in a circle. */
export function callIcon(cx: number, cy: number, r: number, c: { bg: string; fg: string }) {
  const k = (r * 1.25) / 24;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.bg}"/><g transform="translate(${cx - 12 * k} ${cy - 12 * k}) scale(${k})"><path fill="${c.fg}" d="M17.3 14.9c-1 0-2-.2-2.9-.5-.3-.1-.6 0-.8.2l-1.3 1.6c-2.3-1.1-4.5-3.2-5.6-5.6l1.6-1.4c.2-.2.3-.5.2-.8-.3-.9-.5-1.9-.5-2.9 0-.4-.4-.8-.8-.8H4.4c-.4 0-.9.2-.9.8 0 7.6 6.3 13.9 13.8 13.9.6 0 .8-.5.8-1v-2.8c0-.4-.4-.7-.8-.7z"/></g>`;
}

/** Icon in a round coloured badge (the yellow / lilac circles in the designs). */
export function badge(cx: number, cy: number, r: number, bg: string, inner: (x: number, y: number, s: number) => string) {
  const s = r * 1.5;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>${inner(cx - s / 2, cy - s / 2, s)}`;
}
