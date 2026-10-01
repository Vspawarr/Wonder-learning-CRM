// The quotation PDF, laid out to match Wonder Learning's quotation format
// (US Letter; positions measured from the original). Page 1: quotation;
// page 2: kit components & services; page 3: terms & payment schedule.
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { FOOTER_JPG, HEADER_JPG } from "./brand-images";
import { RUPEE_FONT } from "./rupee-font";

Font.register({ family: "Rupee", src: RUPEE_FONT });
import type { KitSection, QuotationContent } from "./content";

export type QuotationPdfData = {
  number: string;
  date: string; // DD-MM-YYYY
  validityDays: number;
  toLine: string;
  schoolName: string;
  address: string | null;
  preparedBy: string;
  preparedByMobile: string | null;
  items: { description: string; mrp: number; price: number }[];
  content: QuotationContent;
};

const PURPLE = "#6C2D91";
const HEADER_H = (612 * 512) / 2550; // header artwork keeps its aspect ratio across the page width
const FOOTER_W = 284;
const FOOTER_H = (FOOTER_W * 621) / 2471;
const TOP_BAND_W = 298;
const TOP_BAND_H = (TOP_BAND_W * 621) / 2471;

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10.5, color: "#222222", paddingBottom: FOOTER_H + 16 },
  pagePlain: { fontFamily: "Helvetica", fontSize: 10.5, color: "#222222", paddingBottom: 36 },
  header: { position: "relative", width: 612, height: HEADER_H },
  headerImg: { position: "absolute", top: 0, left: 0, width: 612, height: HEADER_H },
  titleBox: { position: "absolute", top: 0, height: 107, justifyContent: "center" },
  title: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 18, letterSpacing: 0.4, lineHeight: 1.3 },
  footer: { position: "absolute", left: 275, bottom: 0, width: FOOTER_W, height: FOOTER_H },
  footerTop: { position: "relative", marginLeft: 262, width: TOP_BAND_W, height: TOP_BAND_H },
  footerText: { position: "absolute", right: 6, bottom: 7, color: "#FFFFFF", fontSize: 8.2, textAlign: "right", lineHeight: 1.25 },
  bold: { fontFamily: "Helvetica-Bold" },
  // page 1
  addressRow: { flexDirection: "row", marginTop: 34, marginHorizontal: 69 },
  toCol: { width: 288 },
  line: { marginBottom: 4 },
  metaCol: { flexGrow: 1 },
  table: { marginTop: 26, marginHorizontal: 69 },
  tr: { flexDirection: "row", minHeight: 27.5, alignItems: "center", borderBottomWidth: 0.6, borderBottomColor: "#DDDDDD" },
  trHead: { backgroundColor: "#EFEFEF" },
  trAlt: { backgroundColor: "#EBEBEB" },
  cNo: { width: 59, paddingLeft: 6 },
  cDesc: { width: 207, paddingRight: 8 },
  cMrp: { width: 105 },
  cPrice: { width: 105 },
  termsBox: { flexDirection: "row", marginTop: 28, marginHorizontal: 61, borderWidth: 0.8, borderColor: "#000000", minHeight: 104 },
  termsLeft: { width: 328, borderRightWidth: 0.8, borderRightColor: "#000000", padding: 10 },
  termsRight: { flexGrow: 1, padding: 10, alignItems: "center" },
  boxTitle: { fontFamily: "Helvetica-Bold", fontSize: 12, textDecoration: "underline", textAlign: "center", marginBottom: 6 },
  numbered: { flexDirection: "row", marginBottom: 5 },
  // page 2
  kitCols: { flexDirection: "row", marginTop: 26, marginHorizontal: 69 },
  kitCol: { width: 237 },
  kitColRight: { width: 237, marginLeft: 2, alignItems: "flex-end" },
  pillL: { backgroundColor: PURPLE, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 10, paddingVertical: 5, paddingLeft: 10, paddingRight: 14, borderTopRightRadius: 12, borderBottomRightRadius: 12, marginTop: 10, marginBottom: 8 },
  pillR: { backgroundColor: PURPLE, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 10, paddingVertical: 5, paddingLeft: 14, paddingRight: 10, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, marginTop: 10, marginBottom: 8 },
  bullet: { flexDirection: "row", marginBottom: 5.5 },
  bulletDot: { width: 12, paddingLeft: 3 },
  // page 3
  p3Body: { marginHorizontal: 54 },
  pillWide: { alignSelf: "flex-start", backgroundColor: PURPLE, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 12, paddingVertical: 6, paddingLeft: 14, paddingRight: 40, borderTopRightRadius: 16, borderBottomRightRadius: 16, marginTop: 14, marginBottom: 8 },
  red: { color: "#E0141E" },
  noteTitle: { fontSize: 8, textDecoration: "underline", marginTop: 6, marginLeft: -17 },
  note: { fontSize: 8, flexDirection: "row", marginBottom: 1.5, marginLeft: -12 },
});

