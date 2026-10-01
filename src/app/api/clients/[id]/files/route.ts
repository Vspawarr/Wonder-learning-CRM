import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { saveClientFile } from "@/server/files";
import { PO_MAX_BYTES } from "@/server/finance/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload a client document or proof of delivery: multipart "file", "category", "title", optional "dispatchId". */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ ok: false, error: "Choose the file to upload." });
    if (file.size > PO_MAX_BYTES) return Response.json({ ok: false, error: "The file is larger than 4 MB. Please upload a smaller PDF or photo." });
    await saveClientFile(user, (await params).id, {
      category: String(form.get("category") ?? ""),
      title: String(form.get("title") ?? ""),
      dispatchId: (form.get("dispatchId") as string) || null,
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath("/", "layout");
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ ok: false, error: e.message });
    console.error(e);
    return Response.json({ ok: false, error: "The upload failed. Please try again." }, { status: 500 });
  }
}
