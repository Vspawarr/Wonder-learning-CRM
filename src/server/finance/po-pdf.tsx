// Purchase order template in the client's own PO format (their PO/2526/92 for Caring Hood
// Preschool): Wonder Learning prepares it from a sent quotation, the school checks it,
// signs, stamps and sends it back. Layout follows the original, section by section.
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import "../quotation/pdf"; // registers the Rupee font

// Keep words whole ("clearance", not "clear-ance").
Font.registerHyphenationCallback((word) => [word]);

export type PoTemplateData = {
  poNumber: string;
  issueDate: string; // DD-MM-YYYY
  academicYear: string; // "2026 - 27"
  seller: { name: string; lines: string[] };
  buyer: { name: string; lines: string[] };
  requisitioner: string;
  deliveryDate: string | null; // DD-MM-YY
  shipVia: string;
  shippingTerms: string;
  items: { description: string; qty: number | null; rate: number }[];
  remarks: string[];
  terms: string[];
  cheques: { mode: string; date: string | null; amount: number | null }[];
  customise: { label: string; yes: boolean }[];
  bankLines: string[];
  executive: { name: string; mobile: string | null; email: string | null };
};

const NAVY = "#3B4A87";
const PEACH = "#F8D9C0";
const BEIGE = "#EFECE4";
const LINE = "#555555";
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8.6, color: "#111111", paddingTop: 28, paddingHorizontal: 50, paddingBottom: 22 },
  bold: { fontFamily: "Helvetica-Bold" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 17, color: "#1F6FB5", textAlign: "center", textDecoration: "underline" },
  ay: { textAlign: "center", marginTop: 3, fontSize: 9 },
  two: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  col: { width: 250 },
  kv: { flexDirection: "row", borderWidth: 0.8, borderColor: LINE },
  kvK: { width: 120, padding: 2.5, textAlign: "center", borderRightWidth: 0.8, borderColor: LINE },
  kvV: { flexGrow: 1, padding: 2.5, textAlign: "center" },
  band: { backgroundColor: NAVY, color: "#FFFFFF", fontFamily: "Helvetica-Bold", textAlign: "center", paddingVertical: 2.5 },
  party: { backgroundColor: PEACH, fontFamily: "Helvetica-Bold", textAlign: "center", paddingVertical: 2.5, borderWidth: 0.8, borderColor: LINE },
  partyLine: { marginTop: 1.5 },
  grid: { flexDirection: "row", borderWidth: 0.8, borderColor: LINE },
  hCell: { backgroundColor: NAVY, color: "#FFFFFF", fontFamily: "Helvetica-Bold", textAlign: "center", justifyContent: "center", padding: 4 },
  cell: { padding: 4, textAlign: "center", borderTopWidth: 0.6, borderColor: "#BBBBBB" },
  vline: { borderRightWidth: 0.8, borderColor: LINE },
  remarkHead: { backgroundColor: BEIGE, fontFamily: "Helvetica-Bold", textAlign: "center", padding: 3, borderWidth: 0.8, borderColor: LINE },
  remark: { padding: 2.5, borderWidth: 0.8, borderTopWidth: 0, borderColor: LINE },
  sumK: { width: 62, padding: 2.5 },
  sumV: { width: 92, padding: 2.5, textAlign: "right" },
  boxed: { borderWidth: 0.8, borderColor: LINE },
  exclude: { flexDirection: "row", borderWidth: 0.8, borderColor: LINE, marginTop: 18, alignItems: "stretch" },
  rowLine: { flexDirection: "row", borderTopWidth: 0.6, borderColor: LINE },
  foot: { marginTop: 10, textAlign: "center", fontSize: 7.4, color: "#1F6FB5" },
});

/** Advance cheque table column widths (the right panel is 212pt wide). */
const CHQ = [76, 70, 66];

const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "**bold**" segments inside a line. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) => (
        <Text key={i} style={i % 2 ? s.bold : {}}>
          {part}
        </Text>
      ))}
    </>
  );
}

function Party({ band, p, note }: { band: string; p: { name: string; lines: string[] }; note?: string }) {
  return (
    <View>
      <Text style={s.band}>{band}</Text>
      <Text style={s.party}>{p.name}</Text>
      {p.lines.map((l, i) => (
        <Text key={i} style={s.partyLine}>
          {l}
        </Text>
      ))}
      {note ? (
        <Text style={s.partyLine}>
          <Text style={s.bold}>Note</Text>: {note}
        </Text>
      ) : null}
    </View>
  );
}

