"use client";

// Accounts → Expenses (R37): pay people back, give / take back advances, filter by person.
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Field, Modal, Options, useAction } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { deleteEmployeeAdvance, recordEmployeeAdvance, reimburseExpenses } from "@/app/actions";
import { EXPENSE_MODES } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { inrExact as money } from "@/lib/format";

export function PayBackButton({ person, amount }: { person: { id: string; name: string }; amount: number }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ date: todayIST(), reference: "" });
  const { pending, run } = useAction();
  return (
    <>
      <button className="btn sm pri" onClick={() => setOpen(true)}>
        Pay back {money(amount)}
      </button>
      {open ? (
        <Modal
          title={`Pay back ${person.name}`}
          sub={`All their approved own-money expenses: ${money(amount)}. Marks them as paid back.`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => reimburseExpenses(person.id, v), { success: `${person.name} marked as paid back.`, onDone: () => setOpen(false) })}>
                Mark paid back
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="Paid on *" htmlFor="pb-date">
              <DateInput id="pb-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
            </Field>
            <Field label="Reference" htmlFor="pb-ref">
              <input className="in" id="pb-ref" placeholder="UTR / cash voucher (optional)" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
            </Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/** Give an advance to an employee, or record money they returned. */
export function AdvanceButton({ people, person, small }: { people: { id: string; name: string }[]; person?: { id: string; name: string }; small?: boolean }) {
  const blank = () => ({ userId: person?.id ?? "", kind: "GIVEN", amount: "", date: todayIST(), mode: "", reference: "", note: "" });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const { pending, run } = useAction();
  return (
    <>
      <button
        className={small ? "btn sm" : "btn"}
        onClick={() => {
          setV(blank());
          setOpen(true);
        }}
      >
        <Icon name="rupee" size={small ? 14 : 16} /> {person ? "Advance" : "Give advance"}
      </button>
      {open ? (
        <Modal
          title={person ? `Advance · ${person.name}` : "Give advance"}
          sub="Money given to an employee for upcoming spends (or money they gave back). Their bills marked “From my advance” are counted against it."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => recordEmployeeAdvance(v), { success: "Saved.", onDone: () => setOpen(false) })}>
                Save
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="Employee *" htmlFor="adv-user">
              <select className="sel" id="adv-user" value={v.userId} disabled={!!person} onChange={(e) => setV({ ...v, userId: e.target.value })}>
                <Options list={people.map((p) => [p.id, p.name] as const)} blank="Choose…" />
              </select>
            </Field>
            <Field label="Type" htmlFor="adv-kind">
              <select className="sel" id="adv-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
                <option value="GIVEN">Advance given</option>
                <option value="RETURNED">Money returned by employee</option>
              </select>
            </Field>
            <Field label="Amount (₹) *" htmlFor="adv-amt">
              <input className="in" id="adv-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            </Field>
            <Field label="Date *" htmlFor="adv-date">
              <DateInput id="adv-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
            </Field>
            <Field label="Mode" htmlFor="adv-mode">
              <select className="sel" id="adv-mode" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
                <Options list={EXPENSE_MODES} blank="Not specified" />
              </select>
            </Field>
            <Field label="Reference" htmlFor="adv-ref">
              <input className="in" id="adv-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
            </Field>
          </div>
          <Field label="Note" htmlFor="adv-note">
            <input className="in" id="adv-note" placeholder="e.g. Nashik–Pune tour, 10–14 Oct" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}

export function DeleteAdvance({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <button className="btn sm ghost" disabled={pending} onClick={() => confirm("Delete this advance entry?") && run(() => deleteEmployeeAdvance(id), { success: "Deleted." })}>
      Delete
    </button>
  );
}

/** ?person= filter for the expense list. */
export function PersonFilter({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <select
      className="sel w-auto min-w-[180px]"
      aria-label="Person"
      value={sp.get("person") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(sp);
        if (e.target.value) next.set("person", e.target.value);
        else next.delete("person");
        router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
      }}
    >
      <option value="">Everyone</option>
      <option value="company">Company expenses</option>
      <Options list={people.map((p) => [p.id, p.name] as const)} />
    </select>
  );
}
