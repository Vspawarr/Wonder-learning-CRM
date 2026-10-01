import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { PO_MAX_BYTES, poFile, savePoFile } from "@/server/finance/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed PO file for an order (inline; ?download=1 to save). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  try {
    const f = await poFile(user, (await params).id);
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

/** Upload (or replace) the signed PO: multipart form with a "file" field. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ ok: false, error: "Choose the PO file to upload." });
    if (file.size > PO_MAX_BYTES) return Response.json({ ok: false, error: "The file is larger than 4 MB. Please upload a smaller PDF or photo." });
    await savePoFile(user, (await params).id, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath("/", "layout");
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ ok: false, error: e.message });
    console.error(e);
    return Response.json({ ok: false, error: "The upload failed. Please try again." }, { status: 500 });
  }
}
