import { currentUser } from "@/server/session";
import { getLocations } from "@/server/locations";
import { assignees } from "@/server/queries";
import { buildLeadTemplate } from "@/server/lead-excel/template";
import { todayIST } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The lead upload template, generated fresh from the live lists on every download. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const [locations, people] = await Promise.all([getLocations(), assignees(user)]);
  const file = await buildLeadTemplate({ ...locations, assignees: people.map((p) => p.name) });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="wonder-learning-leads-template-${todayIST()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
