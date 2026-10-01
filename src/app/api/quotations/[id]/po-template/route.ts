import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { parseKits, poTemplateFileName, poTemplatePdf } from "@/server/finance/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PO template made from a sent quotation (?kits=40,25 pre-fills kits; ?download=1 to save). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const url = new URL(req.url);
  try {
    const { schoolName, pdf } = await poTemplatePdf(user, (await params).id, parseKits(url.searchParams.get("kits")));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="${poTemplateFileName(schoolName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
