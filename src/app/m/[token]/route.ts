import { marketingHeaders, sharedMarketingFile } from "@/server/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R53: private link to a marketing file, sent to a school (opens without signing in). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const f = await sharedMarketingFile((await params).token);
  if (!f) return new Response("This link is not valid.", { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: marketingHeaders(f, new URL(req.url).searchParams.has("download")) });
}
