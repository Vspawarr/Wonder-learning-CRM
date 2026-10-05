"use client";

// Company accounts (R39): the forms and buttons of the Bills, Salaries and Account books screens.
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Field, Modal, Options, useAction, useToast } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import {
  createSalary,
  createTransfer,
  decideSpend,
  deleteBill,
  deleteBillPayment,
  deleteCompanyEntry,
  deleteSalary,
  deleteTransfer,
  payBill,
  reassignMovement,
  saveMoneyAccount,
  toggleBookMatch,
} from "@/app/actions";
import { BILL_CATEGORIES, COMPANY_IN_CATEGORIES, COMPANY_OUT_CATEGORIES, EXPENSE_MODES, MONEY_ACCOUNT_KIND_LABEL, billCode, entryCode } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { inrExact as money } from "@/lib/format";
import { shrink } from "../expenses/expenses-client";

export type AccountOpt = { id: string; name: string; kind: string; active: boolean };

/** The account a payment of this mode most likely went through: cash → cash box, card → card, else the first bank. */
export function guessAccount(accounts: AccountOpt[], mode?: string | null) {
  const live = accounts.filter((a) => a.active);
  const want = mode && /cash/i.test(mode) ? "CASH" : mode && /card/i.test(mode) ? "CARD" : "BANK";
  return (live.find((a) => a.kind === want) ?? live.find((a) => a.kind === "BANK") ?? live[0])?.id ?? "";
}

/** "Paid from / received into" select. Empty list → nothing to choose yet (set up accounts in Account books). */
export function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  blank = "Not assigned",
}: {
  id: string;
  accounts: AccountOpt[];
  value: string;
  onChange: (v: string) => void;
  blank?: string;
}) {
  return (
    <select className="sel" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{blank}</option>
      {accounts
        .filter((a) => a.active || a.id === value)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
    </select>
  );
}

/** Upload helper for the multipart routes (bills, other money in / out). */
function useUpload(url: string) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const send = async (fields: Record<string, string>, file: File | null, ok: (r: { number: number; approved: boolean }) => string, done: () => void) => {
    setBusy(true);
    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.set(k, v);
      if (file) body.set("file", file);
      const r = await fetch(url, { method: "POST", body }).then((x) => x.json());
      if (!r.ok) return toast(r.error, true);
      toast(ok(r));
      done();
      router.refresh();
    } catch {
      toast("Saving failed. Check the connection and try again.", true);
    } finally {
      setBusy(false);
    }
  };
  return { busy, send };
}

function FilePick({ id, file, setFile, label }: { id: string; file: File | null; setFile: (f: File | null) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        className="hidden"
        type="file"
        accept="image/*,application/pdf"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          setFile(f ? await shrink(f) : null);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="small flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1.5">
          <span className="min-w-0 truncate">{file.name}</span>
          <button className="btn ghost sm px-1" aria-label="Remove file" onClick={() => setFile(null)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ) : (
        <button className="btn w-full justify-center" type="button" onClick={() => input.current?.click()}>
          <Icon name="upload" size={16} /> Take photo / choose file
        </button>
      )}
    </div>
  );
}

/* ---------- approvals ---------- */

