import { seesAllSales } from "@/lib/permissions";
import { inrS } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/session";
import { assignees, oppDetail, pipelineCards, productOptions } from "@/server/queries";
import { Board } from "./board";
import { OppDrawer } from "./opp-drawer";
import { OwnerFilter } from "./owner-filter";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ opp?: string; owner?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const all = seesAllSales(user.role);
  const [cards, team, detail, products] = await Promise.all([
    pipelineCards(user, sp.owner),
    assignees(user),
    sp.opp ? oppDetail(user, sp.opp) : null,
    sp.opp ? productOptions() : [],
  ]);
  const open = cards.filter((c) => c.stage !== "WON" && c.stage !== "LOST");
  const openValue = open.reduce((s, c) => s + c.value, 0);
  const weighted = open.reduce((s, c) => s + (c.value * c.probability) / 100, 0);
  const unpriced = open.filter((c) => c.unpriced).length;

  return (
    <>
      <PageHeader
        title="Sales pipeline"
        sub={
          <>
            {all ? "" : "Your opportunities only. "}Drag a card to move it. Moving to Lost asks for a reason.
          </>
        }
      >
        {all ? <OwnerFilter team={team} value={sp.owner ?? ""} /> : null}
        <div className="card px-3.5 py-2">
          <span className="small muted">Open</span> <b>{inrS(openValue)}</b>
        </div>
        <div className="card px-3.5 py-2">
          <span className="small muted">Weighted forecast</span> <b>{inrS(weighted)}</b>
        </div>
      </PageHeader>
      {unpriced ? (
        <div className="note warn">
          {unpriced} open {unpriced === 1 ? "opportunity has" : "opportunities have"} items without a price, so the totals are
          understated. Prices are set under Settings → Products.
        </div>
      ) : null}
      <Board cards={cards} />
      {sp.opp && detail ? <OppDrawer key={detail.id + detail.stage} opp={detail} products={products} team={team} /> : null}
    </>
  );
}
