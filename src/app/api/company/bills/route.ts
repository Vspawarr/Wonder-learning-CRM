import { createBill } from "@/server/company";
import { handleUpload } from "../upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Add a supplier bill (with its photo / PDF). */
export async function POST(req: Request) {
  return handleUpload(req, (u, fields, file) => createBill(u, fields, file));
}
