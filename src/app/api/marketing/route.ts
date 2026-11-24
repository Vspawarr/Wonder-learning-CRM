import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { MARKETING_MAX_BYTES, addMarketingFile } from "@/server/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R53: add a marketing file: multipart form with title, category, description and "file". */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ ok: false, error: "Choose the file to upload." });
    if (file.size > MARKETING_MAX_BYTES) return Response.json({ ok: false, error: "The file is larger than 4 MB. Put it on Google Drive and add the link instead." });
    const text = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v : "";
    };
    await addMarketingFile(user, { title: text("title"), category: text("category"), description: text("description") }, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath("/marketing");
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ ok: false, error: e.message });
    console.error(e);
    return Response.json({ ok: false, error: "The upload failed. Please try again." }, { status: 500 });
  }
}
