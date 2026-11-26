// R61: Settings → Backup → Download full backup (Admin / Director). Everything in the database, files included.
import { Readable } from "stream";
import { db } from "@/lib/db";
import { DomainError } from "@/server/errors";
import { backupForAdmin } from "@/server/backup";
import { currentUser } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const { stream, head } = await backupForAdmin(db, user);
    const stamp = head.createdAt.slice(0, 16).replace(/[:T]/g, "-");
    // Streamed as it is made: no size limit, little memory.
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="wonder-crm-backup-${stamp}.json.gz"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 403 });
    console.error(e);
    return Response.json({ error: "The backup couldn't be made. Please try again." }, { status: 500 });
  }
}
