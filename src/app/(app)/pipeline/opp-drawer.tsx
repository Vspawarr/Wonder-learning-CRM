"use client";

import { DateInput } from "@/components/date-input";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { ActivityLog, LogInteractionButton } from "@/components/activity";
import { Pill, DueTag } from "@/components/ui";
import { convertToClient, moveOpportunity, updateOpportunity } from "@/app/actions";
import { COMPETITORS, STAGES, STAGE_LABEL, STAGE_PROBABILITY, clientCode, leadCode, oppCode, type Stage } from "@/lib/constants";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import { inr } from "@/lib/format";
import type { OppDetail, Option, ProductOption } from "@/server/queries";
import { LostModal, WonModal } from "./close-modals";
import { QuotationsPanel } from "./quotations";

export function OppDrawer({
  opp,
  products,
  team,
  emailReady,
  me,
}: {
  opp: OppDetail;
  products: ProductOption[];
  team: Option[];
  emailReady: boolean;
  me: { name: string };
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const close = () => {
    const next = new URLSearchParams(sp);
    next.delete("opp");
    router.push(next.size ? `${path}?${next}` : path, { scroll: false });
  };
  const initial = {
    expectedValue: opp.expectedValue === null ? "" : String(opp.expectedValue),
    expectedCloseDate: opp.expectedCloseDate ?? "",
    competitor: opp.competitor ?? "",
    decisionMaker: opp.decisionMaker ?? "",
    nextAction: opp.nextAction ?? "",
    nextActionDate: opp.nextActionDate ?? "",
    ownerId: opp.owner.id,
  };
  const [v, setV] = useState(initial);
  const [lost, setLost] = useState(false);
  const [won, setWon] = useState(false);
  const { pending, run } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const today = todayIST();
  const owners = team.some((t) => t.id === opp.owner.id) ? team : [opp.owner, ...team];


  const move = (stage: Stage) => {
    if (stage === opp.stage) return;
    if (stage === "LOST") return setLost(true);
    if (stage === "WON") return setWon(true);
    run(() => moveOpportunity(opp.id, { stage }), {
      success: `Moved to ${STAGE_LABEL[stage]}. Probability set to ${STAGE_PROBABILITY[stage]}%.`,
    });
  };

  return (
    <Modal
      drawer
      onClose={close}
      title={
        <div>
          <h2 className="text-xl">{opp.schoolName}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Pill>{STAGE_LABEL[opp.stage]}</Pill>
            <span className="tag">{oppCode(opp.number)}</span>
            <span className="small muted">
              {opp.probability}% · {opp.noValue ? "no expected value yet" : inr(opp.value)}
            </span>
          </div>
        </div>
      }
      sub={
        opp.lead ? (
          <>
            {opp.lead.contactName} · {opp.lead.mobile} · {opp.lead.city} ·{" "}
            <Link href={`/leads/${opp.lead.id}`}>Lead {leadCode(opp.lead.number)}</Link>
          </>
        ) : null
      }
      footer={
        opp.closed ? (
          <button className="btn" onClick={close}>
            Close
          </button>
        ) : (
          <>
            <button className="btn" disabled={!dirty || pending} onClick={() => setV(initial)}>
              Discard changes
            </button>
            <button
              className="btn pri"
              disabled={!dirty || pending}
              onClick={() => run(() => updateOpportunity(opp.id, v), { success: "Opportunity saved." })}
            >
              Save changes
            </button>
          </>
        )
      }
    >
      {opp.stage === "LOST" ? (
        <div className="note bad">
          <b>Lost: {opp.lostReason}.</b> {opp.lostRemarks}
          {opp.competitor ? ` (went with ${opp.competitor})` : ""}
        </div>
      ) : null}
      {opp.stage === "WON" ? (
        opp.client ? (
          <div className="note ok">
            Won and converted to <Link href={`/clients/${opp.client.id}`}>client {clientCode(opp.client.number)}</Link>.
          </div>
        ) : (
          <div className="note ok flex flex-wrap items-center justify-between gap-2">
            <span>Won! Convert this school into a client to start onboarding.</span>
            <button
              className="btn pri sm"
              disabled={pending}
              onClick={() =>
                run(() => convertToClient(opp.id), {
                  success: `${opp.schoolName} is now a client. Onboarding task created.`,
                  onDone: (id) => id && router.push(`/clients/${id}`),
                })
              }
            >
              Convert to client
            </button>
          </div>
        )
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Stage" htmlFor="op-stage">
          <select className="sel" id="op-stage" value={opp.stage} disabled={opp.closed || pending} onChange={(e) => move(e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]} ({STAGE_PROBABILITY[s]}%)
              </option>
            ))}
          </select>
        </Field>
        <div className="mb-3">
          <LogInteractionButton opportunityId={opp.id} />
        </div>
      </div>

      <QuotationsPanel opp={opp} products={products} emailReady={emailReady} me={me} />

      <div className="fg2">
        <Field label="Expected deal value (₹)" htmlFor="op-value">
          <input
            className="in"
            id="op-value"
            inputMode="numeric"
            placeholder="e.g. 250000"
            disabled={opp.closed}
            value={v.expectedValue}
            onChange={(e) => setV({ ...v, expectedValue: e.target.value })}
          />
        </Field>
        <Field label="Expected close date" htmlFor="op-close">
          <DateInput id="op-close" disabled={opp.closed} value={v.expectedCloseDate} onChange={(expectedCloseDate) => setV({ ...v, expectedCloseDate })} />
        </Field>
        <Field label="Competitor" htmlFor="op-comp">
          <select className="sel" id="op-comp" disabled={opp.closed} value={v.competitor} onChange={(e) => setV({ ...v, competitor: e.target.value })}>
            <Options list={COMPETITORS} blank="None known" />
          </select>
        </Field>
        <Field label="Next action" htmlFor="op-next">
          <input className="in" id="op-next" disabled={opp.closed} value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} />
        </Field>
        <Field label="Next action date" htmlFor="op-nextd">
          <DateInput id="op-nextd" disabled={opp.closed} value={v.nextActionDate} onChange={(nextActionDate) => setV({ ...v, nextActionDate })} />
        </Field>
        <Field label="Decision maker" htmlFor="op-dm">
          <input className="in" id="op-dm" disabled={opp.closed} value={v.decisionMaker} onChange={(e) => setV({ ...v, decisionMaker: e.target.value })} />
        </Field>
        <Field label="Owner" htmlFor="op-owner">
          <select className="sel" id="op-owner" disabled={opp.closed || owners.length === 1} value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })}>
            <Options list={owners.map((t) => [t.id, t.name] as const)} />
          </select>
        </Field>
      </div>

      {opp.openTasks.length ? (
        <>
          <h3 className="mt-2">Open follow-ups</h3>
          <div className="mt-1 mb-3">
            {opp.openTasks.map((t) => (
              <div key={t.id} className="flex justify-between gap-2 border-b border-line py-1.5 last:border-0">
                <span>{t.title}</span>
                <span className="small whitespace-nowrap">
                  <DueTag date={t.dueDate} today={today} />
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h3 className="mt-2">Stage history</h3>
      <div className="mt-1 mb-3">
        {opp.stageChanges.map((s) => (
          <div key={s.id} className="small flex justify-between gap-2 border-b border-line py-1.5 last:border-0">
            <span>{s.from ? `${STAGE_LABEL[s.from]} → ${STAGE_LABEL[s.to]}` : `Created in ${STAGE_LABEL[s.to]}`}</span>
            <span className="faint whitespace-nowrap">
              {fmtDate(istDate(s.at), today)} · {s.by}
            </span>
          </div>
        ))}
      </div>

      <h3 className="mt-2 mb-2">Activity</h3>
      <ActivityLog items={opp.activities} />

      {won ? <WonModal oppId={opp.id} school={opp.schoolName} onClose={() => setWon(false)} /> : null}
      {lost ? <LostModal oppId={opp.id} school={opp.schoolName} competitor={v.competitor || null} onClose={() => setLost(false)} /> : null}
    </Modal>
  );
}
