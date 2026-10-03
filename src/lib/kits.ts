// Wonder Learning's product catalogue for a new database: one student kit per class,
// with its contents exactly as in the client's "WLI Checklist 2025-26", plus the
// optional add-ons from the quotation's "Optional" list. Prices come only from the client's
// Excel price list (R29): the sample PDFs (PO, checklist, receipt) are formats, not prices, so the
// class kits K01–K04 have no price until the client gives one.
// After setup everything is edited in Settings → Products. The one-time migration
// 20261009090000_class_kits loaded the same data into the live database.
import type { KitSection } from "./quotation-text";

/** "## Academic Kit | 10 Text Books + 4 Notebooks": the part after " | " prints under the heading. */
export const splitKitTitle = (title: string) => {
  const [head, ...rest] = title.split(" | ");
  return { head: head.trim(), sub: rest.join(" | ").trim() };
};

const COMMON_KIT: KitSection = {
  title: "Common Kit | 19 objects",
  items: [
    "School Bag",
    "Student's Diary",
    "Child I Card with holder & sling",
    "Parent - Escort Card",
    "Birthday Greeting Card",
    "Children’s Day Greeting Card",
    "New Year Greeting Card",
    "Grand Parents Day Invitation card",
    "PTM Invitation Card – 1",
    "PTM Invitation Card – 2",
    "PTM Invitation Card – 3",
    "PTM Invitation Card – 4",
    "Sports Day Invitation card",
    "Sports Day Medal",
    "Sports Day Certificate",
    "Annual Day Invitation card",
    "Report Card / Achievement Card",
    "Graduation Certificate",
    "My Book of Memories",
  ],
};
const TEXT_BOOKS = Array.from({ length: 10 }, (_, i) => `Text Book- ${i + 1}`);
const RESOURCE_SCHOOL: KitSection = { title: "Resource Kit – School | 3 objects", items: ["Portfolio File", "Portfolio Book", "Art & Craft Kit"] };
const RESOURCE_HOME_5 = (crayons: string): KitSection => ({
  title: "Resource Kit – Home | 5 objects",
  items: ["Flash Cards", "Academic Posters", "Tracing Sheets", "Writing Marker / Sketch pen", crayons],
});

export type CatalogueProduct = {
  code: string;
  name: string;
  category: string;
  price: number | null;
  mrp?: number | null;
  gstRate: number;
  /** Heading colour on the kit checklist. */
  color: string | null;
  contents: KitSection[] | null;
};

export const KIT_PRODUCTS: CatalogueProduct[] = [
  {
    code: "K01",
    name: "Play Group Kit",
    category: "Student kit",
    price: null,
    gstRate: 0,
    color: "#F08A1C",
    contents: [
      COMMON_KIT,
      {
        title: "Academic Kit | 6 Text Books",
        items: [
          "TB - My A to Z Picture Text Book",
          "TB - My 1 to 10 Number Text Book",
          "TB – My book of Concepts",
          "TB - My Scribbling book",
          "TB – Book of Festivals",
          "TB - Rhymes - Introductory",
        ],
      },
      RESOURCE_SCHOOL,
      {
        title: "Resource Kit – Home | 6 objects",
        items: ["Flash Cards", "Academic Posters", "Conical Crayon Box", "Plastic Scissor", "Apron", "Play Dough kit"],
      },
    ],
  },
  {
    code: "K02",
    name: "Nursery Kit",
    category: "Student kit",
    price: null,
    gstRate: 0,
    color: "#EE2A50",
    contents: [
      COMMON_KIT,
      { title: "Academic Kit | 10 Text Books", items: TEXT_BOOKS },
      { title: "Optional Notebooks", items: ["My Practice Notebook – Maths", "My Practice Notebook – English"] },
      RESOURCE_SCHOOL,
      RESOURCE_HOME_5("Crayon Box"),
    ],
  },
  {
    code: "K03",
    name: "LKG / Jr. KG Kit",
    category: "Student kit",
    price: null,
    gstRate: 0,
    color: "#3CAE1A",
    contents: [
      COMMON_KIT,
      {
        title: "Academic Kit | 10 Text Books + 4 Notebooks",
        items: [
          ...TEXT_BOOKS,
          "NB – My English Writing Book- 1",
          "NB – My English Writing Book- 2",
          "NB - My Number Writing Book- 1",
          "NB - My Number Writing Book- 2",
        ],
      },
      {
        title: "Optional Subjects",
        items: ["Hindi Akshar Gyan – Swar Text Book", "Hindi Akshar Gyan – Vyanjan Text Book", "My 5 Line Note Book – Swar", "My 5 Line Note Book – Vyanjan"],
      },
      RESOURCE_SCHOOL,
      RESOURCE_HOME_5("Crayon Box"),
    ],
  },
  {
    code: "K04",
    name: "UKG / Sr. KG Kit",
    category: "Student kit",
    price: null,
    gstRate: 0,
    color: "#1C75BC",
    contents: [
      COMMON_KIT,
      {
        title: "Academic Kit | 10 Text Books + 5 Notebooks",
        items: [
          ...TEXT_BOOKS,
          "NB - My Notation Writing Notebook",
          "NB - My Number Writing Notebook- 1",
          "NB - My Number Writing Notebook- 2",
          "NB – My Phonics Notebook- 1",
          "NB – My Phonics Notebook- 2",
        ],
      },
      {
        title: "Optional Subjects",
        // The client's checklist lists "NB - My 5 Line Notebook 1" twice; the second is Notebook 2.
        items: [
          "My Cursive Textbook",
          "My Phonics Reader Book",
          "Hindi Text Book – Shabad Gyan",
          "Hindi Text Book – Matra Gyan",
          "NB - My 5 Line Notebook 1",
          "NB - My 5 Line Notebook 2",
        ],
      },
      RESOURCE_SCHOOL,
      RESOURCE_HOME_5("Jumbo Crayon Box"),
    ],
  },
];

