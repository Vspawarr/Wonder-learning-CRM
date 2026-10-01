import { PageHeader } from "@/components/ui";
import { getFeatures } from "@/server/features";
import { requireSettingsAdmin } from "@/server/session";
import { FeatureSwitches } from "./switches";

export const metadata = { title: "Features" };

export default async function FeaturesPage() {
  await requireSettingsAdmin();
  return (
    <>
      <PageHeader title="Features" sub="Switch optional features on or off for everyone. Switching one off only hides it; anything already entered is kept." />
      <FeatureSwitches features={await getFeatures()} />
    </>
  );
}
