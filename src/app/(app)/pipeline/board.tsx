"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useAction } from "@/components/client";
import { Avatar, DueTag } from "@/components/ui";
import { moveOpportunity } from "@/app/actions";
import { CLOSED_STAGES, STAGES, STAGE_COLOR, STAGE_LABEL, STAGE_PROBABILITY, type Stage, TEMPERATURE_LABEL } from "@/lib/constants";
import { fmtDate, todayIST } from "@/lib/dates";
import { inrS } from "@/lib/format";
import type { PipelineCard } from "@/server/queries";
import { LostModal, WonModal } from "./close-modals";

const CLOSED_SHOWN = 6;

export function Board({ cards: initial }: { cards: PipelineCard[] }) {
  const [cards, setCards] = useState(initial);
  // Take fresh server data whenever it arrives (after revalidation).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCards(initial);
  }
  const [lost, setLost] = useState<PipelineCard | null>(null);
  const [won, setWon] = useState<PipelineCard | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const { run } = useAction();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const openCard = (id: string) => {
    const next = new URLSearchParams(sp);
    next.set("opp", id);
    router.push(`${path}?${next}`, { scroll: false });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const card = cards.find((c) => c.id === e.active.id);
    const to = e.over?.id as Stage | undefined;
    if (!card || !to || card.stage === to) return;
    if (CLOSED_STAGES.includes(card.stage)) {
      run(async () => ({ ok: false, error: "Closed deals cannot be moved. Create a new opportunity instead." }));
      return;
    }
    if (to === "LOST") {
      setLost(card);
      return;
    }
    if (to === "WON") {
      setWon(card);
      return;
    }
    const prev = cards;
    setCards(cards.map((c) => (c.id === card.id ? { ...c, stage: to, probability: STAGE_PROBABILITY[to] } : c)));
    run(async () => {
      const r = await moveOpportunity(card.id, { stage: to });
      if (!r.ok) setCards(prev);
      return r;
    }, { success: `${card.schoolName} moved to ${STAGE_LABEL[to]}. Probability set to ${STAGE_PROBABILITY[to]}%.` });
  };

  const today = todayIST();
  const dragged = dragging ? cards.find((c) => c.id === dragging) : undefined;
  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragging(String(e.active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="board">
          {STAGES.map((s) => {
            let cs = cards.filter((c) => c.stage === s);
            const total = cs.reduce((n, c) => n + c.value, 0);
            const count = cs.length;
            if (CLOSED_STAGES.includes(s)) cs = [...cs].sort((a, b) => ((b.closedAt ?? "") > (a.closedAt ?? "") ? 1 : -1)).slice(0, CLOSED_SHOWN);
            return (
              <Column key={s} stage={s} count={count} total={total}>
                {cs.map((c) => (
                  <Card key={c.id} card={c} today={today} onOpen={() => openCard(c.id)} />
                ))}
                {count > cs.length ? <div className="small faint px-1">+{count - cs.length} older</div> : null}
                {count === 0 ? <div className="small faint p-2">Drop here</div> : null}
              </Column>
            );
          })}
        </div>
        {/* The moving copy lives outside the scrolling board so auto-scroll can't stretch it. */}
        <DragOverlay>{dragged ? <CardBody card={dragged} today={today} className="shadow-lg" /> : null}</DragOverlay>
      </DndContext>
      {lost ? <LostModal oppId={lost.id} school={lost.schoolName} competitor={lost.competitor} onClose={() => setLost(null)} /> : null}
      {won ? <WonModal oppId={won.id} school={won.schoolName} onClose={() => setWon(null)} /> : null}
    </>
  );
}

function Column({ stage, count, total, children }: { stage: Stage; count: number; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section ref={setNodeRef} className={`col ${isOver ? "over" : ""}`} aria-label={STAGE_LABEL[stage]}>
      <header className="mx-1 mt-0.5 mb-2.5 flex items-baseline justify-between">
        <b style={{ color: STAGE_COLOR[stage] }}>{STAGE_LABEL[stage]}</b>
        <span className="small muted">
          {count} · {inrS(total)}
        </span>
      </header>
      {children}
    </section>
  );
}

function Card({ card: c, today, onOpen }: { card: PipelineCard; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id });
  return (
    <button ref={setNodeRef} className="block w-full cursor-grab touch-none text-left" onClick={onOpen} {...listeners} {...attributes}>
      <CardBody card={c} today={today} className={isDragging ? "drag" : ""} />
    </button>
  );
}

function CardBody({ card: c, today, className }: { card: PipelineCard; today: string; className?: string }) {
  return (
    <div className={`kc ${className ?? ""}`} style={{ "--c": STAGE_COLOR[c.stage] } as React.CSSProperties}>
      <div className="t">{c.schoolName}</div>
      <div className="m">
        {c.noValue ? <span className="faint">No value yet</span> : inrS(c.value)} · {c.probability}% · {TEMPERATURE_LABEL[c.temperature]}
      </div>
      {c.competitor ? <div className="m">vs {c.competitor}</div> : null}
      {c.stage === "LOST" ? (
        <div className="m">{c.lostReason}</div>
      ) : c.stage === "WON" ? null : (
        <div className="m">
          {c.nextActionDate ? (
            <>
              {c.nextAction ?? "Next action"} · <DueTag date={c.nextActionDate} today={today} />
            </>
          ) : c.expectedCloseDate ? (
            `Close ${fmtDate(c.expectedCloseDate, today)}`
          ) : null}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <Avatar id={c.owner.id} name={c.owner.name} size={22} />
      </div>
    </div>
  );
}
