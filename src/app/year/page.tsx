import { BrandLogo } from "@/components/icons";
import { chooseYear } from "@/app/actions";
import { fyRange } from "@/lib/fy";
import { requireUser } from "@/server/session";
import { selectedYear, yearOptions } from "@/server/year";

export const metadata = { title: "Choose financial year" };

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const span = (start: number) => {
  const { from, to } = fyRange(start);
  const f = (d: string) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
  return `${f(from)} – ${f(to)}`;
};

/** Shown after login (and from the year button in the top bar): pick the financial year to work in. */
export default async function YearPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser();
  const [{ next }, years, chosen] = await Promise.all([searchParams, yearOptions(), selectedYear()]);
  const first = user.name.split(" ")[0];
  return (
    <main className="min-h-full bg-bg px-4 pt-[calc(28px+env(safe-area-inset-top,0px))] pb-10">
      <div className="mx-auto mt-[5vh] max-w-[460px]">
        <div className="flex flex-col items-center text-center">
          <BrandLogo width={220} priority />
          <h1 className="mt-3">Hello, {first}</h1>
          <p className="muted mt-1">Choose the financial year (April – March) to work in.</p>
        </div>
        <form action={chooseYear} className="card mt-6 flex flex-col gap-2">
          <input type="hidden" name="next" value={next ?? ""} />
          {years.map((y) => (
            <button
              key={y.start}
              name="year"
              value={String(y.start)}
              className={`yearbtn ${chosen === y.start ? "on" : ""}`}
              aria-current={chosen === y.start ? "true" : undefined}
            >
              <span className="text-[20px] font-bold">{y.label}</span>
              <span className="small muted">
                {span(y.start)}
                {y.current ? " · current year" : ""}
              </span>
            </button>
          ))}
          <button name="year" value="all" className={`yearbtn ${chosen === null ? "on" : ""}`} aria-current={chosen === null ? "true" : undefined}>
            <span className="text-[18px] font-bold">All years</span>
            <span className="small muted">Everything since the start</span>
          </button>
        </form>
        <p className="small muted mt-4 text-center">
          Lists, the dashboard and downloads follow the year you choose. Every school&apos;s own page always shows its full history, and you can
          change the year any time from the top bar.
        </p>
      </div>
    </main>
  );
}