/** Optional subjects a school can add to a kit (same names as the quotation's "Optional" list). */
export const ADDON_PRODUCTS: CatalogueProduct[] = [
  "Hindi Swar TB & NB",
  "Hindi Vyanjan TB & NB",
  "Hindi Shabad Gyan TB & NB",
  "Hindi Matra Gyan TB & NB",
  "Cursive Text Book",
  "My Reader Book- Phonics",
  "Nursery Practice Notebooks- 2",
].map((name, i) => ({ code: `A${String(i + 1).padStart(2, "0")}`, name, category: "Optional add-on", price: null, gstRate: 0, color: null, contents: null }));


/** The sample services seeded at the start, removed by the class-kits migration (matched on code and name). */
export const OLD_SAMPLES: [string, string][] = [
  ["P01", "Curriculum License"],
  ["P02", "Preschool Setup Package"],
  ["P03", "Teacher Training"],
  ["P04", "Parent Workshop"],
  ["P05", "School Audit"],
  ["P06", "Marketing Campaign"],
  ["P07", "Branding Support"],
];

/* ---------- Price list (client's "Pric_list.xlsx" and "cost_for_nursery.xlsx", Oct 2026) ---------- */

/** A priced line from the client's price list: school price (SP) and MRP. */
export type PricedItem = { name: string; sp: number; mrp: number };
export type PricedGroup = { title: string; items: PricedItem[] };
export type PricedKit = { code: string; name: string; sp: number; mrp: number; groups: PricedGroup[] };

const P = (name: string, sp: number, mrp: number): PricedItem => ({ name, sp, mrp });
const BOOKS_1_9 = P("Book 1 to 9", 1792, 2688);
const HOME_CONNECT = [P("Flash Cards", 40, 75), P("10 Academic Posters", 50, 100), P("3 Tracing Sheets", 70, 80), P("Marker", 7, 12)];
const PORTFOLIO = [P("Portfolio Book", 130, 300), P("Portfolio File", 25, 45)];
const SKILL_BOOSTER = [P("Shape Kit", 20, 35), P("20 Art & Craft activities (Take Aways)", 220, 430)];
const ESSENTIAL_BASE = [
  P("I-card - Student", 60, 70),
  P("Escort Card 2", 10, 15),
  P("3 Greetings with Envelopes", 45, 60),
  P("Sports Certificate", 15, 25),
  P("Graduation Certificate", 15, 25),
  P("Report Card", 65, 90),
];
// The sheet also has "Freight Transport" 100 / 0 in Focus and Plus. Transport depends on the school's
// location, so it is not part of the kit: it is added per quotation, hidden inside the price (R29).
const PACKING = [P("Kit Box & Packaging", 120, 145), P("Assessments", 100, 125), P("Kit Box", 70, 110)];
/** The freight line taken out of the Focus and Plus kits (R29). */
export const SHEET_FREIGHT = P("Freight Transport", 100, 0);

