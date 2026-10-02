import { cookies } from "next/headers";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { buildReport } from "@/server/reports";
import { reportFileName, reportPdf, reportXlsx } from "@/server/reports/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /api/export/<report>?format=pdf|xlsx&<the screen's filters> */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  try {
    const query = Object.fromEntries(url.searchParams);
    // The dashboard's section buttons are remembered in a cookie when they aren't in the address.
    query.show ??= (await cookies()).get("dash_sections")?.value ?? "";
    const report = await buildReport(user, (await params).report, query);
    const body = format === "xlsx" ? await reportXlsx(report) : await reportPdf(report);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFileName(report, format)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
