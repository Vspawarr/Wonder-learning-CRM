// R57: the 8 student ID card designs from the client's PDF (Hiren Sir ID card designs), redrawn as live templates:
// the school's logo, name, address and phone and the child's photo and details are filled in. Card: 1374 × 868
// (standard ID card shape, 85.6 × 54 mm). Clean icons; the "GGK" mark in design 3 of the PDF is left out.
import type { CardData } from "./sample";
import { FONT, badge, cakeIcon, callIcon, esc, fit, homeIcon, image, mobileIcon, text, twoLines } from "./svg";

export const CARD_W = 1374;
export const CARD_H = 868;

type Fields = {
  x: number;
  /** Baselines of Name, Class, and the three icon rows. */
  ys: [number, number, number, number, number];
  /** Where the values start (after "Name :"). */
  valueX: number;
  /** Where the icon-row values start. */
  iconValueX: number;
  iconX: number;
  /** Right edge for values / dotted lines. */
  right: number;
  label: string;
  value?: string;
  dots?: string;
  size?: number;
  icons: (kind: "cake" | "mobile" | "home", x: number, y: number) => string;
};

/** Name, Class, birthday, mobile and home address rows, as in every design. */
function fields(d: CardData, f: Fields) {
  const size = f.size ?? 44;
  const vs = size - 4;
  const row = (y: number, valueX: number, value: string) =>
    `${f.dots ? `<line x1="${valueX - 8}" y1="${y + 8}" x2="${f.right}" y2="${y + 8}" stroke="${f.dots}" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>` : ""}${text(valueX, y, value, { size: vs, fill: f.value ?? "#111", bold: true, maxW: f.right - valueX - 6, min: 20 })}`;
  const [yn, yc, y1, y2, y3] = f.ys;
  return [
    text(f.x, yn, "Name :", { size, fill: f.label }),
    row(yn, f.valueX, d.studentName),
    text(f.x, yc, "Class :", { size, fill: f.label }),
    row(yc, f.valueX, d.className),
    ...(
      [
        ["cake", y1, d.dob],
        ["mobile", y2, d.mobile],
        ["home", y3, d.homeAddress],
      ] as const
    ).map(([k, y, v]) => `${f.icons(k, f.iconX, y)}${text(f.iconValueX - 32, y, ":", { size, fill: f.label })}${row(y, f.iconValueX, v)}`),
  ].join("");
}

/** The three icons in plain colours, centred on (x + 28, baseline − 14). */
const plainIcons = (main: string, light: string) => (k: "cake" | "mobile" | "home", x: number, y: number) =>
  k === "cake"
    ? cakeIcon(x, y - 46, 56, { main, cream: light })
    : k === "mobile"
      ? mobileIcon(x, y - 46, 56, { main, screen: light })
      : homeIcon(x, y - 46, 56, { main, door: light });

/** The three icons on round badges. */
const badgeIcons = (bg: string, main: string, light: string) => (k: "cake" | "mobile" | "home", x: number, y: number) =>
  badge(x + 30, y - 16, 31, bg, (ix, iy, s) =>
    k === "cake"
      ? cakeIcon(ix, iy, s, { main, cream: light })
      : k === "mobile"
        ? mobileIcon(ix, iy, s, { main, screen: light })
        : homeIcon(ix, iy, s, { main, door: light }),
  );

/** The school's logo, or its initials in a circle while there is none. */
export function logo(d: CardData, x: number, y: number, w: number, h: number, o: { circle?: boolean; color?: string } = {}) {
  if (d.logo) return image(d.logo, x, y, w, h, { circle: o.circle });
  const initials = d.schoolName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  const r = Math.min(w, h) / 2;
  return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${r}" fill="#fff" stroke="${o.color ?? "#999"}" stroke-width="4"/>${text(x + w / 2, y + h / 2 + r * 0.28, initials || "LOGO", { size: r * 0.75, bold: true, anchor: "middle", fill: o.color ?? "#999" })}`;
}

