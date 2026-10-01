import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { clientFile } from "@/server/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A client document or proof of delivery (inline; ?download=1 to save). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  try {
    const f = await clientFile(user, (await params).id);
    const download = new URL(req.url).searchParams.has("download");
    return new Response(new Uint8Array(f.data), {
      headers: {
        "Content-Type": f.contentType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${f.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
