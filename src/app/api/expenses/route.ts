import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { createExpense } from "@/server/expenses";
import { PO_MAX_BYTES } from "@/server/finance/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add an expense with its bill photos / PDFs (multipart: the form fields plus "bill" files). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in." }, { status: 401 });
  try {
    const form = await req.formData();
    const files = form.getAll("bill").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.some((f) => f.size > PO_MAX_BYTES)) return Response.json({ ok: false, error: "A bill is larger than 4 MB. Please take a smaller photo." });
    const fields = Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "bill" && typeof v === "string"));
    const r = await createExpense(
      user,
      fields,
      await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }))),
    );
    revalidatePath("/", "layout");
    return Response.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ ok: false, error: e.message });
    console.error(e);
    return Response.json({ ok: false, error: "Saving failed. Please try again." }, { status: 500 });
  }
}