/** The child's photo in its frame, or a grey silhouette while there is none. */
function photo(d: CardData, x: number, y: number, w: number, h: number, r: number) {
  if (d.photo) return image(d.photo, x, y, w, h, { cover: true, r });
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#EEF0F4"/><circle cx="${x + w / 2}" cy="${y + h * 0.4}" r="${w * 0.2}" fill="#C9CED8"/><path d="M${x + w * 0.18} ${y + h} q${w * 0.32} -${h * 0.42} ${w * 0.64} 0z" fill="#C9CED8"/>`;
}

/** Phone number beside a handset icon. */
const phone = (d: CardData, cx: number, cy: number, r: number, c: { bg: string; fg: string; text: string }, maxW = 320) =>
  d.schoolPhone ? `${callIcon(cx, cy, r, c)}${text(cx + r + 10, cy + 10, d.schoolPhone, { size: 28, fill: c.text, maxW, min: 16 })}` : "";

const wrap = (body: string, bg = "#fff", border = "#1f1f1f") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" width="${CARD_W}" height="${CARD_H}" font-family="${FONT}"><rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>${body}<rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" fill="none" stroke="${border}" stroke-width="2"/></svg>`;

/** School name centred in a box: one line, or two (bold + lighter) when long. */
function schoolName(d: CardData, cx: number, y: number, w: number, o: { fill: string; size?: number; second?: string; spaced?: boolean }) {
  const lines = twoLines(d.schoolName.toUpperCase(), 18);
  const size = o.size ?? 70;
  if (lines.length === 1)
    return text(cx, y + size * 0.35, lines[0], {
      size,
      bold: true,
      fill: o.fill,
      anchor: "middle",
      maxW: w,
      min: 26,
    });
  const s1 = fit(lines[0], w, size, 26, true);
  const s2 = Math.min(fit(lines[1], w * 0.95, size * 0.62, 20), s1 * 0.75);
  return (
    text(cx, y - 2, lines[0], {
      size: s1,
      bold: true,
      fill: o.fill,
      anchor: "middle",
    }) +
    text(cx, y + s2 + 8, lines[1], {
      size: s2,
      fill: o.second ?? o.fill,
      anchor: "middle",
      spacing: o.spaced ? s2 * 0.18 : 0,
    })
  );
}

/** `assets`: the kind's pictures (backgrounds) as data URLs, loaded by the designer before drawing. */
export type Design = {
  id: string;
  name: string;
  colors: string[];
  render: (d: CardData, assets?: Record<string, string>) => string;
};

export type DesignKind = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Print size in mm (PDF page). */
  mm: [number, number];
  designs: Design[];
  /** Whether the designer asks for the sample student (ID cards) or only the school (book covers). */
  student: boolean;
  /** PNG / PDF pixels per design unit (2 for small vector cards, 1 for big picture covers). */
  scale: number;
  /** Pictures the designs draw on, by id → address (loaded once, then passed to `render`). */
  assets?: Record<string, string>;
};

export const ID_CARD_DESIGNS: Design[] = [
  {
    id: "blooming",
    name: "Red & orange",
    colors: ["#D02032", "#F37021", "#FFB000"],
    render: (d) =>
      wrap(
        `<rect x="0" y="0" width="54" height="240" fill="#D02032"/><rect x="0" y="240" width="54" height="432" fill="#FFB000"/><rect x="0" y="672" width="54" height="76" fill="#F37021"/><rect x="0" y="748" width="54" height="120" fill="#E53935"/>
