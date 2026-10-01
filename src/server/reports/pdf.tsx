// Report tables as PDF: title, filters line, then each section's table with totals.
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { RUPEE_FONT } from "../quotation/rupee-font";
import type { Style } from "@react-pdf/types";
import type { Cell, Report, ReportColumn } from "./types";

Font.register({ family: "Rupee", src: RUPEE_FONT });

const BRAND = "#3D3BA8";
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8.5, color: "#222222", paddingTop: 28, paddingHorizontal: 28, paddingBottom: 36 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.5, borderBottomColor: BRAND, paddingBottom: 6 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 15, color: BRAND },
  company: { fontSize: 8, color: "#666666" },
  sub: { marginTop: 5, color: "#555555" },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 14, marginBottom: 4 },
  table: { marginTop: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DDDDDD", paddingVertical: 4 },
  th: { backgroundColor: BRAND, color: "#FFFFFF", fontFamily: "Helvetica-Bold", borderBottomWidth: 0 },
  alt: { backgroundColor: "#F4F4FA" },
  total: { fontFamily: "Helvetica-Bold", borderTopWidth: 1, borderTopColor: "#222222", borderBottomWidth: 0 },
  cell: { paddingHorizontal: 4 },
  empty: { marginTop: 6, color: "#888888", fontStyle: "italic" },
  foot: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#888888" },
});

const fmt = (c: ReportColumn, v: Cell) => {
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "money" && typeof v === "number")
    return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (c.kind === "number" && typeof v === "number") return v.toLocaleString("en-IN");
  return String(v);
};

function Row({ columns, values, style }: { columns: ReportColumn[]; values: Record<string, Cell>; style?: Style[] }) {
  return (
    <View style={[s.tr, ...(style ?? [])]} wrap={false}>
      {columns.map((c) => (
        <Text key={c.key} style={[s.cell, { flex: c.width ?? (c.kind === "money" ? 1.1 : 1.4), textAlign: c.kind === "money" || c.kind === "number" ? "right" : "left" }]}>
          {c.kind === "money" && typeof values[c.key] === "number" ? <Text style={{ fontFamily: "Rupee" }}>₹</Text> : null}
          {fmt(c, values[c.key])}
        </Text>
      ))}
    </View>
  );
}

export function ReportDocument({ r, exportedAt }: { r: Report; exportedAt: string }) {
  return (
    <Document title={r.title} author="Wonder Learning India Pvt. Ltd." creator="Wonder Learning CRM">
      <Page size="A4" orientation={r.landscape === false ? "portrait" : "landscape"} style={s.page}>
        <View style={s.top} fixed>
          <Text style={s.title}>{r.title}</Text>
          <Text style={s.company}>Wonder Learning India Pvt. Ltd.</Text>
        </View>
        {r.subtitle ? <Text style={s.sub}>{r.subtitle}</Text> : null}
        {r.sections.map((sec, i) => (
          <View key={i}>
            {sec.heading ? <Text style={s.heading}>{sec.heading}</Text> : null}
            <View style={s.table}>
              <View fixed>
                <View style={[s.tr, s.th]}>
                  {sec.columns.map((c) => (
                    <Text
                      key={c.key}
                      style={[s.cell, { flex: c.width ?? (c.kind === "money" ? 1.1 : 1.4), textAlign: c.kind === "money" || c.kind === "number" ? "right" : "left" }]}
                    >
                      {c.header}
                    </Text>
                  ))}
                </View>
              </View>
              {sec.rows.length ? (
                sec.rows.map((row, j) => <Row key={j} columns={sec.columns} values={row} style={j % 2 ? [s.alt] : []} />)
              ) : (
                <Text style={s.empty}>{sec.empty ?? "Nothing to show."}</Text>
              )}
              {sec.totals ? <Row columns={sec.columns} values={sec.totals} style={[s.total]} /> : null}
            </View>
          </View>
        ))}
        <View style={s.foot} fixed>
          <Text>Exported {exportedAt} · Wonder Learning CRM</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(r: Report, exportedAt: string): Promise<Buffer> {
  return renderToBuffer(<ReportDocument r={r} exportedAt={exportedAt} />);
}
