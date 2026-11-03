import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { LOGO_MAX_BYTES, removeSchoolLogo, saveSchoolLogo, schoolLogo } from "@/server/school-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R51: the logo of the quotation's school (printed on its PO template). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  try {
    const l = await schoolLogo(user, (await params).id);
    return new Response(new Uint8Array(l.data), {
      headers: { "Content-Type": l.contentType, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}

/** Upload (or replace) the logo: multipart form with a "file" field. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ ok: false, error: "Choose the logo to upload." });
    if (file.size > LOGO_MAX_BYTES) return Response.json({ ok: false, error: "The logo is larger than 2 MB. Please upload a smaller picture." });
    await saveSchoolLogo(user, (await params).id, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath("/", "layout");
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ ok: false, error: e.message });
    console.error(e);
    return Response.json({ ok: false, error: "The upload failed. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });
  try {
    await removeSchoolLogo(user, (await params).id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ ok: false, error: e.message });
    throw e;
  }
}