<rect x="537" y="0" width="837" height="238" fill="#D02032"/>
${schoolName(d, 955, 105, 760, { fill: "#fff", size: 84, spaced: true })}
${logo(d, 110, 18, 380, 210, { color: "#D02032" })}
<rect x="155" y="263" width="327" height="388" rx="30" fill="#fff" stroke="#8B1A1A" stroke-width="8"/>${photo(d, 163, 271, 311, 372, 24)}
${fields(d, { x: 580, ys: [295, 380, 465, 550, 635], valueX: 730, iconValueX: 735, iconX: 612, right: 1345, label: "#222", icons: plainIcons("#8B1A1A", "#FFD23F") })}
<rect x="537" y="668" width="118" height="85" fill="#F37021"/><rect x="537" y="753" width="40" height="115" fill="#E53935"/><rect x="577" y="753" width="103" height="115" fill="#C00000"/><rect x="655" y="668" width="125" height="85" fill="#F15A24"/><rect x="680" y="753" width="100" height="115" fill="#E53935"/><rect x="780" y="668" width="125" height="85" fill="#F26B21"/>
<path d="M875 668 H1374 V868 H765 Z" fill="#D02032"/>
<rect x="54" y="746" width="483" height="122" fill="#D02032"/>
${text(92, 797, `Address: ${d.schoolAddress}`, { size: 30, fill: "#fff", maxW: 430, min: 16 })}
${phone(d, 108, 836, 17, { bg: "#fff", fg: "#D02032", text: "#fff" }, 380)}
${text(1310, 808, "Director", { size: 42, fill: "#fff", anchor: "end" })}`,
        "#fff",
        "#333",
      ),
  },
  {
    id: "green-waves",
    name: "Green waves",
    colors: ["#1E9E4A", "#7ED321", "#0B5A35"],
    render: (d) =>
      wrap(
        `<defs><linearGradient id="gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ADB1D"/><stop offset="1" stop-color="#14953F"/></linearGradient></defs>
<path d="M0 0 H570 C470 70 330 70 230 120 C110 180 50 320 70 600 L0 600 Z" fill="url(#gw)"/><path d="M0 0 H470 C380 50 260 60 170 110 C70 170 30 300 40 600 L0 600 Z" fill="#0F8C3B" opacity=".55"/>
<path d="M1374 500 C1250 480 1150 540 1120 610 C1210 560 1300 610 1330 700 C1350 760 1290 830 1030 868 H1374 Z" fill="url(#gw)"/><path d="M1374 560 C1290 560 1220 600 1200 650 C1280 620 1340 690 1340 760 C1340 820 1260 860 1180 868 H1374 Z" fill="#0F8C3B" opacity=".55"/>
<circle cx="235" cy="142" r="118" fill="#fff" stroke="#222" stroke-width="3"/>${logo(d, 140, 47, 190, 190, { circle: true, color: "#0B5A35" })}
${schoolName(d, 900, 150, 780, { fill: "#0B5A35", size: 66, second: "#1E9E4A" })}
<line x1="400" y1="272" x2="1340" y2="272" stroke="#0B5A35" stroke-width="4"/>
${phone(d, 1060, 238, 17, { bg: "#0B5A35", fg: "#fff", text: "#0B5A35" }, 250)}
<rect x="90" y="272" width="320" height="380" rx="24" fill="#fff" stroke="#0B5A35" stroke-width="8"/>${photo(d, 98, 280, 304, 364, 18)}
${fields(d, { x: 440, ys: [325, 410, 498, 585, 672], valueX: 590, iconValueX: 600, iconX: 452, right: 1255, label: "#222", dots: "#B9C7BF", icons: plainIcons("#0B5A35", "#9BE15D") })}
<path d="M0 742 H900 Q940 742 940 782 V832 H0 Z" fill="#45B649"/>
${text(32, 802, `Address: ${d.schoolAddress}`, { size: 32, fill: "#fff", maxW: 880, min: 16 })}
${text(1100, 795, "Director", { size: 42, fill: "#222", anchor: "middle" })}`,
      ),
  },
  {
    id: "blue-red",
    name: "Blue & red",
    colors: ["#0072BC", "#ED1C24", "#3B3F8F"],
    render: (d) =>
      wrap(
        `<rect x="0" y="0" width="1374" height="45" fill="#0072BC"/><path d="M1130 45 Q1200 70 1240 110 Q1270 230 1374 250 V45 Z" fill="#0072BC"/>
