// R58: the Wonder Learning book covers with the school's own logo and address. Each cover (back + front, as printed)
// is the client's artwork with Wonder Learning's logo box (front, top) and logo + address (back) painted out; the
// school's logo / name go in the front box and its logo, name, address and phone on the back.
// Pictures: public/designs/covers/<class>-book-<n>.jpg, made from the client's PDF at 120 dpi (2064 × 1320).
import { logo, type Design, type DesignKind } from "./id-cards";
import type { CardData } from "./sample";
import { FONT, callIcon, esc, fit, textWidth, text, twoLines } from "./svg";

export const COVER_W = 2064;
export const COVER_H = 1320;
const NAVY = "#0B4F8A";

/** Splits text into lines no wider than `maxW` (at most `max` lines; the last one shrinks if still too long). */
function lines(s: string, maxW: number, size: number, max = 2) {
  const out: string[] = [];
  let cur = "";
  for (const w of s.trim().split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, size) > maxW && out.length < max - 1) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** Front: the school's logo and name in the white box at the top (1163–1934 × 35–285). */
function front(d: CardData) {
  const [x0, y0, x1, y1] = [1163, 35, 1934, 285];
  const name = twoLines(d.schoolName, 22);
  const hasLogo = !!d.logo;
  const lw = hasLogo ? 210 : 190;
  const tx = x0 + 40 + lw + 30;
  const tw = x1 - 30 - tx;
  const cy = (y0 + y1) / 2;
  const size = Math.min(...name.map((l) => fit(l.toUpperCase(), tw, name.length > 1 ? 54 : 62, 24, true)));
  const top = cy - ((name.length - 1) * size * 1.15) / 2 + size * 0.36;
  return `${logo(d, x0 + 40, cy - lw / 2, lw, lw, { color: NAVY })}${name
    .map((l, i) =>
      text(tx + tw / 2, top + i * size * 1.15, l.toUpperCase(), {
        size,
        bold: true,
        fill: NAVY,
        anchor: "middle",
      }),
    )
    .join("")}`;
}

/** Back: the school's logo, name, address and phone in the white cloud (centre x 502, from y 856). */
function back(d: CardData) {
  const cx = 502;
  const maxW = 620;
  let y = 856;
  let out = d.logo ? logo(d, cx - 150, y, 300, 120) : "";
  y += d.logo ? 120 + 52 : 40;
  const nameSize = fit(d.schoolName, maxW, 44, 24, true);
  out += text(cx, y, d.schoolName, {
    size: nameSize,
    bold: true,
    fill: "#222",
    anchor: "middle",
  });
  y += 46;
  if (d.schoolAddress.trim()) {
    const label = "Address: ";
    const all = lines(label + d.schoolAddress, maxW, 30);
    all.forEach((l, i) => {
      const size = fit(l, maxW, 30, 18);
      const body = i === 0 ? `<tspan font-weight="700">${esc(label.trim())}</tspan> ${esc(l.slice(label.length))}` : esc(l);
      out += `<text x="${cx}" y="${y}" font-family="${FONT}" font-size="${size}" fill="#222" text-anchor="middle">${body}</text>`;
      y += 38;
    });
  }
  if (d.schoolPhone.trim()) {
    const size = 30;
    const w = textWidth(d.schoolPhone, size) + 44;
    const x = cx - w / 2;
    out += callIcon(x + 15, y - 10, 15, { bg: NAVY, fg: "#fff" }) + text(x + 44, y, d.schoolPhone, { size, fill: "#222" });
  }
  return out;
}

const cover = (id: string, name: string, colors: string[]): Design => ({
  id,
  name,
  colors,
  render: (d, assets) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_W} ${COVER_H}" width="${COVER_W}" height="${COVER_H}" font-family="${FONT}"><rect width="${COVER_W}" height="${COVER_H}" fill="#fff"/>${
      assets?.[id] ? `<image href="${assets[id]}" x="0" y="0" width="${COVER_W}" height="${COVER_H}"/>` : ""
    }${front(d)}${back(d)}</svg>`,
});

const UKG_TOPICS = [
  "Me & Myself",
  "My Happy Family",
  "World Around",
  "Let's Ride, Sail and Fly!",
  "Nature's Bounty",
  "Flavours of Nature",
  "My Furry Friends",
  "Amazing Sky",
  "My Earth, My Home",
];
const BLUES = ["#0B4F8A", "#29A9E0"];

export const UKG_COVERS: DesignKind = {
  id: "ukg-covers",
  name: "UKG book covers",
  width: COVER_W,
  height: COVER_H,
  // The client's file: 1238.4 × 792 pt (back + front of one book).
  mm: [436.9, 279.4],
  designs: UKG_TOPICS.map((t, i) => cover(`ukg-book-${i + 1}`, `Book ${i + 1} · ${t}`, BLUES)),
  student: false,
  scale: 1,
  assets: Object.fromEntries(UKG_TOPICS.map((_, i) => [`ukg-book-${i + 1}`, `/designs/covers/ukg-book-${i + 1}.jpg`])),
};

/** Book cover kinds (CRM only: the pictures are too big for the standalone file). Nursery and LKG to follow. */
export const COVER_KINDS: DesignKind[] = [UKG_COVERS];