/** Nursery kit types from the "kit type" sheet. Totals are the client's (they add up), less freight for Focus and Plus. */
export const NURSERY_KIT_TYPES: PricedKit[] = [
  {
    code: "K05",
    name: "Nursery Core Kit",
    sp: 2112,
    mrp: 3248,
    groups: [{ title: "Core Kit", items: [BOOKS_1_9, ...PORTFOLIO, P("Report Card", 65, 90), P("Assessments", 100, 125)] }],
  },
  {
    code: "K06",
    name: "Nursery Focus Kit",
    sp: 2854, // sheet: 2,954 incl. freight 100
    mrp: 4430,
    groups: [
      { title: "Class Connect", items: [BOOKS_1_9] },
      { title: "Home Connect", items: [...HOME_CONNECT, ...PORTFOLIO] },
      { title: "Skill Booster", items: SKILL_BOOSTER },
      { title: "Essential Kit", items: [...ESSENTIAL_BASE, ...PACKING] },
    ],
  },
  {
    code: "K07",
    name: "Nursery Plus Kit",
    sp: 3144, // sheet: 3,244 incl. freight 100
    mrp: 4970,
    groups: [
      { title: "Class Connect", items: [BOOKS_1_9, P("Practice Notebook - Letters Nursery", 55, 90), P("Practice Notebook - Numbers Nursery", 55, 90)] },
      { title: "Home Connect", items: [...HOME_CONNECT, ...PORTFOLIO] },
      { title: "Skill Booster", items: SKILL_BOOSTER },
      {
        title: "Essential Kit",
        items: [...ESSENTIAL_BASE, P("Diary", 60, 120), P("Memory album", 90, 200), P("Sports Medal", 30, 40), ...PACKING],
      },
    ],
  },
];

/** Optional items from the "add itms" sheet (same as "Sheet2" of the Nursery cost file). Names as in the sheet. */
export const OPTIONAL_ITEMS: { category: string; items: PricedItem[] }[] = [
  {
    category: "Optional – Book",
    items: [
      P("Swar Book Hindi", 140, 180),
      P("Vyanjan Book Hindi", 160, 195),
      P("Matra Book Hindi", 135, 190),
      P("Shabda Book Hindi", 140, 195),
      P("Reading book 1", 150, 195),
      P("Reading book 2", 150, 195),
      P("Swar Marathi", 150, 195),
      P("Vyanjan Marathi", 160, 195),
      P("Pattern Book", 160, 195),
      P("Cursive Book", 140, 195),
    ],
  },
  {
    category: "Optional – Notebook",
    items: [
      P("Practice Notebook - Letters Nursery", 55, 90),
      P("Practice Notebook - Numbers Nursery", 55, 90),
      P("English Writing LKG Notebook - Book 1", 48, 90),
      P("English Writing LKG Notebook - Book 2", 44, 90),
      P("My Number Notebook LKG - Book 1", 48, 90),
      P("My Number Notebook LKG - Book 2", 47, 90),
      P("My Five Line Notebook", 25, 90),
      P("Akshar Gyan - Swar (Hindi) Notebook", 55, 90),
      P("Akshar Gyan - Vyanjan (Hindi) Notebook", 55, 90),
      P("My Phonics Notebook UKG - Book 1", 39.6, 90),
      P("My Phonics Notebook UKG - Book 2", 40, 90),
      P("My Number Notebook UKG - Book 1", 39.6, 90),
      P("My Number Notebook UKG - Book 2", 37.4, 90),
      P("Notation Writing Notebook UKG - Book 1", 35.2, 90),
    ],
  },
  {
    category: "Optional – Other",
    items: [
      P("Bag", 225, 300),
      P("Diary", 60, 120),
      P("Memory album", 90, 200),
      P("Sports Medal", 30, 40),
      P("Jumbo Crayon box", 55, 65),
      P("Plastic Scissor", 18, 25),
      P("Play Dough", 120, 150),
      P("Conical Crayons", 120, 150),
      P("Apron", 100, 120),
    ],
  },
];

/** A priced kit's groups with each item's price, as stored in Product.contents. */
export const kitSections = (k: PricedKit): KitSection[] =>
  k.groups.map((g) => ({ title: g.title, items: g.items.map((i) => i.name), prices: g.items.map((i) => ({ sp: i.sp, mrp: i.mrp })) }));

/** Codes of the placeholder add-ons (A01–A07) replaced by the price list's optional items. */
export const OLD_ADDON_CODES = ADDON_PRODUCTS.map((a) => [a.code, a.name] as [string, string]);

/** Everything a brand-new database starts with (the live one got the same through migrations). */
export const CATALOGUE: CatalogueProduct[] = [
  ...KIT_PRODUCTS,
  ...NURSERY_KIT_TYPES.map((k) => ({
    code: k.code,
    name: k.name,
    category: "Student kit",
    price: k.sp,
    mrp: k.mrp,
    gstRate: 0,
    color: "#EE2A50",
    contents: kitSections(k),
  })),
  ...OPTIONAL_ITEMS.flatMap((g) => g.items.map((it) => ({ name: it.name, category: g.category, price: it.sp, mrp: it.mrp }))).map((it, i) => ({
    ...it,
    code: `O${String(i + 1).padStart(2, "0")}`,
    gstRate: 0,
    color: null,
    contents: null,
  })),
];
