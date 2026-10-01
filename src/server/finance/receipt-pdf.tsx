// The payment receipt PDF, in the same branded style as quotations and invoices.
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { FooterBand, Header, Money } from "../quotation/pdf";

export type ReceiptPdfData = {
  number: string;
  date: string; // DD-MM-YYYY
  schoolName: string;
  contactName: string;
  address: string | null;
  amount: number;
  amountWords: string;
  mode: string;
  reference: string | null;
  note: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTotal: number;
  receivedToDate: number;
  balance: number;
  receivedBy: string;
  footerLines: string[];
  company: string;
};

const FOOTER_H = (284 * 621) / 2471;

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10.5, color: "#222222", paddingBottom: FOOTER_H + 16 },
  bold: { fontFamily: "Helvetica-Bold" },
  line: { marginBottom: 4 },
  row: { flexDirection: "row", marginTop: 30, marginHorizontal: 54 },
  toCol: { width: 290, paddingRight: 12 },
  metaCol: { flexGrow: 1 },
  amountBox: { marginHorizontal: 54, marginTop: 24, borderWidth: 0.8, borderColor: "#6C2D91", borderRadius: 6, padding: 14 },
  amountLabel: { fontSize: 9.5, color: "#6C2D91", fontFamily: "Helvetica-Bold", marginBottom: 4 },
  amount: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  words: { marginTop: 6, fontSize: 10 },
  table: { marginHorizontal: 54, marginTop: 20 },
  tr: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.6, borderBottomColor: "#DDDDDD" },
  k: { width: 190, color: "#555555" },
  v: { flex: 1 },
  sign: { marginHorizontal: 54, marginTop: 36, flexDirection: "row", justifyContent: "space-between" },
});

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <View style={s.tr} wrap={false}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{children}</Text>
    </View>
  );
}

export function ReceiptDocument({ d }: { d: ReceiptPdfData }) {
  return (
    <Document title={`Receipt ${d.number}`} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      <Page size="LETTER" style={s.page}>
        <Header title="PAYMENT RECEIPT" align="right" />
        <View style={s.row}>
          <View style={s.toCol}>
            <Text style={[s.bold, s.line]}>Received from,</Text>
            <Text style={[s.bold, s.line]}>{d.schoolName}</Text>
            <Text style={s.line}>{d.contactName}</Text>
            {d.address ? <Text>{d.address}</Text> : null}
          </View>
          <View style={s.metaCol}>
            <Text style={s.line}>
              <Text style={s.bold}>Receipt No.: </Text>
              {d.number}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Date: </Text>
              {d.date}
            </Text>
          </View>
        </View>

        <View style={s.amountBox} wrap={false}>
          <Text style={s.amountLabel}>AMOUNT RECEIVED</Text>
          <Text style={s.amount}>
            <Money n={d.amount} />
          </Text>
          <Text style={s.words}>{d.amountWords}</Text>
        </View>

        <View style={s.table}>
          <Row k="Payment mode">{d.mode}</Row>
          {d.reference ? <Row k="Reference (UTR / cheque no.)">{d.reference}</Row> : null}
          <Row k="Against invoice">
            {d.invoiceNumber} dated {d.invoiceDate}
          </Row>
          <Row k="Invoice total">
            <Money n={d.invoiceTotal} />
          </Row>
          <Row k="Total received so far">
            <Money n={d.receivedToDate} />
          </Row>
          <Row k="Balance due">{d.balance > 0 ? <Money n={d.balance} /> : "Nil · paid in full"}</Row>
          {d.note ? <Row k="Note">{d.note}</Row> : null}
        </View>

        <View style={s.sign} wrap={false}>
          <View>
            <Text style={s.line}>Thank you for your payment.</Text>
            <Text style={{ marginTop: 6, fontSize: 9, color: "#666666" }}>Received by {d.receivedBy}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.line}>{d.company}</Text>
            <Text style={{ marginTop: 26 }}>Authorised Signatory</Text>
          </View>
        </View>
        <FooterBand lines={d.footerLines} />
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(d: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument d={d} />);
}
