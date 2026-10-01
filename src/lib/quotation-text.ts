// Plain-text editing format for the quotation's kit sections, shared by the
// Settings screen and the server. "## Heading" starts a section; each other
// line is an item.

export type KitSection = { title: string; items: string[] };

export const sectionsToText = (s: KitSection[]) => s.map((x) => [`## ${x.title}`, ...x.items].join("\n")).join("\n\n");
export function textToSections(text: string): KitSection[] {
  const out: KitSection[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) out.push({ title: line.replace(/^#+\s*/, ""), items: [] });
    else if (out.length) out[out.length - 1].items.push(line.replace(/^[-•*]\s*/, ""));
    else out.push({ title: "Items", items: [line.replace(/^[-•*]\s*/, "")] });
  }
  return out.filter((s) => s.title);
}