<rect x="0" y="818" width="1374" height="50" fill="#ED1C24"/><path d="M0 660 Q60 650 70 700 Q90 760 175 818 H0 Z" fill="#ED1C24"/>
<path d="M1200 0 Q1250 120 1374 245" stroke="#fff" stroke-width="2" stroke-dasharray="6 7" fill="none"/><path d="M1374 345 Q1290 380 1260 480 Q1240 560 1150 575" stroke="#0072BC" stroke-width="2" stroke-dasharray="6 7" fill="none"/>
<circle cx="180" cy="175" r="122" fill="#fff" stroke="#222" stroke-width="3"/>${logo(d, 82, 77, 196, 196, { circle: true, color: "#0072BC" })}
${schoolName(d, 760, 140, 700, { fill: "#1D2E6E", size: 64, second: "#0072BC" })}
${text(315, 258, `Address: ${d.schoolAddress}`, { size: 28, fill: "#222", maxW: 690, min: 15 })}
<line x1="310" y1="275" x2="1075" y2="275" stroke="#3B3F8F" stroke-width="5"/><line x1="1075" y1="275" x2="1295" y2="275" stroke="#ED1C24" stroke-width="5"/>
${phone(d, 1042, 238, 16, { bg: "#3B3F8F", fg: "#fff", text: "#3B3F8F" }, 160)}
<rect x="92" y="327" width="318" height="378" rx="22" fill="#fff" stroke="#ED1C24" stroke-width="8"/>${photo(d, 100, 335, 302, 362, 16)}
${fields(d, { x: 460, ys: [372, 458, 552, 632, 720], valueX: 612, iconValueX: 612, iconX: 484, right: 1350, label: "#222", dots: "#C9C9C9", icons: badgeIcons("#FFF200", "#1D6FB8", "#fff") })}
${text(1310, 785, "Director", { size: 42, fill: "#222", anchor: "end" })}`,
      ),
  },
  {
    id: "purple-stripe",
    name: "Purple stripe",
    colors: ["#5E4FA2", "#8B1A1A", "#2E2A7D"],
    render: (d) =>
      wrap(
        `${logo(d, 110, 40, 250, 200, { color: "#2E2A7D" })}
<line x1="372" y1="32" x2="372" y2="255" stroke="#2E2A7D" stroke-width="4"/>
${schoolName(d, 870, 120, 880, { fill: "#2E2A7D", size: 66, second: "#5E4FA2" })}
${text(388, 222, `Address: ${d.schoolAddress}`, { size: 32, fill: "#222", family: "Georgia, serif", maxW: 600, min: 16 })}
${phone(d, 1118, 48, 17, { bg: "#2E2A7D", fg: "#fff", text: "#2E2A7D" }, 210)}
<polygon points="0,345 1374,170 1374,186 0,368" fill="#5E4FA2"/><polygon points="520,316 1374,198 1374,336" fill="#8B1A1A"/><polygon points="0,375 520,316 0,382" fill="#5E4FA2"/>
<g fill="#F7A1A1">${[240, 262, 284, 304].map((y) => `<circle cx="1262" cy="${y}" r="3"/>`).join("")}</g><g fill="#4FC3F7">${[240, 262, 284, 304].map((y) => `<circle cx="1287" cy="${y}" r="3"/>`).join("")}</g>
<rect x="92" y="402" width="320" height="390" rx="26" fill="#fff" stroke="#C0112A" stroke-width="7"/>${photo(d, 99, 409, 306, 376, 20)}
${fields(d, { x: 460, ys: [405, 488, 575, 655, 740], valueX: 612, iconValueX: 615, iconX: 484, right: 1350, label: "#222", dots: "#C9C9C9", icons: badgeIcons("#FFF200", "#5E4FA2", "#fff") })}
<rect x="0" y="830" width="1374" height="38" fill="#5E4FA2"/>
${text(1310, 818, "Director", { size: 42, fill: "#222", anchor: "end" })}`,
      ),
  },
  {
    id: "cream-map",
    name: "Cream & navy",
    colors: ["#100D7A", "#ED1C24", "#FFFBF3"],
    render: (d) =>
      wrap(
        `<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" fill="#ECE7DC"/></pattern></defs><rect width="1374" height="868" fill="url(#dots)"/>
