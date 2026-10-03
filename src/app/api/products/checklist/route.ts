import { currentUser } from "@/server/session";
import { CHECKLIST_FILE, checklistPdf } from "@/server/products/checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kit checklist PDF: every active kit, or ?ids=a,b for chosen ones (?download=1 to save). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  const pdf = await checklistPdf(ids);
  if (!pdf) return new Response("No kit has its contents filled in yet (Settings → Products).", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="${CHECKLIST_FILE}"`,
      "Cache-Control": "no-store",
    },
  });
}
