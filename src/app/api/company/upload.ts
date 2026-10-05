import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { PO_MAX_BYTES } from "@/server/finance/po";
import type { Attachment } from "@/server/company";
import type { SessionUser } from "@/lib/permissions";

/** Shared multipart handler: form fields plus an optional "file" (photo / PDF of the bill or voucher). */
export async function handleUpload(req: Request, save: (user: SessionUser, fields: Record<string, string>, file: Attachment | null) => Promise<unknown>) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });
  try {
    const form = await req.formData();
    const f = form.get("file");
    const file = f instanceof File && f.size > 0 ? f : null;
    if (file && file.size > PO_MAX_BYTES) return Response.json({ ok: false, error: "The file is larger than 4 MB." });
    const fields = Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string")) as Record<string, string>;
    const r = await save(user, fields, file ? { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } : null);
    revalidatePath("/", "layout");
    return Response.json({ ok: true, ...(r as object) });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ ok: false, error: e.message });
    console.error(e);
    return Response.json({ ok: false, error: "Saving failed. Please try again." }, { status: 500 });
  }
}