<path d="M1140 0 H1374 V245 Q1260 240 1250 150 Q1240 75 1160 65 Q1120 40 1140 0 Z" fill="#100D7A"/><path d="M1220 0 Q1250 110 1374 240" stroke="#fff" stroke-width="2" stroke-dasharray="6 7" fill="none"/>
<path d="M0 660 Q60 650 70 700 Q90 780 180 868 H0 Z" fill="#ED1C24"/><path d="M1374 465 Q1290 500 1270 590 Q1240 690 1150 700" stroke="#D7B4B4" stroke-width="4" stroke-dasharray="10 9" fill="none"/>
${logo(d, 110, 50, 250, 210, { color: "#100D7A" })}
${schoolName(d, 870, 150, 760, { fill: "#100D7A", size: 66, second: "#ED1C24" })}
<line x1="33" y1="303" x2="1345" y2="303" stroke="#2E3A8C" stroke-width="3"/>
<rect x="77" y="334" width="333" height="405" rx="26" fill="#fff" stroke="#ED1C24" stroke-width="3"/>${photo(d, 82, 339, 323, 395, 22)}
${fields(d, { x: 450, ys: [370, 455, 548, 630, 718], valueX: 600, iconValueX: 600, iconX: 484, right: 1345, label: "#222", dots: "#CFC8BA", icons: badgeIcons("#FFF200", "#100D7A", "#fff") })}
${text(195, 830, `Address: ${d.schoolAddress}`, { size: 30, fill: "#100D7A", maxW: 640, min: 15 })}
${phone(d, 875, 810, 22, { bg: "#2E3A8C", fg: "#fff", text: "#100D7A" }, 230)}
${text(1310, 805, "Director", { size: 42, fill: "#222", anchor: "end" })}`,
        "#FFFBF3",
      ),
  },
  {
    id: "navy-yellow",
    name: "Navy & yellow",
    colors: ["#2E3192", "#FFD23F", "#1C3F8C"],
    render: (d) =>
      wrap(
        `<rect x="0" y="0" width="1374" height="276" fill="#2E3192"/><rect x="0" y="276" width="1374" height="26" fill="#FFD23F"/>
<path d="M0 302 H415 Q380 480 210 545 Q100 580 0 545 Z" fill="#FFD23F"/><path d="M0 302 H395 Q360 470 200 528 Q100 560 0 525 Z" fill="#1C3F8C"/>
<rect x="110" y="40" width="250" height="180" rx="18" fill="#fff"/>${logo(d, 120, 48, 230, 164, { color: "#2E3192" })}
${schoolName(d, 870, 120, 860, { fill: "#fff", size: 66, second: "#FFD23F" })}
${text(235, 250, `Address: ${d.schoolAddress}`, { size: 30, fill: "#fff", maxW: 740, min: 15 })}
${phone(d, 1028, 241, 20, { bg: "#fff", fg: "#2E3192", text: "#fff" }, 290)}
<polygon points="1202,302 1374,302 1202,345" fill="#555"/>
<rect x="44" y="365" width="334" height="405" rx="26" fill="#fff" stroke="#2E3192" stroke-width="3"/>${photo(d, 49, 370, 324, 395, 22)}
${fields(d, { x: 410, ys: [400, 487, 572, 660, 748], valueX: 560, iconValueX: 575, iconX: 428, right: 1325, label: "#2E3192", value: "#1C1C5C", dots: "#C9C9DE", icons: plainIcons("#2E3192", "#fff") })}
<rect x="0" y="822" width="1374" height="30" fill="#FFD23F"/><rect x="0" y="852" width="1374" height="16" fill="#2E3192"/>
${text(1310, 806, "Director", { size: 42, fill: "#222", anchor: "end" })}`,
      ),
  },
  {
    id: "navy-circle",
    name: "Navy circle",
    colors: ["#002F63", "#F9DF00", "#003A7A"],
    render: (d) =>
      wrap(
        `<defs><clipPath id="card"><rect width="1374" height="868"/></clipPath></defs><g clip-path="url(#card)"><circle cx="110" cy="330" r="470" fill="#002F63"/><circle cx="300" cy="810" r="262" fill="#F9DF00"/></g>
