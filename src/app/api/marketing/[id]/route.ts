import { currentUser } from "@/server/session";
import { DomainError } from "@/server/errors";
import { marketingFile, marketingHeaders } from "@/server/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R53: a marketing file for the signed-in team (?download=1 to save). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Please sign in.", { status: 401 });
  try {
    const f = await marketingFile((await params).id);
    return new Response(new Uint8Array(f.data), { headers: marketingHeaders(f, new URL(req.url).searchParams.has("download")) });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
