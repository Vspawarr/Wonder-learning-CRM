// The payment receipt in the client's own format (their receipt 117/26-27): a small
// landscape slip with the logo and office address, Received From, the amount in words,
// "on account of", how it was paid, and a Total PO Value / Received / Balance box.
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { LOGO_JPG, LOGO_RATIO } from "./logo-image";
import "../quotation/pdf"; // registers the Rupee font

export type ReceiptPdfData = {
  number: string;
  date: string; // DD/MM/YYYY
  schoolName: string;
  amount: number;
  /** "Two Lakh Fifty Six Thousand One Hundred Only" (without "Rupees"). */
  amountWords: string;
  onAccountOf: string;
  /** "Cheque # 636670", "Vidarbha Konkan Gramin Bank,", "dtd. 29/05/2026". */
  paidBy: string[];
  /** e.g. "Subject to realisation of the cheque." */
  statusNote: string | null;
  poValue: number;
  receivedToDate: number;
  balance: number;
  signatory: string;
  /** Office address under the company name. */
  addressLines: string[];
};

const BLUE = "#1F4FA0";
const W = 468;
const H = 309.6;

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#111111", width: W, height: H },
  frame: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderWidth: 0.8, borderColor: "#333333" },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingTop: 8, height: 62 },
  company: { flexGrow: 1, alignItems: "center", paddingLeft: 8 },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 14.5, color: BLUE, marginBottom: 3 },
  address: { fontSize: 8.6, textAlign: "center", lineHeight: 1.35 },
  bar: { flexDirection: "row", alignItems: "center", borderTopWidth: 0.8, borderBottomWidth: 0.8, borderColor: "#333333", paddingHorizontal: 10, paddingVertical: 4 },
  title: { flexGrow: 1, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 13, color: BLUE, textDecoration: "underline" },
  body: { paddingHorizontal: 10, paddingTop: 8 },
  line: { flexDirection: "row", alignItems: "flex-end", marginBottom: 9 },
  label: { fontFamily: "Helvetica-Bold", marginRight: 6 },
  fill: { borderBottomWidth: 0.6, borderColor: "#333333", paddingHorizontal: 4, paddingBottom: 1 },
  amountBox: { borderWidth: 0.8, borderColor: "#333333", paddingVertical: 3, paddingHorizontal: 8, width: 118, textAlign: "right" },
  lower: { flexDirection: "row", paddingHorizontal: 10, marginTop: 2 },
  table: { borderWidth: 0.8, borderColor: "#333333", width: 168 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderColor: "#333333" },
  tk: { width: 88, paddingHorizontal: 4, paddingVertical: 2.5, borderRightWidth: 0.6, borderColor: "#333333" },
  tv: { flexGrow: 1, paddingHorizontal: 4, paddingVertical: 2.5, textAlign: "right" },
});

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹ in the Rupee font (registered by the quotation PDF module), digits in Helvetica. */
const R = ({ n }: { n: number }) => (
  <>
    <Text style={{ fontFamily: "Rupee" }}>₹</Text> {fmt(n)}
  </>
);

export function ReceiptDocument({ d }: { d: ReceiptPdfData }) {
  const logoW = 116;
  return (
    <Document title={`Receipt ${d.number}`} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      <Page size={[W, H]} style={s.page}>
        <View style={s.frame}>
          <View style={s.head}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={LOGO_JPG} style={{ width: logoW, height: logoW * LOGO_RATIO }} />
            <View style={s.company}>
              <Text style={s.companyName}>Wonder Learning India Pvt Ltd</Text>
              <Text style={s.address}>{d.addressLines.join("\n")}</Text>
            </View>
          </View>
          <View style={s.bar}>
            <Text style={{ width: 130 }}>Date:  {d.date}</Text>
            <Text style={s.title}>Receipt</Text>
            <Text style={{ width: 130, textAlign: "right" }}>Receipt No. {d.number}</Text>
          </View>
          <View style={s.body}>
            <View style={s.line}>
              <Text style={s.label}>Received From</Text>
              <Text style={[s.fill, { flexGrow: 1, fontFamily: "Helvetica-Bold", fontSize: 10.5 }]}>{d.schoolName}</Text>
            </View>
            <View style={[s.line, { paddingLeft: 30 }]}>
              <Text style={s.label}>Amount :</Text>
              <Text style={{ marginRight: 6 }}>Rupees</Text>
              <Text style={[s.fill, { flexGrow: 1 }]}>{d.amountWords}</Text>
            </View>
            <View style={[s.line, { alignItems: "center" }]}>
              <Text style={s.label}>on account of</Text>
              <Text style={[s.fill, { width: 170 }]}>{d.onAccountOf}</Text>
              <View style={{ flexGrow: 1 }} />
              <Text style={[s.label, { fontSize: 10 }]}>Amount</Text>
              <Text style={s.amountBox}>
                <R n={d.amount} />
              </Text>
            </View>
          </View>
          <View style={s.lower}>
            <View style={{ flexGrow: 1, paddingTop: 2 }}>
              <Text style={[s.label, { marginBottom: 4 }]}>Payment Paid by</Text>
              {d.paidBy.map((l, i) => (
                <Text key={i} style={{ marginBottom: 2 }}>
                  {l}
                </Text>
              ))}
              {d.statusNote ? <Text style={{ marginTop: 3, color: "#B42318", fontFamily: "Helvetica-Bold", fontSize: 8 }}>{d.statusNote}</Text> : null}
            </View>
            <View>
              <View style={s.table}>
                <View style={s.tr}>
                  <Text style={s.tk}>Total PO Value</Text>
                  <Text style={s.tv}>
                    <R n={d.poValue} />
                  </Text>
                </View>
                <View style={s.tr}>
                  <Text style={s.tk}>Payment Received</Text>
                  <Text style={s.tv}>
                    <R n={d.receivedToDate} />
                  </Text>
                </View>
                <View style={[s.tr, { borderBottomWidth: 0 }]}>
                  <Text style={s.tk}>Balance Due</Text>
                  <Text style={s.tv}>
                    <R n={d.balance} />
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: "center", marginTop: 26 }}>
                <Text style={{ fontFamily: "Helvetica-Oblique", fontSize: 9.5, marginBottom: 2 }}>{d.signatory}</Text>
                <View style={{ borderTopWidth: 0.6, borderColor: "#333333", width: 120, paddingTop: 2, alignItems: "center" }}>
                  <Text>Authorized By</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(d: ReceiptPdfData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument d={d} />);
}