/** Approve / Reject for a bill, salary or money-out entry (Director; Admin while there is no Director login). */
export function DecideButtons({ kind, id, what }: { kind: "bill" | "salary" | "entry"; id: string; what: string }) {
  const { pending, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <button className="btn sm pri" disabled={pending} onClick={() => run(() => decideSpend(kind, id, { approve: true }), { success: "Approved." })}>
        <Icon name="check" size={14} /> Approve
      </button>
      <button className="btn sm bad" disabled={pending} onClick={() => setRejecting(true)}>
        Reject
      </button>
      {rejecting ? (
        <Modal
          title={`Reject ${what}?`}
          onClose={() => setRejecting(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRejecting(false)}>
                Cancel
              </button>
              <button className="btn bad" disabled={pending} onClick={() => run(() => decideSpend(kind, id, { approve: false, reason }), { success: "Rejected.", onDone: () => setRejecting(false) })}>
                Reject
              </button>
            </>
          }
        >
          <Field label="Reason *" htmlFor={`dj-${id}`}>
            <textarea className="ta" id={`dj-${id}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}

/** Small "Delete" with a confirm. */
export function DeleteButton({ what, kind, id }: { what: string; kind: "bill" | "bill-payment" | "salary" | "entry" | "transfer"; id: string }) {
  const { pending, run } = useAction();
  const fn = { bill: deleteBill, "bill-payment": deleteBillPayment, salary: deleteSalary, entry: deleteCompanyEntry, transfer: deleteTransfer }[kind];
  return (
    <button className="btn sm ghost" disabled={pending} onClick={() => confirm(`Delete ${what}?`) && run(() => fn(id), { success: "Deleted." })}>
      Delete
    </button>
  );
}

/** ?show= chips for a list. */
export function ShowChips({ options }: { options: [string, string][] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const cur = sp.get("show") ?? "";
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
      {options.map(([k, l]) => (
        <button
          key={k}
          className={`chip ${cur === k ? "on" : ""}`}
          onClick={() => {
            const next = new URLSearchParams(sp);
            if (k) next.set("show", k);
            else next.delete("show");
            router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/* ---------- bills ---------- */

export function AddBillButton() {
  const blank = () => ({ vendor: "", billNo: "", billDate: todayIST(), dueDate: "", category: "", description: "", amount: "", gstRate: "0" });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const { busy, send } = useUpload("/api/company/bills");
  const amt = Number(v.amount.replace(/,/g, "")) || 0;
  const gst = Math.round(amt * (Number(v.gstRate) || 0)) / 100;
  return (
    <>
      <button
        className="btn pri"
        onClick={() => {
          setV(blank());
          setFile(null);
          setOpen(true);
        }}
      >
        <Icon name="plus" size={16} /> Add bill
      </button>
      {open ? (
        <Modal
          title="Add supplier bill"
          sub="A bill the company has to pay (press, paper, courier, software…). The Director approves it; then it can be paid, in parts if needed."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={busy}
                onClick={() => send(v, file, (r) => (r.approved ? `Bill ${billCode(r.number)} saved.` : `Bill ${billCode(r.number)} sent to the Director for approval.`), () => setOpen(false))}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="From (supplier) *" htmlFor="bl-vendor">
              <input className="in" id="bl-vendor" value={v.vendor} onChange={(e) => setV({ ...v, vendor: e.target.value })} />
            </Field>
            <Field label="Their bill no." htmlFor="bl-no">
              <input className="in" id="bl-no" value={v.billNo} onChange={(e) => setV({ ...v, billNo: e.target.value })} />
            </Field>
            <Field label="Bill date *" htmlFor="bl-date">
              <DateInput id="bl-date" value={v.billDate} onChange={(billDate) => setV({ ...v, billDate })} />
            </Field>
            <Field label="Pay by (due date)" htmlFor="bl-due">
              <DateInput id="bl-due" value={v.dueDate} onChange={(dueDate) => setV({ ...v, dueDate })} />
            </Field>
            <Field label="What for *" htmlFor="bl-cat">
              <select className="sel" id="bl-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
                <Options list={BILL_CATEGORIES} blank="Choose…" />
              </select>
            </Field>
            <Field label="Amount before GST (₹) *" htmlFor="bl-amt">
              <input className="in" id="bl-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            </Field>
            <Field label="GST %" htmlFor="bl-gst">
              <select className="sel" id="bl-gst" value={v.gstRate} onChange={(e) => setV({ ...v, gstRate: e.target.value })}>
                {["0", "5", "12", "18", "28"].map((g) => (
                  <option key={g} value={g}>
                    {g === "0" ? "No GST" : `${g}%`}
                  </option>
                ))}
              </select>
            </Field>
            <div className="fld">
              <span className="mb-1 block font-semibold">Bill total</span>
              <div className="py-2 text-[17px] font-bold">
                {money(amt + gst)}
                {gst ? <span className="small muted font-normal"> (GST {money(gst)})</span> : null}
              </div>
            </div>
          </div>
          <Field label="Description *" htmlFor="bl-desc">
            <input className="in" id="bl-desc" placeholder="e.g. Printing of 500 Class 1 workbooks" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <FilePick id="bl-file" file={file} setFile={setFile} label="Bill photo / PDF" />
        </Modal>
      ) : null}
    </>
  );
}

export function PayBillButton({ bill, accounts }: { bill: { id: string; number: number; vendor: string; balance: number }; accounts: AccountOpt[] }) {
  const blank = () => ({ date: todayIST(), amount: String(bill.balance), mode: "NEFT/RTGS", reference: "", moneyAccountId: guessAccount(accounts, "NEFT/RTGS") });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const { pending, run } = useAction();
  return (
    <>
      <button
        className="btn sm pri"
        onClick={() => {
          setV(blank());
          setOpen(true);
        }}
      >
        <Icon name="rupee" size={14} /> Pay
      </button>
      {open ? (
        <Modal
          title={`Pay ${billCode(bill.number)} · ${bill.vendor}`}
          sub={`Still to pay: ${money(bill.balance)}. You can pay part now and the rest later.`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => payBill(bill.id, v), { success: "Payment saved.", onDone: () => setOpen(false) })}>
                Save payment
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="Amount (₹) *" htmlFor="bp-amt">
              <input className="in" id="bp-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            </Field>
            <Field label="Paid on *" htmlFor="bp-date">
              <DateInput id="bp-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
            </Field>
            <Field label="Mode" htmlFor="bp-mode">
              <select className="sel" id="bp-mode" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value, moneyAccountId: guessAccount(accounts, e.target.value) })}>
                <Options list={EXPENSE_MODES} blank="Not specified" />
              </select>
            </Field>
            <Field label="Paid from" htmlFor="bp-acc">
              <AccountSelect id="bp-acc" accounts={accounts} value={v.moneyAccountId} onChange={(moneyAccountId) => setV({ ...v, moneyAccountId })} />
            </Field>
          </div>
          <Field label="Reference" htmlFor="bp-ref">
            <input className="in" id="bp-ref" placeholder="UTR / cheque no." value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}

/* ---------- salaries ---------- */

export function AddSalaryButton({ people, accounts, month }: { people: { id: string; name: string }[]; accounts: AccountOpt[]; month: string }) {
  const blank = () => ({
    month,
    userId: "",
    employeeName: "",
    gross: "",
    deductions: "0",
    paidOn: todayIST(),
    mode: "NEFT/RTGS",
    moneyAccountId: guessAccount(accounts, "NEFT/RTGS"),
    reference: "",
    note: "",
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const { pending, run } = useAction();
  const net = (Number(v.gross.replace(/,/g, "")) || 0) - (Number(v.deductions.replace(/,/g, "")) || 0);
  return (
    <>
      <button
        className="btn pri"
        onClick={() => {
          setV(blank());
          setOpen(true);
        }}
      >
        <Icon name="plus" size={16} /> Add salary
      </button>
      {open ? (
        <Modal
          title="Salary paid"
          sub="One entry per person per month. Deductions are PF, TDS, advance recovered etc.; the take-home is what left the bank."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => createSalary(v), { success: "Salary saved.", onDone: () => setOpen(false) })}>
                Save
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="Month *" htmlFor="sl-month">
              <input className="in" id="sl-month" type="month" value={v.month} onChange={(e) => setV({ ...v, month: e.target.value })} />
            </Field>
            <Field label="Employee *" htmlFor="sl-user">
              <select className="sel" id="sl-user" value={v.userId} onChange={(e) => setV({ ...v, userId: e.target.value })}>
                <option value="">Someone without a login…</option>
                <Options list={people.map((p) => [p.id, p.name] as const)} />
              </select>
            </Field>
            {!v.userId ? (
              <Field label="Name *" htmlFor="sl-name">
                <input className="in" id="sl-name" placeholder="e.g. office helper" value={v.employeeName} onChange={(e) => setV({ ...v, employeeName: e.target.value })} />
              </Field>
            ) : null}
            <Field label="Gross salary (₹) *" htmlFor="sl-gross">
              <input className="in" id="sl-gross" inputMode="decimal" value={v.gross} onChange={(e) => setV({ ...v, gross: e.target.value })} />
            </Field>
            <Field label="Deductions (₹)" htmlFor="sl-ded">
              <input className="in" id="sl-ded" inputMode="decimal" value={v.deductions} onChange={(e) => setV({ ...v, deductions: e.target.value })} />
            </Field>
            <div className="fld">
              <span className="mb-1 block font-semibold">Take-home</span>
              <div className="py-2 text-[17px] font-bold">{money(Math.max(0, net))}</div>
            </div>
            <Field label="Paid on *" htmlFor="sl-date">
              <DateInput id="sl-date" value={v.paidOn} onChange={(paidOn) => setV({ ...v, paidOn })} />
            </Field>
            <Field label="Mode" htmlFor="sl-mode">
              <select className="sel" id="sl-mode" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value, moneyAccountId: guessAccount(accounts, e.target.value) })}>
                <Options list={EXPENSE_MODES} blank="Not specified" />
              </select>
            </Field>
            <Field label="Paid from" htmlFor="sl-acc">
              <AccountSelect id="sl-acc" accounts={accounts} value={v.moneyAccountId} onChange={(moneyAccountId) => setV({ ...v, moneyAccountId })} />
            </Field>
            <Field label="Reference" htmlFor="sl-ref">
              <input className="in" id="sl-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
            </Field>
          </div>
          <Field label="Note" htmlFor="sl-note">
            <input className="in" id="sl-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}

/* ---------- account books ---------- */

export function AccountButton({ account }: { account?: { id: string; name: string; kind: string; number: string | null; openingBalance: number; openingDate: string; active: boolean } }) {
  const blank = () => ({
    name: account?.name ?? "",
    kind: account?.kind ?? "BANK",
    number: account?.number ?? "",
    openingBalance: account ? String(account.openingBalance) : "0",
    openingDate: account?.openingDate ?? todayIST(),
    active: account?.active ?? true,
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const { pending, run } = useAction();
  return (
    <>
      <button
        className={account ? "btn sm ghost" : "btn"}
        onClick={() => {
          setV(blank());
          setOpen(true);
        }}
      >
        {account ? "Edit" : (
          <>
            <Icon name="plus" size={16} /> Add account
          </>
        )}
      </button>
      {open ? (
        <Modal
          title={account ? `Edit ${account.name}` : "Add money account"}
          sub="A bank account, the office cash box or the company credit card. The opening balance is what it held on the opening date (for a card, enter what is owed as a minus)."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => saveMoneyAccount(account?.id ?? null, v), { success: "Saved.", onDone: () => setOpen(false) })}>
                Save
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="Name *" htmlFor="ma-name">
              <input className="in" id="ma-name" placeholder="e.g. HDFC Current" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="ma-kind">
              <select className="sel" id="ma-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
                <Options list={Object.entries(MONEY_ACCOUNT_KIND_LABEL)} />
              </select>
            </Field>
            <Field label="Account / card no. (last digits)" htmlFor="ma-no">
              <input className="in" id="ma-no" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} />
            </Field>
            <Field label="Opening balance (₹)" htmlFor="ma-ob">
              <input className="in" id="ma-ob" inputMode="decimal" value={v.openingBalance} onChange={(e) => setV({ ...v, openingBalance: e.target.value })} />
            </Field>
            <Field label="Opening date *" htmlFor="ma-od">
              <DateInput id="ma-od" value={v.openingDate} onChange={(openingDate) => setV({ ...v, openingDate })} />
            </Field>
            {account ? (
              <label className="flex items-center gap-2 pt-6">
                <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> In use
              </label>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export function TransferButton({ accounts }: { accounts: AccountOpt[] }) {
  const blank = () => ({ date: todayIST(), amount: "", fromAccountId: "", toAccountId: "", reference: "", note: "" });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const { pending, run } = useAction();
  return (
    <>
      <button
        className="btn"
        disabled={accounts.length < 2}
        title={accounts.length < 2 ? "Add at least two accounts first" : undefined}
        onClick={() => {
          setV(blank());
          setOpen(true);
        }}
      >
        <Icon name="refresh" size={16} /> Transfer
      </button>
      {open ? (
        <Modal
          title="Move money between accounts"
          sub="e.g. cash deposited in the bank, or the credit-card bill paid from the bank. It is not money in or out of the company."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => createTransfer(v), { success: "Transfer saved.", onDone: () => setOpen(false) })}>
                Save
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="From *" htmlFor="tr-from">
              <AccountSelect id="tr-from" accounts={accounts} value={v.fromAccountId} onChange={(fromAccountId) => setV({ ...v, fromAccountId })} blank="Choose…" />
            </Field>
            <Field label="To *" htmlFor="tr-to">
              <AccountSelect id="tr-to" accounts={accounts} value={v.toAccountId} onChange={(toAccountId) => setV({ ...v, toAccountId })} blank="Choose…" />
            </Field>
            <Field label="Amount (₹) *" htmlFor="tr-amt">
              <input className="in" id="tr-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            </Field>
            <Field label="Date *" htmlFor="tr-date">
              <DateInput id="tr-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
            </Field>
            <Field label="Reference" htmlFor="tr-ref">
              <input className="in" id="tr-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
            </Field>
            <Field label="Note" htmlFor="tr-note">
              <input className="in" id="tr-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
            </Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/** Other money in (interest, capital, loan…) or out (rent, bank charges, GST / TDS paid…). */
export function MoneyEntryButton({ direction, accounts }: { direction: "IN" | "OUT"; accounts: AccountOpt[] }) {
  const blank = () => ({ date: todayIST(), direction, category: "", amount: "", party: "", reference: "", note: "", moneyAccountId: guessAccount(accounts, "NEFT/RTGS") });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const { busy, send } = useUpload("/api/company/entries");
  return (
    <>
      <button
        className="btn"
        onClick={() => {
          setV(blank());
          setFile(null);
          setOpen(true);
        }}
      >
        <Icon name={direction === "IN" ? "plus" : "rupee"} size={16} /> {direction === "IN" ? "Other money in" : "Other payment"}
      </button>
      {open ? (
        <Modal
          title={direction === "IN" ? "Other money in" : "Other payment"}
          sub={
            direction === "IN"
              ? "Money that didn't come from a school: bank interest, capital put in, a loan, a refund."
              : "Rent, electricity, bank charges, GST / TDS paid, CA fees, loan repayment… (supplier bills and salaries have their own screens). The Director approves it."
          }
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={busy}
                onClick={() => send(v, file, (r) => (r.approved ? `${entryCode(r.number)} saved.` : `${entryCode(r.number)} sent to the Director for approval.`), () => setOpen(false))}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="What is it *" htmlFor="me-cat">
              <select className="sel" id="me-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
                <Options list={direction === "IN" ? COMPANY_IN_CATEGORIES : COMPANY_OUT_CATEGORIES} blank="Choose…" />
              </select>
            </Field>
            <Field label="Amount (₹) *" htmlFor="me-amt">
              <input className="in" id="me-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            </Field>
            <Field label="Date *" htmlFor="me-date">
              <DateInput id="me-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
            </Field>
            <Field label={direction === "IN" ? "Received into" : "Paid from"} htmlFor="me-acc">
              <AccountSelect id="me-acc" accounts={accounts} value={v.moneyAccountId} onChange={(moneyAccountId) => setV({ ...v, moneyAccountId })} />
            </Field>
            <Field label={direction === "IN" ? "From whom" : "Paid to"} htmlFor="me-party">
              <input className="in" id="me-party" value={v.party} onChange={(e) => setV({ ...v, party: e.target.value })} />
            </Field>
            <Field label="Reference" htmlFor="me-ref">
              <input className="in" id="me-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
            </Field>
          </div>
          <Field label="Note" htmlFor="me-note">
            <input className="in" id="me-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </Field>
          <FilePick id="me-file" file={file} setFile={setFile} label="Voucher / receipt (optional)" />
        </Modal>
      ) : null}
    </>
  );
}

/** Tick = matched with the bank statement. */
export function MatchTick({ k, on }: { k: string; on: boolean }) {
  const { pending, run } = useAction();
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]" title="Tick when you find it in the bank statement">
      <input type="checkbox" checked={on} disabled={pending} onChange={() => run(() => toggleBookMatch(k))} />
      Matched
    </label>
  );
}

/** Move an entry to another account. */
export function ReassignSelect({ k, accountId, accounts }: { k: string; accountId: string | null; accounts: AccountOpt[] }) {
  const { pending, run } = useAction();
  return (
    <select
      className="sel h-8 w-auto max-w-[180px] py-0 text-[13px]"
      aria-label="Account"
      disabled={pending}
      value={accountId ?? ""}
      onChange={(e) => run(() => reassignMovement(k, e.target.value || null), { success: "Moved." })}
    >
      <option value="">Not assigned</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

/** ?acc= picker for the account book. */
export function BookPicker({ accounts, current }: { accounts: AccountOpt[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <select
      className="sel w-auto min-w-[200px]"
      aria-label="Account"
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(sp);
        next.set("acc", e.target.value);
        router.replace(`${path}?${next}`, { scroll: false });
      }}
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.active ? "" : " (not in use)"}
        </option>
      ))}
      <option value="none">Not assigned to an account</option>
    </select>
  );
}
