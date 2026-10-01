import { db } from "@/lib/db";
import { Card, PageHeader, Pill } from "@/components/ui";
import { requireSettingsAdmin } from "@/server/session";
import { AddCity, AddState, CityChip, StateToggle } from "./cities-client";

export const metadata = { title: "Locations" };

export default async function LocationsPage() {
  await requireSettingsAdmin();
  const states = await db.state.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { cities: { orderBy: { name: "asc" } } },
  });
  return (
    <>
      <PageHeader
        title="Locations"
        sub="States and cities offered in the lead form, the Excel template and the upload check. Changes apply everywhere at once."
      />
      <Card className="mb-4">
        <AddState />
      </Card>
      <div className="grid grid-cols-1 gap-4 min-[901px]:grid-cols-2 min-[1101px]:grid-cols-3">
        {states.map((s) => (
          <Card
            key={s.id}
            className={s.active ? "" : "opacity-70"}
            title={
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {s.name} <span className="small muted">{s.cities.filter((c) => c.active).length} cities</span>
                </span>
                <span className="flex items-center gap-2">
                  {s.active ? null : <Pill tone="mute">Hidden</Pill>}
                  <StateToggle id={s.id} name={s.name} active={s.active} />
                </span>
              </span>
            }
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {s.cities.map((c) => (
                <CityChip key={c.id} id={c.id} name={c.name} active={c.active} />
              ))}
              {!s.cities.length ? <span className="small text-coral">No cities yet. Leads can&apos;t use this state until you add one.</span> : null}
            </div>
            {s.active ? <AddCity stateName={s.name} /> : null}
          </Card>
        ))}
      </div>
      <p className="small muted mt-4">Click a city to hide it (or show it again). Hidden states and cities stay on existing leads but can&apos;t be chosen for new ones.</p>
    </>
  );
}
