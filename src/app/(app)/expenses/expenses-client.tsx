"use client";

// Expenses (R37): add a spend with its bill photo, and the cards that list them.
import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Field,
  Modal,
  Options,
  useAction,
  useToast,
} from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Pill, type Tone } from "@/components/ui";
import { approveExpense, deleteExpense, rejectExpense } from "@/app/actions";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_MODES,
  EXPENSE_PAID_BY_LABEL,
  EXPENSE_PAID_BY_SHORT,
  EXPENSE_STATUS_LABEL,
  expenseCode,
} from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { inrExact as money } from "@/lib/format";
import type { ExpenseRow } from "@/server/expenses";

const dmy = (d: string) => d.split("-").reverse().join("/");

/** Phone photos can be 5–10 MB: shrink them to a clear JPEG (longest side 1800px) before upload. */
async function shrink(file: File): Promise<File> {
  if (
    !file.type.startsWith("image/") ||
    (file.size < 900_000 && /jpe?g|png/.test(file.type))
  )
    return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) =>
      canvas.toBlob(ok, "image/jpeg", 0.8),
    );
    return blob
      ? new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "bill"}.jpg`, {
          type: "image/jpeg",
        })
      : file;
  } catch {
    return file;
  }
}

export type Person = { id: string; name: string };

/** "+ Add expense". Accounts also choose whose expense it is, or a company-account expense. */
export function AddExpenseButton({
  accounts,
  people,
  targets,
  me,
  label = "Add expense",
  company = false,
}: {
  accounts: boolean;
  people: Person[];
  targets: { value: string; label: string }[];
  me: string;
  label?: string;
  /** Start as a company-account expense (Accounts page). */
  company?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const blank = () => ({
    date: todayIST(),
    category: "",
    amount: "",
    description: "",
    city: "",
    paidTo: "",
    paidBy: company ? "COMPANY" : "OWN",
    mode: "",
    reference: "",
    userId: company ? "" : me,
    related: "",
    billAvailable: "yes",
    noBillReason: "",
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof ReturnType<typeof blank>, val: string) =>
    setV({ ...v, [k]: val });
  const paidByOptions = (
    Object.entries(EXPENSE_PAID_BY_LABEL) as [string, string][]
  ).filter(([k]) => accounts || k !== "COMPANY");

  const save = async () => {
    setBusy(true);
    try {
      const body = new FormData();
      for (const [k, val] of Object.entries(v))
        body.set(
          k,
          k === "userId" && v.paidBy === "COMPANY" && !val ? "" : val,
        );
      if (v.billAvailable === "yes")
        for (const f of files) body.append("bill", f);
      const r = await fetch("/api/expenses", { method: "POST", body }).then(
        (x) => x.json(),
      );
      if (!r.ok) return toast(r.error, true);
      toast(
        r.approved
          ? `Expense ${expenseCode(r.number)} saved.`
          : `Expense ${expenseCode(r.number)} sent to Accounts for approval.`,
      );
      setOpen(false);
      router.refresh();
    } catch {
      toast("Saving failed. Check the connection and try again.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="btn pri"
        onClick={() => {
          setV(blank());
          setFiles([]);
          setOpen(true);
        }}
      >
        <Icon name="plus" size={16} /> {label}
      </button>
      {open ? (
        <Modal
          title={v.paidBy === "COMPANY" ? "Company expense" : "Add expense"}
          sub="Attach a clear photo of the bill, or describe the expense if there is none. The Director approves it; own-money spends are then paid back."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="fld">
            <span className="mb-1 block font-semibold">
              Is the bill available? *
            </span>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Is the bill available?"
            >
              {(
                [
                  ["yes", "Yes, I have the bill"],
                  ["no", "No bill"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={v.billAvailable === k}
                  className={`rounded-lg border-2 px-2 py-2.5 text-center ${v.billAvailable === k ? "border-brand bg-surf2 font-bold text-brand" : "border-line text-ink2"}`}
                  onClick={() => set("billAvailable", k)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {v.billAvailable === "no" ? (
            <Field
              label="Describe the expense and why there is no bill *"
              htmlFor="ex-nobill"
            >
              <textarea
                className="ta"
                id="ex-nobill"
                rows={3}
                placeholder="e.g. Auto rickshaw from Nashik station to 3 schools, ₹50 each way; driver gives no receipt"
                value={v.noBillReason}
                onChange={(e) => set("noBillReason", e.target.value)}
              />
            </Field>
          ) : (
            <div className="fld">
              <label htmlFor="ex-bill">Bill photo / PDF *</label>
              <input
                ref={input}
                id="ex-bill"
                className="hidden"
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={async (e) => {
                  const picked = await Promise.all(
                    [...(e.target.files ?? [])].map(shrink),
                  );
                  setFiles((cur) => [...cur, ...picked].slice(0, 4));
                  e.target.value = "";
                }}
              />
              <button
                className="btn w-full justify-center"
                type="button"
                onClick={() => input.current?.click()}
              >
                <Icon name="upload" size={16} />{" "}
                {files.length ? "Add another bill" : "Take photo / choose file"}
              </button>
              {files.length ? (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="small flex items-center justify-between gap-2 rounded-lg border border-line px-2 py-1"
                    >
                      <span className="min-w-0 truncate">{f.name}</span>
                      <span className="faint whitespace-nowrap">
                        {Math.round(f.size / 1024)} KB
                      </span>
                      <button
                        className="btn ghost sm px-1"
                        aria-label={`Remove ${f.name}`}
                        onClick={() =>
                          setFiles(files.filter((_, j) => j !== i))
                        }
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          <div className="fg2">
            <Field label="Date *" htmlFor="ex-date">
              <DateInput
                id="ex-date"
                value={v.date}
                onChange={(date) => set("date", date)}
              />
            </Field>
            <Field label="Amount (₹) *" htmlFor="ex-amt">
              <input
                className="in"
                id="ex-amt"
                inputMode="decimal"
                value={v.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
            <Field label="Kind of expense *" htmlFor="ex-cat">
              <select
                className="sel"
                id="ex-cat"
                value={v.category}
                onChange={(e) => set("category", e.target.value)}
              >
                <Options list={EXPENSE_CATEGORIES} blank="Choose…" />
              </select>
            </Field>
            <Field label="Who paid *" htmlFor="ex-by">
              <select
                className="sel"
                id="ex-by"
                value={v.paidBy}
                onChange={(e) =>
                  setV({
                    ...v,
                    paidBy: e.target.value,
                    userId: e.target.value === "COMPANY" ? "" : v.userId || me,
                  })
                }
              >
                <Options list={paidByOptions} />
              </select>
            </Field>
            {accounts ? (
              <Field
                label={
                  v.paidBy === "COMPANY" ? "For (optional)" : "Whose expense"
                }
                htmlFor="ex-user"
              >
                <select
                  className="sel"
                  id="ex-user"
                  value={v.userId}
                  onChange={(e) => set("userId", e.target.value)}
                >
                  {v.paidBy === "COMPANY" ? (
                    <option value="">Company (no employee)</option>
                  ) : null}
                  <Options
                    list={people.map(
                      (p) =>
                        [
                          p.id,
                          p.id === me ? `${p.name} (me)` : p.name,
                        ] as const,
                    )}
                  />
                </select>
              </Field>
            ) : null}
            <Field label="City / place" htmlFor="ex-city">
              <input
                className="in"
                id="ex-city"
                placeholder="e.g. Nashik"
                value={v.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
          </div>
          <Field label="What was it for? *" htmlFor="ex-desc">
            <input
              className="in"
              id="ex-desc"
              placeholder="e.g. Hotel, 2 nights, school visits in Nashik"
              value={v.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="fg2">
            <Field label="Paid to" htmlFor="ex-to">
              <input
                className="in"
                id="ex-to"
                placeholder="Hotel / vendor (optional)"
                value={v.paidTo}
                onChange={(e) => set("paidTo", e.target.value)}
              />
            </Field>
            <Field label="Paid by (mode)" htmlFor="ex-mode">
              <select
                className="sel"
                id="ex-mode"
                value={v.mode}
                onChange={(e) => set("mode", e.target.value)}
              >
                <Options list={EXPENSE_MODES} blank="Not specified" />
              </select>
            </Field>
            <Field label="Reference" htmlFor="ex-ref">
              <input
                className="in"
                id="ex-ref"
                placeholder="UPI / bill no. (optional)"
                value={v.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </Field>
            <Field label="School (optional)" htmlFor="ex-rel">
              <select
                className="sel"
                id="ex-rel"
                value={v.related}
                onChange={(e) => set("related", e.target.value)}
              >
                <Options
                  list={targets.map((t) => [t.value, t.label] as const)}
                  blank="Not for one school"
                />
              </select>
            </Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

const TONE: Record<string, Tone> = {
  SUBMITTED: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
};

/** One expense as a card; Accounts get Approve / Reject on waiting ones. */
export function ExpenseCard({
  e,
  me,
  accounts,
  showPerson,
  canApprove = false,
}: {
  e: ExpenseRow;
  me: string;
  accounts: boolean;
  showPerson: boolean;
  /** The Director (or Admin while there is no Director login) approves (R38). */
  canApprove?: boolean;
}) {
  const { pending, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const mine = e.user?.id === me || e.enteredBy.id === me;
  const canDelete =
    !e.reimbursedOn && (accounts || (mine && e.status !== "APPROVED"));
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <b
            className={`text-[16px] ${e.status === "REJECTED" ? "text-coral line-through" : ""}`}
          >
            {money(e.amount)}
          </b>{" "}
          <Pill tone={TONE[e.status]}>{EXPENSE_STATUS_LABEL[e.status]}</Pill>{" "}
          {e.paidBy === "OWN" && e.status === "APPROVED" ? (
            <Pill tone={e.reimbursedOn ? "mute" : "info"}>
              {e.reimbursedOn
                ? `Paid back ${dmy(e.reimbursedOn)}`
                : "To be paid back"}
            </Pill>
          ) : null}
          <div className="mt-0.5 font-semibold">{e.category}</div>
        </div>
        <span className="tag whitespace-nowrap">{expenseCode(e.number)}</span>
      </div>
      <div className="mt-0.5">{e.description}</div>
      <div className="small muted mt-0.5">
        {dmy(e.date)}
        {e.city ? ` · ${e.city}` : ""}
        {e.paidTo ? ` · ${e.paidTo}` : ""} · {EXPENSE_PAID_BY_SHORT[e.paidBy]}
        {e.mode ? ` · ${e.mode}` : ""}
        {e.reference ? ` · ${e.reference}` : ""}
      </div>
      {showPerson ? (
        <div className="small muted">
          {e.user ? e.user.name : "Company"}
          {e.enteredBy.id !== e.user?.id
            ? ` · entered by ${e.enteredBy.name}`
            : ""}
        </div>
      ) : null}
      {e.school ? (
        <div className="small">
          For <Link href={e.school.href}>{e.school.label}</Link>
        </div>
      ) : null}
      {e.noBillReason ? (
        <div className="small mt-1 rounded-lg bg-surf2 px-2 py-1">
          <b>No bill:</b> {e.noBillReason}
        </div>
      ) : null}
      {e.status === "REJECTED" && e.rejectReason ? (
        <div className="small text-coral">Rejected: {e.rejectReason}</div>
      ) : null}
      {e.reimburseRef ? (
        <div className="small muted">Paid back ref. {e.reimburseRef}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {e.files.map((f, i) => (
          <a
            key={f.id}
            className="btn sm"
            href={`/api/expenses/files/${f.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="doc" size={14} /> Bill
            {e.files.length > 1 ? ` ${i + 1}` : ""}
          </a>
        ))}
        {!e.files.length && !e.noBillReason ? (
          <span className="small faint self-center">No bill attached</span>
        ) : null}
        {canApprove && e.status === "SUBMITTED" ? (
          <>
            <button
              className="btn sm pri"
              disabled={pending}
              onClick={() =>
                run(() => approveExpense(e.id), {
                  success: "Expense approved.",
                })
              }
            >
              <Icon name="check" size={14} /> Approve
            </button>
            <button
              className="btn sm bad"
              disabled={pending}
              onClick={() => setRejecting(true)}
            >
              Reject
            </button>
          </>
        ) : null}
        {canDelete ? (
          <button
            className="btn sm ghost"
            disabled={pending}
            onClick={() =>
              confirm(
                `Delete expense ${expenseCode(e.number)} (${money(e.amount)})?`,
              ) &&
              run(() => deleteExpense(e.id), { success: "Expense deleted." })
            }
          >
            Delete
          </button>
        ) : null}
      </div>
      {rejecting ? (
        <Modal
          title={`Reject ${expenseCode(e.number)} (${money(e.amount)})?`}
          sub={`${e.user?.name ?? "Company"} gets a to-do with your reason.`}
          onClose={() => setRejecting(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRejecting(false)}>
                Cancel
              </button>
              <button
                className="btn bad"
                disabled={pending}
                onClick={() =>
                  run(() => rejectExpense(e.id, { reason }), {
                    success: "Expense rejected.",
                    onDone: () => setRejecting(false),
                  })
                }
              >
                Reject expense
              </button>
            </>
          }
        >
          <Field label="Reason *" htmlFor={`rx-${e.id}`}>
            <textarea
              className="ta"
              id={`rx-${e.id}`}
              rows={3}
              placeholder="e.g. Bill photo not readable; not a business expense"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
            />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

/** Status filter chips (?status=). */
export function ExpenseFilters({ accounts }: { accounts: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const status = sp.get("status") ?? "";
  const chips: [string, string][] = [
    ["", "All"],
    ["waiting", "Waiting"],
    ["approved", "Approved"],
    ["topay", accounts ? "To pay back" : "To be paid back"],
    ["rejected", "Rejected"],
  ];
  return (
    <div className="chips" role="group" aria-label="Status">
      {chips.map(([k, l]) => (
        <button
          key={k}
          className={`chip ${status === k ? "on" : ""}`}
          onClick={() => {
            const next = new URLSearchParams(sp);
            if (k) next.set("status", k);
            else next.delete("status");
            router.replace(`${path}${next.size ? `?${next}` : ""}`, {
              scroll: false,
            });
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