export function PoTemplateDocument({ d }: { d: PoTemplateData }) {
  const lines = d.items.map((i) => ({ ...i, amount: i.qty ? i.qty * i.rate : null }));
  const qtyTotal = lines.reduce((t, l) => t + (l.qty ?? 0), 0);
  const total = lines.reduce((t, l) => t + (l.amount ?? 0), 0);
  const anyQty = lines.some((l) => l.qty);
  const W = { no: 70, desc: 100, dem: 76, sup: 76, rate: 92, amt: 98 };
  const cheques = [...d.cheques, ...Array.from({ length: Math.max(0, 4 - d.cheques.length) }, () => null)].slice(0, Math.max(4, d.cheques.length));
  return (
    <Document title={`Purchase order ${d.poNumber} · ${d.buyer.name}`} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>PURCHASE ORDER</Text>
        <Text style={s.ay}>Academic Year {d.academicYear}</Text>

        <View style={s.two}>
          <View style={s.col}>
            <View style={s.kv}>
              <Text style={s.kvK}>Purchase Order No.</Text>
              <Text style={s.kvV}>{d.poNumber}</Text>
            </View>
            <Party band="Seller" p={d.seller} />
          </View>
          <View style={s.col}>
            <View style={s.kv}>
              <Text style={s.kvK}>Date of issue</Text>
              <Text style={s.kvV}>{d.issueDate}</Text>
            </View>
            <Party band="Buyer" p={d.buyer} note="Above mentioned is billing address" />
          </View>
        </View>

        <View style={[s.grid, { marginTop: 10 }]}>
          {[
            ["REQUISITIONER", d.requisitioner, 100],
            ["EXPECTED DELIVERY DATE", d.deliveryDate ?? "", 100],
            ["SHIP VIA", d.shipVia, 90],
            ["SHIPPING TERMS", d.shippingTerms, 222],
          ].map(([h, v, w], i, a) => (
            <View key={i} style={[{ width: w as number }, i < a.length - 1 ? s.vline : {}]}>
              <Text style={[s.hCell, { minHeight: 24 }]}>{h as string}</Text>
              <Text style={[s.cell, { borderTopWidth: 0, paddingVertical: 6 }]}>{v as string}</Text>
            </View>
          ))}
        </View>

        <View style={[s.boxed, { marginTop: 10 }]}>
          <View style={{ flexDirection: "row" }}>
            <Text style={[s.hCell, s.vline, { width: W.no, paddingTop: 10 }]}>SR. NO.</Text>
            <Text style={[s.hCell, s.vline, { width: W.desc, paddingTop: 10 }]}>DESCRIPTION</Text>
            <View style={[s.vline, { width: W.dem + W.sup }]}>
              <Text style={[s.hCell, { borderBottomWidth: 0.6, borderColor: "#FFFFFF" }]}>QTY</Text>
              <View style={{ flexDirection: "row" }}>
                <Text style={[s.hCell, s.vline, { width: W.dem }]}>DEMANDED</Text>
                <Text style={[s.hCell, { width: W.sup }]}>SUPPLIED</Text>
              </View>
            </View>
            <Text style={[s.hCell, s.vline, { width: W.rate, paddingTop: 10 }]}>RATE</Text>
            <Text style={[s.hCell, { width: W.amt, paddingTop: 10 }]}>AMOUNT</Text>
          </View>
          {lines.map((l, i) => (
            <View key={i} style={{ flexDirection: "row" }} wrap={false}>
              <Text style={[s.cell, s.vline, { width: W.no }]}>{i + 1}</Text>
              <Text style={[s.cell, s.vline, { width: W.desc }]}>{l.description.toUpperCase()}</Text>
              <Text style={[s.cell, s.vline, { width: W.dem }]}>{l.qty ?? ""}</Text>
              <Text style={[s.cell, s.vline, { width: W.sup }]}> </Text>
              <Text style={[s.cell, s.vline, { width: W.rate, textAlign: "right" }]}>{money(l.rate)}</Text>
              <Text style={[s.cell, { width: W.amt, textAlign: "right", backgroundColor: "#F2F2F2" }]}>{l.amount === null ? "" : money(l.amount)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row" }}>
            <Text style={[s.cell, { width: W.no + W.desc }]}> </Text>
            <Text style={[s.cell, s.bold, { width: W.dem, backgroundColor: "#D9DEF0" }]}>{anyQty ? qtyTotal : ""}</Text>
            <Text style={[s.cell, { width: W.sup }]}> </Text>
            <Text style={[s.cell, { width: W.rate, textAlign: "left" }]}>TOTAL</Text>
            <Text style={[s.cell, s.bold, { width: W.amt, textAlign: "right" }]}>{anyQty ? money(total) : ""}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", marginTop: 0 }}>
          <View style={{ width: W.no + W.desc + W.dem + W.sup }}>
            <Text style={s.remarkHead}>Aditional Remark</Text>
            {(d.remarks.length ? d.remarks : ["", ""]).map((r, i) => (
              <Text key={i} style={s.remark}>
                {r ? `${i + 1}) ${r}` : " "}
              </Text>
            ))}
          </View>
          <View style={{ width: W.rate + W.amt }}>
            {[
              ["SUBTOTAL", "-"],
              ["OTHERS", "-"],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: "row" }}>
                <Text style={s.sumK}>{k}</Text>
                <Text style={[s.sumV, s.boxed, { textAlign: "left" }]}>{v}</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row" }}>
              <Text style={s.sumK}>TOTAL</Text>
              <Text style={[s.sumV, s.bold, s.boxed, { backgroundColor: "#D9DEF0" }]}>{anyQty ? `INR ${money(total)}` : "INR"}</Text>
            </View>
          </View>
        </View>

        <View style={[s.boxed, { marginTop: 12 }]} wrap={false}>
          <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderColor: LINE }}>
            <Text style={{ backgroundColor: "#E5141B", color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 10, padding: 9, width: 112 }}>Material Exclude</Text>
            <Text style={{ color: "#E5141B", padding: 9 }}>Refer Cheklist</Text>
          </View>
          <View style={{ flexDirection: "row" }}>
            <View style={[s.vline, { width: 300 }]}>
              <Text style={[s.bold, { backgroundColor: BEIGE, padding: 3, fontSize: 10 }]}>Terms and Conditions:</Text>
              {d.terms.map((t, i) => (
                <Text key={i} style={{ padding: 2.5, borderTopWidth: 0.6, borderColor: LINE }}>
                  {i + 1}) <Rich text={t} />
                </Text>
              ))}
            </View>
            <View style={{ flexGrow: 1 }}>
              <Text style={[s.bold, { backgroundColor: BEIGE, padding: 3, fontSize: 10, textAlign: "center" }]}>Advance Cheque/DD details</Text>
              {[["Payment details", "Dated", "Amount"] as const, ...cheques.map((c) => [c?.mode ?? "", c?.date ?? "", c?.amount ? c.amount.toFixed(2) : ""] as const)].map(
                (cells, r) => (
                  <View key={r} style={s.rowLine}>
                    {cells.map((t, i) => (
                      <View key={i} style={[{ width: CHQ[i], justifyContent: "center" }, i < 2 ? s.vline : {}]}>
                        <Text style={{ padding: 2.5, textAlign: "center", minHeight: 13 }}>{t || " "}</Text>
                      </View>
                    ))}
                  </View>
                ),
              )}
            </View>
          </View>
          <View style={[s.rowLine, { borderTopWidth: 0.8 }]}>
            <View style={[s.vline, { width: 300 }]}>
              <View style={{ flexDirection: "row" }}>
                <Text style={[s.bold, { width: 222, padding: 2.5 }]}>Items to be customised with school name & logo</Text>
                <Text style={{ flexGrow: 1, padding: 2.5, textAlign: "center", borderLeftWidth: 0.6, borderColor: LINE }}>YES / NO</Text>
              </View>
              {d.customise.map((c, i) => (
                <View key={i} style={s.rowLine}>
                  <Text style={{ width: 222, padding: 2.5 }}>{c.label}</Text>
                  <Text style={{ flexGrow: 1, padding: 2.5, textAlign: "center", borderLeftWidth: 0.6, borderColor: LINE }}>{c.yes ? "YES" : "NO"}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexGrow: 1 }}>
              <Text style={[s.bold, { backgroundColor: BEIGE, padding: 3, textAlign: "center", fontSize: 9.5 }]}>Account Details</Text>
              {d.bankLines.map((l, i) => (
                <Text key={i} style={{ padding: 2.5, borderTopWidth: i ? 0 : 0.6, borderColor: LINE }}>
                  {l}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 34 }} wrap={false}>
          {["Executive Name", "Date:……………….", "Stamp", "Requisitioned By"].map((t) => (
            <Text key={t} style={s.bold}>
              {t}
            </Text>
          ))}
        </View>
        <Text style={s.foot}>
          If you have any questions about this purchase order, please contact: {d.executive.name}
          {d.executive.mobile ? ` ; Mob: ${d.executive.mobile}` : ""}
          {d.executive.email ? `, E-mail: ${d.executive.email}` : ""}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPoTemplatePdf(d: PoTemplateData): Promise<Buffer> {
  return renderToBuffer(<PoTemplateDocument d={d} />);
}
