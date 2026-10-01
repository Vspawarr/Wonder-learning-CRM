// Purchase order template for schools that don't have their own PO format.
// The school is the issuer: they fill the PO number/date (and kits if blank),
// sign, seal and send it back.
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { RUPEE_FONT } from "../quotation/rupee-font";

Font.register({ family: "Rupee", src: RUPEE_FONT });

export type PoTemplateData = {
  schoolName: string;
  address: string | null;
  quotationNumber: string;
  quotationDate: string;
  items: { description: string; price: number; qty: number | null }[];
  supplierName: string;
  supplierLines: string[];
  paymentTerms: string[];
};

const INK = "#222222";
const LINE = "#9A9A9A";
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: INK, padding: 44 },
  bold: { fontFamily: "Helvetica-Bold" },
  school: { fontFamily: "Helvetica-Bold", fontSize: 17, textAlign: "center" },
  schoolAddr: { textAlign: "center", marginTop: 3, color: "#444444" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 14, textAlign: "center", marginTop: 14, paddingVertical: 5, borderTopWidth: 1, borderBottomWidth: 1, letterSpacing: 2 },
  row: { flexDirection: "row", marginTop: 14 },
  half: { width: "50%" },
  fill: { flexDirection: "row", marginBottom: 7, alignItems: "flex-end" },
  blank: { flex: 1, borderBottomWidth: 0.8, borderBottomColor: LINE, marginLeft: 4, minHeight: 12 },
  table: { marginTop: 16, borderWidth: 0.8, borderColor: LINE },
  tr: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINE, minHeight: 24, alignItems: "center" },
  th: { backgroundColor: "#EFEFEF" },
  cNo: { width: 30, paddingLeft: 6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 70, textAlign: "center", borderLeftWidth: 0.8, borderLeftColor: LINE, alignSelf: "stretch", paddingTop: 7 },
  cRate: { width: 80, textAlign: "right", paddingRight: 6, borderLeftWidth: 0.8, borderLeftColor: LINE, alignSelf: "stretch", paddingTop: 7 },
  cAmt: { width: 90, textAlign: "right", paddingRight: 6, borderLeftWidth: 0.8, borderLeftColor: LINE, alignSelf: "stretch", paddingTop: 7 },
  h: { fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 5 },
  li: { flexDirection: "row", marginBottom: 3 },
  signRow: { flexDirection: "row", marginTop: 34, justifyContent: "space-between" },
  box: { width: 220, height: 80, borderWidth: 0.8, borderColor: LINE, borderStyle: "dashed", justifyContent: "flex-end", padding: 6 },
  foot: { position: "absolute", bottom: 26, left: 44, right: 44, fontSize: 7.5, color: "#888888", textAlign: "center" },
});

function Rs({ n }: { n: number }) {
  return (
    <>
      <Text style={{ fontFamily: "Rupee" }}>₹</Text>
      {n.toFixed(2)}
    </>
  );
}

function Fill({ label, value }: { label: string; value?: string }) {
  return (
    <View style={s.fill}>
      <Text style={s.bold}>{label}</Text>
      {value ? <Text style={{ marginLeft: 4 }}>{value}</Text> : <View style={s.blank} />}
    </View>
  );
}

export function PoTemplate({ d }: { d: PoTemplateData }) {
  const allQty = d.items.every((i) => i.qty !== null);
  const total = d.items.reduce((t, i) => t + (i.qty ?? 0) * i.price, 0);
  return (
    <Document title={`Purchase order – ${d.schoolName}`} creator="Wonder Learning CRM">
      <Page size="A4" style={s.page}>
        <Text style={s.school}>{d.schoolName}</Text>
        {d.address ? <Text style={s.schoolAddr}>{d.address}</Text> : null}
        <Text style={s.title}>PURCHASE ORDER</Text>

        <View style={s.row}>
          <View style={[s.half, { paddingRight: 16 }]}>
            <Text style={[s.bold, { marginBottom: 4 }]}>To,</Text>
            <Text style={[s.bold, { marginBottom: 3 }]}>{d.supplierName}</Text>
            {d.supplierLines.map((l, i) => (
              <Text key={i} style={{ marginBottom: 2 }}>
                {l}
              </Text>
            ))}
          </View>
          <View style={s.half}>
            <Fill label="PO No.:" />
            <Fill label="PO Date:" />
            <Fill label="Ref. Quotation:" value={`${d.quotationNumber} dated ${d.quotationDate}`} />
            <Fill label="Academic year:" />
          </View>
        </View>

        <Text style={{ marginTop: 14 }}>
          Please supply the following as per your quotation {d.quotationNumber}, on the terms below.
        </Text>

        <View style={s.table}>
          <View style={[s.tr, s.th]}>
            <Text style={[s.cNo, s.bold]}>No.</Text>
            <Text style={[s.cDesc, s.bold]}>Description</Text>
            <Text style={[s.cQty, s.bold, { paddingTop: 0, alignSelf: "center" }]}>No. of kits</Text>
            <Text style={[s.cRate, s.bold, { paddingTop: 0, alignSelf: "center" }]}>Rate</Text>
            <Text style={[s.cAmt, s.bold, { paddingTop: 0, alignSelf: "center" }]}>Amount</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cNo}>{i + 1}</Text>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cQty}>{it.qty ?? ""}</Text>
              <Text style={s.cRate}>
                <Rs n={it.price} />
              </Text>
              <Text style={s.cAmt}>{it.qty ? <Rs n={it.qty * it.price} /> : ""}</Text>
            </View>
          ))}
          <View style={[s.tr, { borderBottomWidth: 0 }]}>
            <Text style={[s.cNo]} />
            <Text style={[s.cDesc, s.bold, { textAlign: "right", paddingRight: 8 }]}>Total</Text>
            <Text style={s.cQty} />
            <Text style={s.cRate} />
            <Text style={[s.cAmt, s.bold]}>{allQty ? <Rs n={total} /> : ""}</Text>
          </View>
        </View>

        <Fill label="Delivery address (if different):" />
        <Fill label="Expected delivery by:" />

        {d.paymentTerms.length ? (
          <View wrap={false}>
            <Text style={s.h}>Payment terms (as per quotation)</Text>
            {d.paymentTerms.map((t, i) => (
              <View key={i} style={s.li}>
                <Text style={{ width: 14 }}>{i + 1}.</Text>
                <Text style={{ flex: 1 }}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.signRow} wrap={false}>
          <View style={s.box}>
            <Text>Authorised signatory (name &amp; signature)</Text>
          </View>
          <View style={s.box}>
            <Text>School seal</Text>
          </View>
        </View>

        <Text style={s.foot} fixed>
          Please sign, seal and send this purchase order back to {d.supplierName}. Template provided for the school&apos;s convenience.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPoTemplatePdf(d: PoTemplateData): Promise<Buffer> {
  return renderToBuffer(<PoTemplate d={d} />);
}
