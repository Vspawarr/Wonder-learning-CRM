// Credit note PDF, in the same branded style as invoices and receipts.
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { FooterBand, Header, Money } from "../quotation/pdf";

export type CreditNotePdfData = {
  number: string;
  date: string;
  schoolName: string;
  contactName: string;
  address: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  amountWords: string;
  reason: string;
  footerLines: string[];
  company: string;
};

const FOOTER_H = (284 * 621) / 2471;
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10.5, color: "#222222", paddingBottom: FOOTER_H + 16 },
  bold: { fontFamily: "Helvetica-Bold" },
  line: { marginBottom: 4 },
  row: { flexDirection: "row", marginTop: 30, marginHorizontal: 54 },
  box: { marginHorizontal: 54, marginTop: 24, borderWidth: 0.8, borderColor: "#6C2D91", borderRadius: 6, padding: 14 },
  label: { fontSize: 9.5, color: "#6C2D91", fontFamily: "Helvetica-Bold", marginBottom: 4 },
  amount: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  section: { marginHorizontal: 54, marginTop: 20 },
});

export function CreditNoteDocument({ d }: { d: CreditNotePdfData }) {
  return (
    <Document title={`Credit note ${d.number}`} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      <Page size="LETTER" style={s.page}>
        <Header title="CREDIT NOTE" align="right" />
        <View style={s.row}>
          <View style={{ width: 290, paddingRight: 12 }}>
            <Text style={[s.bold, s.line]}>To,</Text>
            <Text style={[s.bold, s.line]}>{d.schoolName}</Text>
            <Text style={s.line}>{d.contactName}</Text>
            {d.address ? <Text>{d.address}</Text> : null}
          </View>
          <View style={{ flexGrow: 1 }}>
            <Text style={s.line}>
              <Text style={s.bold}>Credit note No.: </Text>
              {d.number}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Date: </Text>
              {d.date}
            </Text>
            <Text>
              <Text style={s.bold}>Against invoice: </Text>
              {d.invoiceNumber} dated {d.invoiceDate}
            </Text>
          </View>
        </View>
        <View style={s.box} wrap={false}>
          <Text style={s.label}>AMOUNT CREDITED</Text>
          <Text style={s.amount}>
            <Money n={d.amount} />
          </Text>
          <Text style={{ marginTop: 6 }}>{d.amountWords}</Text>
        </View>
        <View style={s.section}>
          <Text style={[s.bold, s.line]}>Reason</Text>
          <Text>{d.reason}</Text>
          <Text style={{ marginTop: 14 }}>This amount has been reduced from the balance due on the invoice above.</Text>
        </View>
        <View style={[s.section, { marginTop: 30, alignItems: "flex-end" }]} wrap={false}>
          <Text style={s.line}>{d.company}</Text>
          <Text style={{ marginTop: 26 }}>Authorised Signatory</Text>
        </View>
        <FooterBand lines={d.footerLines} />
      </Page>
    </Document>
  );
}

export async function renderCreditNotePdf(d: CreditNotePdfData): Promise<Buffer> {
  return renderToBuffer(<CreditNoteDocument d={d} />);
}
