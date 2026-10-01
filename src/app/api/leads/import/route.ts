import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { importLeads } from "@/server/lead-excel/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose the filled-in template to upload." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name))
    return Response.json({ error: "Upload the .xlsx template from the Leads screen (other file types aren't accepted)." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "The file is larger than 5 MB." }, { status: 400 });
  try {
    const result = await importLeads(user, await file.arrayBuffer());
    if (result.created.length) revalidatePath("/", "layout");
    return Response.json(result);
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Something went wrong while reading the file. Please try again." }, { status: 500 });
  }
}
