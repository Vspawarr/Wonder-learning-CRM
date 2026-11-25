// R57: the details a design starts with, so the sales person sees a finished card at once: a made-up school logo and
// a cartoon child (no real photo). Replaced by the school's own logo and details in the designer.

const svgData = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const SAMPLE_LOGO = svgData(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#fff" stroke="#F28C1E" stroke-width="8"/><g fill="#F7C820">${Array.from({ length: 12 }, (_, i) => `<rect x="96" y="26" width="8" height="22" rx="4" transform="rotate(${i * 30} 100 82)"/>`).join("")}</g><circle cx="100" cy="82" r="28" fill="#F28C1E"/><path d="M58 128 q42 -26 84 0 v26 h-84z" fill="#6CB33F"/><text x="100" y="178" font-family="Arial" font-size="22" font-weight="700" text-anchor="middle" fill="#6C2D91">SUNSHINE</text></svg>`,
);

export const SAMPLE_PHOTO = svgData(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360"><rect width="300" height="360" fill="#DCEFFB"/><circle cx="150" cy="380" r="150" fill="#1FA5DE"/><path d="M110 250 q40 30 80 0 l6 40 h-92z" fill="#fff"/><rect x="128" y="200" width="44" height="50" rx="16" fill="#E2A97E"/><circle cx="150" cy="150" r="78" fill="#E8B48A"/><path d="M72 150 q-6 -86 78 -88 q84 2 78 88 q-10 -46 -42 -54 q-20 22 -76 18 q-30 6 -38 36z" fill="#2B1A12"/><circle cx="122" cy="156" r="8" fill="#2B1A12"/><circle cx="178" cy="156" r="8" fill="#2B1A12"/><circle cx="125" cy="153" r="2.5" fill="#fff"/><circle cx="181" cy="153" r="2.5" fill="#fff"/><path d="M126 190 q24 22 48 0" stroke="#7A2E1C" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="104" cy="182" r="10" fill="#FF7A8A" opacity=".4"/><circle cx="196" cy="182" r="10" fill="#FF7A8A" opacity=".4"/></svg>`,
);

export type CardData = {
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  /** Data URL of the school's logo, or null for a placeholder. */
  logo: string | null;
  /** Data URL of the child's photo, or null for a placeholder. */
  photo: string | null;
  studentName: string;
  className: string;
  dob: string;
  mobile: string;
  homeAddress: string;
};

export const SAMPLE_CARD: CardData = {
  schoolName: "Sunshine Kids Preschool",
  schoolAddress: "Baner Road, Pune 411045",
  schoolPhone: "020 2729 1234",
  logo: SAMPLE_LOGO,
  photo: SAMPLE_PHOTO,
  studentName: "Aarav Sharma",
  className: "LKG – A",
  dob: "12/06/2021",
  mobile: "98765 43210",
  homeAddress: "Flat 4, Green Park, Baner, Pune",
};