<path d="M0 65 H975 Q1035 65 1035 125 Q1035 185 975 185 H0 Z" fill="#F9DF00"/>
${schoolName(d, 515, 120, 920, { fill: "#002F63", size: 62, second: "#003A7A" })}
${logo(d, 1120, 30, 230, 200, { color: "#002F63" })}
${text(605, 228, `Address: ${d.schoolAddress}`, { size: 30, fill: "#003A7A", maxW: 470, min: 15 })}
<line x1="580" y1="272" x2="1075" y2="272" stroke="#1a1a1a" stroke-width="3"/>
${phone(d, 1110, 262, 18, { bg: "#003A7A", fg: "#fff", text: "#003A7A" }, 220)}
<rect x="88" y="280" width="405" height="490" fill="#fff"/>${photo(d, 98, 290, 385, 470, 0)}
${fields(d, { x: 588, ys: [385, 470, 560, 645, 733], valueX: 735, iconValueX: 740, iconX: 612, right: 1345, label: "#222", dots: "#C9C9C9", icons: plainIcons("#003A7A", "#F9DF00") })}
${text(1310, 825, "Director", { size: 42, fill: "#222", anchor: "end" })}`,
      ),
  },
  {
    id: "navy-diagonal",
    name: "Navy diagonal",
    colors: ["#2E3192", "#C39BC9", "#0055A5"],
    render: (d) =>
      wrap(
        `<polygon points="0,0 1374,0 1374,210 0,420" fill="#2E3192"/><polygon points="440,355 1374,226 1374,262 500,365" fill="#C39BC9"/><polygon points="0,420 1374,210 1374,224 0,436" fill="#fff"/>
<rect x="110" y="40" width="250" height="180" rx="18" fill="#fff"/>${logo(d, 120, 48, 230, 164, { color: "#2E3192" })}
${schoolName(d, 880, 120, 860, { fill: "#fff", size: 66, second: "#C39BC9" })}
${text(325, 286, `Address : ${d.schoolAddress}`, { size: 30, fill: "#fff", bold: true, maxW: 560, min: 15 })}
${phone(d, 968, 228, 20, { bg: "#fff", fg: "#2E3192", text: "#fff" }, 300)}
<rect x="42" y="340" width="405" height="457" rx="40" fill="#fff" stroke="#0055A5" stroke-width="3"/>${photo(d, 48, 346, 393, 445, 36)}
${fields(d, { x: 495, ys: [405, 488, 572, 652, 738], valueX: 640, iconValueX: 640, iconX: 528, right: 1340, label: "#222", dots: "#C9C9C9", icons: badgeIcons("#C39BC9", "#2E3192", "#fff") })}
${text(1310, 845, "Director", { size: 40, fill: "#222", anchor: "end" })}`,
      ),
  },
];

/** Every design kind the tool can make; more (bag, diary, certificates…) are added here. */
export const ID_CARD_KIND: DesignKind = {
  id: "id-card",
  name: "Student ID card",
  width: CARD_W,
  height: CARD_H,
  mm: [85.6, 54],
  designs: ID_CARD_DESIGNS,
  student: true,
  scale: 2,
};
export const DESIGN_KINDS: DesignKind[] = [ID_CARD_KIND];

export { esc };
