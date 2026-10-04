// Kit checklist PDF in the layout of the client's "WLI Checklist": one A4 page per kit,
// framed in the kit's colour, with Sr. No. / Item Description / Kit Contents, where the
// last column names each group ("Common Kit · 19 objects") beside its items.
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { splitKitTitle } from "@/lib/kits";
import type { KitSection } from "@/lib/quotation-text";

export type ChecklistKit = { name: string; color: string | null; contents: KitSection[] };

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#111111", padding: 30 },
  frame: { borderWidth: 7 },
  inner: { backgroundColor: "#FFFFFF" },
  title: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 15, textAlign: "center", paddingVertical: 3 },
  head: { flexDirection: "row", borderTopWidth: 0.8, borderBottomWidth: 0.8, borderColor: "#333333" },
  hText: { fontFamily: "Helvetica-Bold", textAlign: "center", paddingVertical: 3.5 },
  group: { flexDirection: "row", borderBottomWidth: 0.8, borderColor: "#333333" },
  rows: { width: "64%" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#666666", minHeight: 13.6, alignItems: "center" },
  rowLast: { borderBottomWidth: 0 },
  no: { width: 52, textAlign: "center", borderRightWidth: 0.8, borderColor: "#333333", paddingVertical: 1.8 },
  desc: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 5, paddingVertical: 1.8, borderRightWidth: 0.8, borderColor: "#333333" },
  label: { width: "36%", justifyContent: "center", alignItems: "center", padding: 6 },
  labelHead: { fontFamily: "Helvetica-Bold", textAlign: "center" },
  labelSub: { textAlign: "center", marginTop: 3 },
  colNo: { width: 52, borderRightWidth: 0.8, borderColor: "#333333" },
  colDesc: { width: "64%", borderRightWidth: 0.8, borderColor: "#333333" },
});

/** Light tint of the kit colour for the header row, like the original. */
function tint(hex: string, amount = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function KitPage({ kit }: { kit: ChecklistKit }) {
  const color = kit.color ?? "#3D3BA8";
  let sr = 0;
  return (
    <Page size="A4" style={s.page}>
      <View style={[s.frame, { borderColor: color, backgroundColor: color }]} wrap={false}>
        <Text style={s.title}>{kit.name.replace(/\s*Kit$/i, "")}</Text>
        <View style={s.inner}>
          <View style={[s.head, { backgroundColor: tint(color) }]}>
            <View style={{ width: "64%", flexDirection: "row" }}>
              <Text style={[s.hText, s.colNo]}>Sr. No.</Text>
              <Text style={[s.hText, { flexGrow: 1 }]}>Item Description</Text>
            </View>
            <Text style={[s.hText, { width: "36%", borderLeftWidth: 0.8, borderColor: "#333333" }]}>Kit Contents</Text>
          </View>
          {kit.contents.map((g, gi) => {
            const { head, sub } = splitKitTitle(g.title);
            return (
              <View key={gi} style={s.group} wrap={false}>
                <View style={s.rows}>
                  {g.items.map((item, i) => (
                    <View key={i} style={[s.row, i === g.items.length - 1 ? s.rowLast : {}]}>
                      <Text style={s.no}>{++sr}</Text>
                      <Text style={[s.desc, { borderRightWidth: 0 }]}>{item}</Text>
                    </View>
                  ))}
                </View>
                <View style={[s.label, { borderLeftWidth: 0.8, borderColor: "#333333" }]}>
                  <Text style={s.labelHead}>{head}</Text>
                  {sub ? <Text style={s.labelSub}>{sub}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Page>
  );
}

export async function renderChecklistPdf(kits: ChecklistKit[]): Promise<Buffer> {
  return renderToBuffer(
    <Document title="Kit checklist" author="Wonder Learning India Pvt. Ltd.">
      {kits.map((k, i) => (
        <KitPage key={i} kit={k} />
      ))}
    </Document>,
  );
}
