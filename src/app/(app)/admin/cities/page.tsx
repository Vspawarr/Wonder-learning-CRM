import { db } from "@/lib/db";
import { STATES } from "@/lib/constants";
import { Card, PageHeader } from "@/components/ui";
import { requireSettingsAdmin } from "@/server/session";
import { AddCity, CityChip } from "./cities-client";

export const metadata = { title: "Cities" };

export default async function CitiesPage() {
  await requireSettingsAdmin();
  const cities = await db.city.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader
        title="Cities"
        sub="The City dropdown on the lead form lists these for the chosen state. People can still type a city that isn't listed."
      />
      <Card className="mb-4">
        <AddCity />
      </Card>
      <div className="grid grid-cols-1 gap-4 min-[901px]:grid-cols-2 min-[1101px]:grid-cols-3">
        {STATES.map((s) => {
          const cs = cities.filter((c) => c.stateName === s);
          return (
            <Card key={s} title={<>{s} <span className="small muted">{cs.filter((c) => c.active).length}</span></>}>
              <div className="flex flex-wrap gap-1.5">
                {cs.map((c) => (
                  <CityChip key={c.id} id={c.id} name={c.name} active={c.active} />
                ))}
                {!cs.length ? <span className="small faint">No cities yet.</span> : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