/** "**bold**" segments inside a line. */
function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((p, i) => (
        <Text key={i} style={i % 2 ? s.bold : undefined}>
          {p}
        </Text>
      ))}
    </>
  );
}

// The original right-aligns single-line titles to x≈561pt and centres the
// three-line page 2 title on x≈442pt.
export function Header({ title, align }: { title: string; align: "right" | "center" }) {
  const box = align === "right" ? { left: 300, width: 261, alignItems: "flex-end" as const } : { left: 319, width: 246, alignItems: "center" as const };
  return (
    <View style={s.header}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
      <Image src={HEADER_JPG} style={s.headerImg} />
      <View style={[s.titleBox, box]}>
        <Text style={[s.title, { textAlign: align }]}>{title}</Text>
      </View>
    </View>
  );
}

export function FooterBand({ lines }: { lines: string[] }) {
  return (
    <View style={s.footer} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={FOOTER_JPG} style={{ width: FOOTER_W, height: FOOTER_H }} />
      <Text style={s.footerText}>{lines.join("\n")}</Text>
    </View>
  );
}

/** ₹ in the rupee font, digits in Helvetica, e.g. ₹3700.00 (same digits as the original format). */
export function Money({ n }: { n: number }) {
  return (
    <>
      <Text style={{ fontFamily: "Rupee" }}>₹</Text>
      {n.toFixed(2)}
    </>
  );
}

