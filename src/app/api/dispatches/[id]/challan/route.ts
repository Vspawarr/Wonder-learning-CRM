import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { challanPdf } from "@/server/finance/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The delivery challan PDF for signed-in users (preview, or ?download=1 to save). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  try {
    const { number, pdf } = await challanPdf(user, (await params).id);
    const download = new URL(req.url).searchParams.has("download");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${`Challan-${number.replace(/\//g, "-")}.pdf`}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
