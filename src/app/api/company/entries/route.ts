import { createEntry } from "@/server/company";
import { handleUpload } from "../upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add other money in / out (with an optional voucher photo / PDF). */
export async function POST(req: Request) {
  return handleUpload(req, (u, fields, file) => createEntry(u, fields, file));
}
