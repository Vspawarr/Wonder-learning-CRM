// The invoice PDF, in the same branded style as the quotation (provisional
// layout until the business's own invoice sample is matched).
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { FooterBand, Header, Money } from "../quotation/pdf";

export type InvoicePdfData = {
  number: string;
  date: string; // DD-MM-YYYY
  dueDate: string;
  orderNumber: string;
  schoolName: string;
  contactName: string;
  address: string | null;
  cancelled: boolean;
  items: { description: string; qty: number; price: number; gstRate: number; amount: number }[];
  subtotal: number;
  gstAmount: number;
  total: number;
  paid: number;
  balance: number;
  payments: { date: string; amount: number; mode: string; reference: string | null }[];
  footerLines: string[];
  company: string;
};

const FOOTER_H = (284 * 621) / 2471;

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10.5, color: "#222222", paddingBottom: FOOTER_H + 16 },
  bold: { fontFamily: "Helvetica-Bold" },
  line: { marginBottom: 4 },
  addressRow: { flexDirection: "row", marginTop: 30, marginHorizontal: 54 },
  toCol: { width: 290, paddingRight: 12 },
  metaCol: { flexGrow: 1 },
  table: { marginTop: 22, marginHorizontal: 54 },
  tr: { flexDirection: "row", minHeight: 26, alignItems: "center", borderBottomWidth: 0.6, borderBottomColor: "#DDDDDD" },
  trHead: { backgroundColor: "#EFEFEF" },
  trAlt: { backgroundColor: "#F5F5F5" },
  cNo: { width: 32, paddingLeft: 6 },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 44, textAlign: "right" },
  cRate: { width: 82, textAlign: "right" },
  cGst: { width: 46, textAlign: "right" },
  cAmt: { width: 92, textAlign: "right", paddingRight: 6 },
  sumWrap: { marginHorizontal: 54, marginTop: 10, alignItems: "flex-end" },
  sumRow: { flexDirection: "row", width: 240, paddingVertical: 3 },
  sumLabel: { flex: 1, textAlign: "right", paddingRight: 10 },
  sumVal: { width: 98, textAlign: "right", paddingRight: 6 },
  totalRow: { borderTopWidth: 0.8, borderTopColor: "#000000", marginTop: 2, paddingTop: 5 },
  balanceRow: { backgroundColor: "#6C2D91", color: "#FFFFFF", marginTop: 4, paddingVertical: 5 },
  section: { marginHorizontal: 54, marginTop: 22 },
  h: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 6 },
  cancelled: { marginHorizontal: 54, marginTop: 14, color: "#E0141E", fontFamily: "Helvetica-Bold", fontSize: 14 },
});

function SumRow({ label, n, style }: { label: string; n: number; style?: Style[] }) {
  return (
    <View style={[s.sumRow, ...(style ?? [])]}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={s.sumVal}>
        <Money n={n} />
      </Text>
    </View>
  );
}

export function InvoiceDocument({ d }: { d: InvoicePdfData }) {
  const showGst = d.items.some((i) => i.gstRate > 0);
  return (
    <Document title={`Invoice ${d.number}`} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      <Page size="LETTER" style={s.page}>
        <Header title="INVOICE" align="right" />
        {d.cancelled ? <Text style={s.cancelled}>CANCELLED</Text> : null}
        <View style={s.addressRow}>
          <View style={s.toCol}>
            <Text style={[s.bold, s.line]}>To,</Text>
            <Text style={[s.bold, s.line]}>{d.schoolName}</Text>
            <Text style={s.line}>{d.contactName}</Text>
            {d.address ? <Text>{d.address}</Text> : null}
          </View>
          <View style={s.metaCol}>
            <Text style={s.line}>
              <Text style={s.bold}>Invoice No.: </Text>
              {d.number}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Date: </Text>
              {d.date}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Due date: </Text>
              {d.dueDate}
            </Text>
            <Text>
              <Text style={s.bold}>Order No.: </Text>
              {d.orderNumber}
            </Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={[s.tr, s.trHead]} fixed>
            <Text style={[s.cNo, s.bold]}>No.</Text>
            <Text style={[s.cDesc, s.bold]}>Description</Text>
            <Text style={[s.cQty, s.bold]}>Qty</Text>
            <Text style={[s.cRate, s.bold]}>Rate</Text>
            <Text style={[s.cGst, s.bold]}>GST</Text>
            <Text style={[s.cAmt, s.bold]}>Amount</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={i % 2 ? [s.tr, s.trAlt] : s.tr} wrap={false}>
              <Text style={s.cNo}>{i + 1}</Text>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cQty}>{it.qty}</Text>
              <Text style={s.cRate}>
                <Money n={it.price} />
              </Text>
              <Text style={s.cGst}>{it.gstRate}%</Text>
              <Text style={s.cAmt}>
                <Money n={it.amount} />
              </Text>
            </View>
          ))}
        </View>

        <View style={s.sumWrap} wrap={false}>
          <SumRow label="Subtotal" n={d.subtotal} />
          <SumRow label={showGst ? "GST" : "GST (0%)"} n={d.gstAmount} />
          <SumRow label="Total" n={d.total} style={[s.totalRow, s.bold]} />
          {d.paid > 0 ? <SumRow label="Received" n={d.paid} /> : null}
          {!d.cancelled ? <SumRow label="Balance due" n={d.balance} style={[s.balanceRow, s.bold]} /> : null}
        </View>

        {d.payments.length ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h}>Payments received</Text>
            {d.payments.map((p, i) => (
              <Text key={i} style={s.line}>
                {p.date} · <Money n={p.amount} /> · {p.mode}
                {p.reference ? ` (${p.reference})` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={[s.section, { marginTop: 30 }]} wrap={false}>
          <Text style={s.line}>Thank you for your business.</Text>
          <Text style={[s.line, { marginTop: 18 }]}>{d.company}</Text>
          <Text style={{ marginTop: 24 }}>Authorised Signatory</Text>
        </View>
        <FooterBand lines={d.footerLines} />
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument d={d} />);
}
