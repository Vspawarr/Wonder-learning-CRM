import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { canManageMarketing } from "@/lib/permissions";
import { getFeatures } from "@/server/features";
import { Tabs } from "@/components/tabs";
import { MARKETING_ACCEPT, designSchools, listMarketing } from "@/server/marketing";
import { requireUser } from "@/server/session";
import { MarketingLibrary } from "./library";
import { MarketingTools } from "./tools";

export const metadata = { title: "Marketing material" };

// R53: presentations, videos, animations, HTML files and PDFs to show and send to schools.
export default async function MarketingPage() {
  const user = await requireUser();
  if (!(await getFeatures()).marketing) notFound();
  const [items, schools] = await Promise.all([listMarketing(), designSchools(user)]);
  const manage = canManageMarketing(user.role);
  return (
    <>
      <PageHeader
        title="Marketing material"
        sub={`Presentations, videos, animations and brochures to show a school or send them on WhatsApp.${manage ? " Small files (up to 4 MB) are uploaded here; big ones (videos) are added as a Google Drive link." : ""}`}
      />
      <Tabs
        tabs={[
          { id: "library", label: "Library", count: items.length, panel: <MarketingLibrary items={items} manage={manage} accept={MARKETING_ACCEPT} /> },
          // R57: design tools for showing a school its own branded material.
          { id: "tools", label: "Tools", panel: <MarketingTools schools={schools} /> },
        ]}
      />
    </>
  );
}