function Bullets({ items, style }: { items: string[]; style?: Style }) {
  return (
    <View style={style}>
      {items.map((t, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function KitColumn({ sections, right }: { sections: KitSection[]; right?: boolean }) {
  return (
    <View style={right ? s.kitColRight : s.kitCol}>
      {sections.map((sec, i) => (
        <View key={i} style={{ width: "100%", alignItems: right ? "flex-end" : "flex-start" }} wrap={false}>
          <Text style={right ? s.pillR : s.pillL}>{sec.title}</Text>
          <Bullets items={sec.items} style={{ width: right ? 205 : "100%", alignSelf: right ? "flex-end" : "flex-start" }} />
        </View>
      ))}
    </View>
  );
}

export function QuotationDocument({ d }: { d: QuotationPdfData }) {
  const c = d.content;
  return (
    <Document title={`Quotation ${d.number}`} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      {/* Page 1 — quotation */}
      <Page size="LETTER" style={s.page}>
        <Header title="QUOTATION" align="right" />
        <View style={s.addressRow}>
          <View style={s.toCol}>
            <Text style={[s.bold, s.line]}>To,</Text>
            <Text style={s.line}>{d.toLine},</Text>
            <Text style={s.line}> </Text>
            <Text style={[s.bold, s.line]}>{d.schoolName}</Text>
            {d.address ? <Text>{d.address}</Text> : null}
          </View>
          <View style={s.metaCol}>
            <Text style={s.line}>
              <Text style={s.bold}>Date: </Text>
              {d.date}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Quotation No.: </Text>
              {d.number}
            </Text>
            <Text style={s.line}>
              <Text style={s.bold}>Prepared By: </Text>
              {d.preparedBy}
            </Text>
            <Text>
              <Text style={s.bold}>Validity: </Text>
              {d.validityDays} {d.validityDays === 1 ? "Day" : "Days"}
            </Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={[s.tr, s.trHead]} fixed>
            <Text style={[s.cNo, s.bold]}>No.</Text>
            <Text style={[s.cDesc, s.bold]}>Description</Text>
            <Text style={[s.cMrp, s.bold]}>MRP</Text>
            <Text style={[s.cPrice, s.bold]}>Price</Text>
          </View>
          {d.items.map((it, i) => (
            <View key={i} style={i % 2 ? [s.tr, s.trAlt] : s.tr} wrap={false}>
              <Text style={s.cNo}>{i + 1}</Text>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cMrp}>
                <Money n={it.mrp} />
              </Text>
              <Text style={s.cPrice}>
                <Money n={it.price} />
              </Text>
            </View>
          ))}
        </View>

        <View style={s.termsBox} wrap={false}>
          <View style={s.termsLeft}>
            <Text style={s.boxTitle}>Terms and Conditions</Text>
            {c.quoteTerms.map((t, i) => (
              <View key={i} style={s.numbered}>
                <Text style={{ width: 13 }}>{i + 1}.</Text>
                <Text style={{ flex: 1 }}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={s.termsRight}>
            <Text style={s.boxTitle}>Signature</Text>
          </View>
        </View>
        <FooterBand lines={c.footerLines} />
      </Page>

      {/* Page 2 — kit components & services */}
      <Page size="LETTER" style={s.pagePlain}>
        <Header title={"KIT COMPONENTS\n&\nSERVICES"} align="center" />
        <View style={s.kitCols}>
          <KitColumn sections={c.kitLeft} />
          <KitColumn sections={c.kitRight} right />
        </View>
      </Page>

      {/* Page 3 — terms & payment schedule */}
      <Page size="LETTER" style={s.page}>
        <View style={s.footerTop}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={FOOTER_JPG} style={{ width: TOP_BAND_W, height: TOP_BAND_H }} />
          <Text style={s.footerText}>{c.footerLines.join("\n")}</Text>
        </View>
        <Header title="TERMS & CONDITIONS" align="right" />
        <View style={s.p3Body}>
          <Text style={s.pillWide}>Terms &amp; Conditions</Text>
          {c.terms.map((t, i) => {
            const red = t.startsWith("!");
            return (
              <View key={i} style={[s.bullet, { marginLeft: 18 }]} wrap={false}>
                <Text style={[s.bulletDot, red ? s.red : {}]}>•</Text>
                <Text style={[{ flex: 1 }, red ? s.red : {}]}>
                  <Rich text={red ? t.slice(1).trim() : t} />
                </Text>
              </View>
            );
          })}

          <Text style={s.pillWide}>Payment Schedules</Text>
          {c.payment.map((t, i) => (
            <View key={i} style={[s.numbered, s.bold, { marginLeft: 18 }]} wrap={false}>
              <Text style={{ width: 14 }}>{i + 1}.</Text>
              <Text style={{ flex: 1 }}>{t}</Text>
            </View>
          ))}

          {c.notes.length ? (
            <View wrap={false}>
              <Text style={s.noteTitle}>Note</Text>
              {c.notes.map((t, i) => (
                <View key={i} style={s.note}>
                  <Text style={{ width: 10, paddingLeft: 2 }}>•</Text>
                  <Text style={{ flex: 1 }}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 14 }} wrap={false}>
            {c.closing.map((t, i) => (
              <Text key={i} style={s.line}>
                {t}
              </Text>
            ))}
            <Text style={{ marginTop: 10 }}>Yours truly,</Text>
            <Text style={[s.line, { marginTop: 10 }]}>{c.company}</Text>
            <Text style={s.line}>{d.preparedBy}</Text>
            {d.preparedByMobile ? <Text>{d.preparedByMobile}</Text> : null}
          </View>
        </View>
        <FooterBand lines={c.footerLines} />
      </Page>
    </Document>
  );
}

export async function renderQuotationPdf(d: QuotationPdfData): Promise<Buffer> {
  return renderToBuffer(<QuotationDocument d={d} />);
}
