// Delivery challan: what went out in one lot, for the school to sign and stamp on receipt.
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { FooterBand, Header } from "../quotation/pdf";

export type ChallanPdfData = {
  number: string;
  date: string;
  orderNumber: string;
  poNumber: string | null;
  schoolName: string;
  contactName: string;
  mobile: string;
  address: string | null;
  transporter: string | null;
  docketNo: string | null;
  vehicleNo: string | null;
  notes: string | null;
  items: { description: string; qty: number }[];
  footerLines: string[];
  company: string;
};

const FOOTER_H = (284 * 621) / 2471;
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10.5, color: "#222222", paddingBottom: FOOTER_H + 16 },
  bold: { fontFamily: "Helvetica-Bold" },
  line: { marginBottom: 4 },
  row: { flexDirection: "row", marginTop: 30, marginHorizontal: 54 },
  table: { marginTop: 22, marginHorizontal: 54 },
  tr: { flexDirection: "row", minHeight: 26, alignItems: "center", borderBottomWidth: 0.6, borderBottomColor: "#DDDDDD" },
  th: { backgroundColor: "#EFEFEF" },
  cNo: { width: 36, paddingLeft: 6 },
  cDesc: { flex: 1 },
  cQty: { width: 90, textAlign: "right", paddingRight: 6 },
  sign: { marginHorizontal: 54, marginTop: 40, flexDirection: "row", justifyContent: "space-between" },
  box: { width: 220, height: 80, borderWidth: 0.8, borderColor: "#999999", borderStyle: "dashed", padding: 6, justifyContent: "flex-end" },
});

export function ChallanDocument({ d }: { d: ChallanPdfData }) {
  const total = d.items.reduce((t, i) => t + i.qty, 0);
  return (
    <Document title={`Delivery challan ${d.number}`} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      <Page size="LETTER" style={s.page}>
        <Header title="DELIVERY CHALLAN" align="right" />
        <View style={s.row}>
          <View style={{ width: 290, paddingRight: 12 }}>
            <Text style={[s.bold, s.line]}>Deliver to,</Text>
            <Text style={[s.bold, s.line]}>{d.schoolName}</Text>
            <Text style={s.line}>
              {d.contactName} · {d.mobile}
            </Text>
            {d.address ? <Text>{d.address}</Text> : null}
          </View>
          <View style={{ flexGrow: 1 }}>
            <Text style={s.line}>
              <Text style={s.bold}>Challan No.: </Text>
              {d.number}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Date: </Text>
              {d.date}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Order No.: </Text>
              {d.orderNumber}
            </Text>
            {d.poNumber ? (
              <Text style={s.line}>
                <Text style={s.bold}>PO No.: </Text>
                {d.poNumber}
              </Text>
            ) : null}
            {d.transporter || d.docketNo ? (
              <Text style={s.line}>
                <Text style={s.bold}>Transport: </Text>
                {[d.transporter, d.docketNo && `Docket ${d.docketNo}`].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            {d.vehicleNo ? (
              <Text>
                <Text style={s.bold}>Vehicle: </Text>
                {d.vehicleNo}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={s.table}>
          <View style={[s.tr, s.th]}>
            <Text style={[s.cNo, s.bold]}>No.</Text>
            <Text style={[s.cDesc, s.bold]}>Description</Text>
            <Text style={[s.cQty, s.bold]}>No. of kits</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cNo}>{i + 1}</Text>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cQty}>{it.qty}</Text>
            </View>
          ))}
          <View style={[s.tr, { borderBottomWidth: 0 }]}>
            <Text style={s.cNo} />
            <Text style={[s.cDesc, s.bold, { textAlign: "right", paddingRight: 8 }]}>Total kits</Text>
            <Text style={[s.cQty, s.bold]}>{total}</Text>
          </View>
        </View>
        {d.notes ? <Text style={{ marginHorizontal: 54, marginTop: 12 }}>Note: {d.notes}</Text> : null}
        <View style={s.sign} wrap={false}>
          <View style={s.box}>
            <Text>Received in good condition (name, signature, school stamp, date)</Text>
          </View>
          <View style={{ alignItems: "flex-end", justifyContent: "flex-end" }}>
            <Text style={s.line}>{d.company}</Text>
            <Text style={{ marginTop: 26 }}>Authorised Signatory</Text>
          </View>
        </View>
        <FooterBand lines={d.footerLines} />
      </Page>
    </Document>
  );
}

export async function renderChallanPdf(d: ChallanPdfData): Promise<Buffer> {
  return renderToBuffer(<ChallanDocument d={d} />);
}
