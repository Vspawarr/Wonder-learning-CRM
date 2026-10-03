// Wonder Learning's product catalogue for a new database: one student kit per class,
// with its contents exactly as in the client's "WLI Checklist 2025-26", plus the
// optional add-ons from the quotation's "Optional" list. Kit prices are the rates on
// the client's sample PO (Caring Hood Preschool, AY 2026-27); add-ons have no price yet.
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
    price: 2360,
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
    price: 2760,
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
    price: 2975,
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
    price: 3175,
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

export const CATALOGUE: CatalogueProduct[] = [...KIT_PRODUCTS, ...ADDON_PRODUCTS];

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
