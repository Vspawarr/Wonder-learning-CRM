// Wonder Learning's product catalogue (R47, 26 Oct 2026), from the client's "Kit Cost" Excel:
// - sheet "pg to ukg": one student kit per class (Play Group, Nursery, LKG, UKG), each in four modules
//   (Class Connect, Home Connect, Skill Booster, Essential Kit) with every item's rate (school price) and MRP;
// - sheet "Other Note book": 10 other books / notebooks a school can add (no prices in the sheet yet).
// Kit prices are the sums of their items (they match the sheet's own module totals).
// After setup everything is edited in Settings → Products; the migration 20261020090000_kit_cost_price_list
// loaded the same data into the live database. The previous catalogue is kept in kits-old.ts (reference only).
import type { KitSection } from "./quotation-text";

/** "## Academic Kit | 10 Text Books + 4 Notebooks": the part after " | " prints under the heading. */
export const splitKitTitle = (title: string) => {
  const [head, ...rest] = title.split(" | ");
  return { head: head.trim(), sub: rest.join(" | ").trim() };
};

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

/** A priced line from the client's price list: school price (SP, "Rate") and MRP. */
export type PricedItem = { name: string; sp: number; mrp: number };
export type PricedGroup = { title: string; items: PricedItem[] };
export type PricedKit = { code: string; name: string; sp: number; mrp: number; color: string; groups: PricedGroup[] };

const P = (name: string, sp: number, mrp: number): PricedItem => ({ name, sp, mrp });
const sum = (items: PricedItem[], k: "sp" | "mrp") => Math.round(items.reduce((t, i) => t + i[k], 0) * 100) / 100;

/** Home Connect for Nursery, LKG and UKG (the sheet numbers it 1, 2, 4, 5, 6, 7: six items). */
const HOME_CONNECT = [
  P("32 F/B Flash cards", 45, 75),
  P("10 Posters", 100, 150),
  P("Chalkbook", 80, 140),
  P("Crayon box", 45, 75),
  P("Portfolio File", 25, 40),
  P("Portfolio book", 135, 300),
];
const SKILL_BOOSTER = [P("Art & Craft", 200, 400), P("Shape kit", 25, 35)];
const ESSENTIAL_KIT = [
  P("Bag", 250, 350),
  P("I-card - Student", 55, 90),
  P("Parent I Card", 5, 10),
  P("Diary", 70, 120),
  P("10 Greetings with Envelope", 50, 100),
  P("Memory Album", 110, 200),
  P("Sports Certificate", 20, 40),
  P("Graduation Certificate", 20, 40),
  P("Report Card", 30, 50),
  P("Sports Medal", 30, 50),
];

const kit = (code: string, name: string, color: string, groups: PricedGroup[]): PricedKit => {
  const items = groups.flatMap((g) => g.items);
  return { code, name, color, sp: sum(items, "sp"), mrp: sum(items, "mrp"), groups };
};

/** The four class kits from sheet "pg to ukg". */
export const CLASS_KITS: PricedKit[] = [
  kit("K01", "Play Group Kit", "#F08A1C", [
    { title: "Class Connect | Books", items: [P("Book 1 to 6", 900, 1200)] },
    {
      title: "Home Connect",
      items: [
        P("A5 Flash Cards", 170, 200),
        P("Posters 5", 50, 50),
        P("Scissor", 20, 25),
        P("Dough Art", 130, 150),
        P("Conical Crayons", 130, 150),
        P("Portfolio File", 25, 40),
        P("Portfolio book", 110, 300),
        P("Apron", 50, 75),
      ],
    },
    { title: "Skill Booster", items: [P("Art & Craft", 200, 400)] },
    { title: "Essential Kit", items: ESSENTIAL_KIT },
  ]),
  kit("K02", "Nursery Kit", "#EE2A50", [
    { title: "Class Connect | Books & Notebooks", items: [P("Book 1 to 9", 1650, 2250), P("Note book 2", 140, 190)] },
    { title: "Home Connect", items: HOME_CONNECT },
    { title: "Skill Booster", items: SKILL_BOOSTER },
    { title: "Essential Kit", items: ESSENTIAL_KIT },
  ]),
  kit("K03", "LKG Kit", "#3CAE1A", [
    { title: "Class Connect | Books & Notebooks", items: [P("Book 1 to 9", 1850, 2450), P("Note book 5", 225, 350)] },
    { title: "Home Connect", items: HOME_CONNECT },
    { title: "Skill Booster", items: SKILL_BOOSTER },
    { title: "Essential Kit", items: ESSENTIAL_KIT },
  ]),
  // The sheet's UKG Home Connect / Skill Booster / Essential headings say "LKG"; they are in the UKG column.
  kit("K04", "UKG Kit", "#1C75BC", [
    { title: "Class Connect | Books & Notebooks", items: [P("Book 1 to 9", 1850, 2450), P("Note book 7", 315, 490)] },
    { title: "Home Connect", items: HOME_CONNECT },
    { title: "Skill Booster", items: SKILL_BOOSTER },
    { title: "Essential Kit", items: ESSENTIAL_KIT },
  ]),
];

/** Sheet "Other Note book": other books / notebooks a school can add. No prices in the sheet yet. */
export const OTHER_BOOKS = [
  "HINDI -Swar",
  "HINDI -Vyanjan",
  "HINDI -Shabda",
  "HINDI -Matra",
  "Reader book 1",
  "Reader book 2",
  "Note Book Capital Letter",
  "Note Book Number 1 to 20",
  "Five Line Note book",
  "Square Note book",
];
export const OTHER_BOOKS_CATEGORY = "Optional – Other Book & Note Book";

/** A priced kit's groups with each item's price, as stored in Product.contents. */
export const kitSections = (k: { groups: PricedGroup[] }): KitSection[] =>
  k.groups.map((g) => ({ title: g.title, items: g.items.map((i) => i.name), prices: g.items.map((i) => ({ sp: i.sp, mrp: i.mrp })) }));

/** Everything a brand-new database starts with (the live one got the same through the migration). */
export const CATALOGUE: CatalogueProduct[] = [
  ...CLASS_KITS.map((k) => ({ code: k.code, name: k.name, category: "Student kit", price: k.sp, mrp: k.mrp, gstRate: 0, color: k.color, contents: kitSections(k) })),
  ...OTHER_BOOKS.map((name, i) => ({
    code: `O${String(i + 1).padStart(2, "0")}`,
    name,
    category: OTHER_BOOKS_CATEGORY,
    price: null,
    mrp: null,
    gstRate: 0,
    color: null,
    contents: null,
  })),
];
