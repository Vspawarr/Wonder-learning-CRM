import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { companyFile } from "@/server/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The photo / PDF attached to a bill or a money entry. */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const { kind, id } = await params;
  if (kind !== "bill" && kind !== "entry") return new Response("Not found", { status: 404 });
  try {
    const f = await companyFile(user, kind, id);
    return new Response(new Uint8Array(f.data), {
      headers: { "Content-Type": f.type, "Content-Disposition": `inline; filename="${f.name.replace(/"/g, "")}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
