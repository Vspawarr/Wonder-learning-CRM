// Every exportable report, built with the same filters and access rules as its screen.
import {
  CLIENT_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
  clientCode,
  leadCode,
  oppCode,
} from "@/lib/constants";
import { daysFrom, istDate, todayIST } from "@/lib/dates";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { salesDashboard } from "../dashboard";
import { NotFoundError } from "../errors";
import { INVOICE_STATE_LABEL } from "../finance/money";
import { clientLedger, ledgerSummary, resolvePeriod } from "../finance/ledger";
import { collectionsSummary, outstandingList } from "../finance/service";
import { clientsList, leadsList, pipelineCards, taskList, type TaskKind } from "../queries";
import type { Report } from "./types";

type Params = Record<string, string | undefined>;
const dmy = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "");
const PRIORITY: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
const time12 = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const filtersLine = (parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(" · ") || undefined;

async function leads(user: SessionUser, p: Params): Promise<Report> {
  const rows = await leadsList(user, { q: p.q, status: p.status, src: p.src });
  return {
    title: "Leads",
    subtitle: filtersLine([`Status: ${p.status ?? "Active"}`, p.src && `Source: ${p.src}`, p.q && `Search: "${p.q}"`, !seesAllSales(user.role) && "My leads only"]),
    sections: [
      {
        columns: [
          { key: "no", header: "Lead", width: 0.7 },
          { key: "school", header: "School", width: 2 },
          { key: "contact", header: "Contact", width: 1.3 },
          { key: "mobile", header: "Mobile", width: 1.1 },
          { key: "city", header: "City", width: 1 },
          { key: "source", header: "Source", width: 1.1 },
          { key: "status", header: "Status", width: 0.9 },
          { key: "owner", header: "Owner", width: 1.2 },
          { key: "next", header: "Next follow-up", width: 1 },
        ],
        rows: rows.map((l) => ({
          no: leadCode(l.number),
          school: l.schoolName,
          contact: l.contactName,
          mobile: l.mobile,
          city: l.city,
          source: l.source,
          status: LEAD_STATUS_LABEL[l.status],
          owner: l.owner.name,
          next: dmy(l.nextFollowUpDate),
        })),
        empty: "No leads match these filters.",
      },
    ],
  };
}

async function opportunities(user: SessionUser, p: Params): Promise<Report> {
  const stage = p.stage ?? "Open";
  const rows = await pipelineCards(user, { q: p.q, stage: stage === "All" ? undefined : stage, owner: p.owner, cat: p.cat });
  const total = rows.reduce((s, o) => s + o.value, 0);
  return {
    title: "Opportunities",
    subtitle: filtersLine([`Stage: ${STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}`, p.cat && `Category: ${TEMPERATURE_LABEL[p.cat as "HOT"] ?? p.cat}`, p.q && `Search: "${p.q}"`]),
    sections: [
      {
        columns: [
          { key: "no", header: "Opp.", width: 0.6 },
          { key: "school", header: "School", width: 2 },
          { key: "contact", header: "Contact", width: 1.2 },
          { key: "city", header: "City", width: 0.9 },
          { key: "stage", header: "Stage", width: 1 },
          { key: "cat", header: "Category", width: 0.7 },
          { key: "value", header: "Value", kind: "money" },
          { key: "chance", header: "Chance %", kind: "number", width: 0.6 },
          { key: "close", header: "Expected close", width: 0.9 },
          { key: "next", header: "Next action", width: 1.5 },
          { key: "owner", header: "Owner", width: 1.1 },
        ],
        rows: rows.map((o) => ({
          no: oppCode(o.number),
          school: o.schoolName,
          contact: o.contactName,
          city: o.city,
          stage: STAGE_LABEL[o.stage],
          cat: TEMPERATURE_LABEL[o.temperature],
          value: o.noValue ? null : o.value,
          chance: o.probability,
          close: dmy(o.expectedCloseDate),
          next: [o.nextAction, dmy(o.nextActionDate)].filter(Boolean).join(" · "),
          owner: o.owner.name,
        })),
        totals: { school: `${rows.length} opportunities`, value: total },
        empty: "No opportunities match these filters.",
      },
    ],
  };
}

async function clients(user: SessionUser, p: Params): Promise<Report> {
  const rows = await clientsList(user, { q: p.q, status: p.status });
  return {
    title: "Clients",
    subtitle: filtersLine([p.status && `Status: ${CLIENT_STATUS_LABEL[p.status as "ACTIVE"] ?? p.status}`, p.q && `Search: "${p.q}"`]),
    landscape: false,
    sections: [
      {
        columns: [
          { key: "no", header: "Client", width: 0.6 },
          { key: "school", header: "School", width: 2 },
          { key: "contact", header: "Contact", width: 1.2 },
          { key: "mobile", header: "Mobile", width: 1 },
          { key: "city", header: "City", width: 0.9 },
          { key: "status", header: "Status", width: 0.8 },
          { key: "since", header: "Since", width: 0.8 },
          { key: "owner", header: "Owner", width: 1 },
        ],
        rows: rows.map((c) => ({
          no: clientCode(c.number),
          school: c.schoolName,
          contact: c.contactName,
          mobile: c.mobile,
          city: c.city,
          status: CLIENT_STATUS_LABEL[c.status],
          since: dmy(istDate(c.since)),
          owner: c.owner.name,
        })),
        empty: "No clients match these filters.",
      },
    ],
  };
}

async function outstanding(user: SessionUser, p: Params): Promise<Report> {
  const { shown, summary } = await outstandingList(user, p);
  const sum = (k: "total" | "paid" | "balance") => shown.reduce((s, r) => s + r[k], 0);
  const show = { overdue: "Overdue", paid: "Paid", all: "All invoices" }[p.show ?? ""] ?? "To collect";
  return {
    title: "Outstanding",
    subtitle: filtersLine([`Showing: ${show}`, p.q && `Search: "${p.q}"`]),
    sections: [
      {
        heading: "Summary",
        columns: [
          { key: "k", header: "", width: 2 },
          { key: "v", header: "Amount", kind: "money" },
        ],
        rows: [
          { k: "Invoiced", v: summary.invoiced },
          { k: "Received", v: summary.received },
          { k: "Outstanding", v: summary.outstanding },
          { k: `Overdue (${summary.overdueCount} invoices)`, v: summary.overdue },
        ],
      },
      {
        heading: "Invoices",
        columns: [
          { key: "inv", header: "Invoice", width: 1.2 },
          { key: "date", header: "Date", width: 0.8 },
          { key: "school", header: "School", width: 2 },
          { key: "po", header: "PO No.", width: 0.9 },
          { key: "due", header: "Due", width: 0.8 },
          { key: "total", header: "Total", kind: "money" },
          { key: "paid", header: "Received", kind: "money" },
          { key: "balance", header: "Balance", kind: "money" },
          { key: "state", header: "Status", width: 1.1 },
          { key: "owner", header: "Owner", width: 1 },
        ],
        rows: shown.map((r) => ({
          inv: r.number,
          date: dmy(r.date),
          school: r.client.schoolName,
          po: r.salesOrder.poNumber,
          due: dmy(r.dueDate),
          total: r.total,
          paid: r.paid,
          balance: r.balance,
          state: r.state === "OVERDUE" ? `Overdue ${r.daysOverdue} days` : INVOICE_STATE_LABEL[r.state],
          owner: r.client.owner.name,
        })),
        totals: { inv: `${shown.length} invoices`, total: sum("total"), paid: sum("paid"), balance: sum("balance") },
        empty: "No invoices match these filters.",
      },
    ],
  };
}

async function ledger(user: SessionUser, p: Params): Promise<Report> {
  const period = resolvePeriod(p);
  if (p.client) {
    const l = await clientLedger(user, p.client, period);
    return {
      title: `Ledger – ${l.client.schoolName}`,
      subtitle: `${clientCode(l.client.number)} · ${l.client.city} · ${period.label} (${dmy(period.from)} – ${dmy(period.to)})`,
      sections: [
        {
          columns: [
            { key: "date", header: "Date", width: 0.8 },
            { key: "ref", header: "Ref. No.", width: 1.2 },
            { key: "part", header: "Particulars", width: 3 },
            { key: "debit", header: "Debit (invoiced)", kind: "money" },
            { key: "credit", header: "Credit (received)", kind: "money" },
            { key: "bal", header: "Balance", kind: "money" },
          ],
          rows: [
            { date: dmy(period.from), part: "Opening balance", bal: l.opening },
            ...l.entries.map((e) => ({ date: dmy(e.date), ref: e.ref, part: e.particulars, debit: e.debit || null, credit: e.credit || null, bal: e.balance })),
          ],
          totals: { part: "Closing balance", debit: l.debit, credit: l.credit, bal: l.closing },
        },
      ],
    };
  }
  const s = await ledgerSummary(user, period, { owner: p.owner });
  return {
    title: "Ledger – all clients",
    subtitle: `${period.label} (${dmy(period.from)} – ${dmy(period.to)})`,
    sections: [
      {
        columns: [
          { key: "no", header: "Client", width: 0.6 },
          { key: "school", header: "School", width: 2 },
          { key: "city", header: "City", width: 0.9 },
          { key: "owner", header: "Owner", width: 1 },
          { key: "opening", header: "Opening", kind: "money" },
          { key: "debit", header: "Invoiced", kind: "money" },
          { key: "credit", header: "Received", kind: "money" },
          { key: "closing", header: "Closing", kind: "money" },
        ],
        rows: s.rows.map((r) => ({
          no: clientCode(r.number),
          school: r.schoolName,
          city: r.city,
          owner: r.owner,
          opening: r.opening,
          debit: r.debit,
          credit: r.credit,
          closing: r.closing,
        })),
        totals: { school: "Total", ...s.totals },
        empty: "No invoices or payments in this period.",
      },
    ],
  };
}

async function todo(user: SessionUser, p: Params): Promise<Report> {
  const team = seesAllSales(user.role) && p.team === "1";
  const kind: TaskKind = p.kind === "todos" || p.kind === "followups" ? p.kind : "all";
  const { open } = await taskList(user, team, kind);
  const today = todayIST();
  const when = (d: string) => (daysFrom(d, today) < 0 ? "Overdue" : daysFrom(d, today) === 0 ? "Today" : "Upcoming");
  return {
    title: "To-do",
    subtitle: filtersLine([team ? "Whole team" : `For ${user.name}`, kind === "todos" ? "Own to-dos" : kind === "followups" ? "School follow-ups" : "Everything"]),
    sections: [
      {
        columns: [
          { key: "when", header: "When", width: 0.7 },
          { key: "date", header: "Date", width: 0.8 },
          { key: "time", header: "Time", width: 0.6 },
          { key: "type", header: "Type", width: 1.1 },
          { key: "title", header: "Task", width: 2.6 },
          { key: "related", header: "Related to", width: 1.6 },
          { key: "prio", header: "Priority", width: 0.7 },
          { key: "post", header: "Postponed", kind: "number", width: 0.7 },
          { key: "who", header: "Assigned to", width: 1.1 },
        ],
        rows: open.map((t) => ({
          when: when(t.dueDate),
          date: dmy(t.dueDate),
          time: time12(t.dueTime),
          type: t.type,
          title: t.title,
          related: t.related?.label ?? "",
          prio: PRIORITY[t.priority],
          post: t.postponedCount || null,
          who: t.assignee.name,
        })),
        empty: "Nothing open.",
      },
    ],
  };
}

async function dashboard(user: SessionUser, p: Params): Promise<Report> {
  const all = seesAllSales(user.role);
  const f = { period: p.period, from: p.from, to: p.to, exec: all ? p.exec : undefined, state: p.state } as Parameters<typeof salesDashboard>[1];
  const d = await salesDashboard(user, f);
  const cash = await collectionsSummary(user, { exec: f.exec, state: f.state }, d.range.from, d.range.to);
  const k = d.kpis;
  return {
    title: "Sales dashboard",
    subtitle: filtersLine([`${dmy(d.range.from)} – ${dmy(d.range.to)}`, all ? (f.exec ? "One salesperson" : "Whole team") : `For ${user.name}`, f.state && `State: ${f.state}`]),
    sections: [
      {
        heading: "Key numbers",
        columns: [
          { key: "k", header: "Measure", width: 2 },
          { key: "v", header: "Value", kind: "number" },
          { key: "m", header: "Amount", kind: "money" },
        ],
        rows: [
          { k: "Leads created", v: k.leads },
          { k: "Hot opportunities (open)", v: k.hot },
          { k: "Leads converted", v: k.converted },
          { k: "Open pipeline", v: k.openCount, m: k.openValue },
          { k: "Weighted forecast", m: k.weighted },
          { k: "Won", v: k.wonCount, m: k.wonValue },
          { k: "Lost", v: k.lostCount, m: k.lostValue },
          { k: "Win rate %", v: k.winRate },
          { k: "Collected", v: cash.collectedCount, m: cash.collected },
          { k: "Outstanding", m: cash.outstanding },
          { k: "Overdue", v: cash.overdueCount, m: cash.overdue },
        ],
      },
      {
        heading: "Pipeline by stage",
        columns: [
          { key: "s", header: "Stage", width: 2 },
          { key: "c", header: "Deals", kind: "number" },
          { key: "v", header: "Value", kind: "money" },
        ],
        rows: d.byStage.map((b) => ({ s: STAGE_LABEL[b.stage], c: b.count, v: b.value })),
      },
      {
        heading: "Lead sources",
        columns: [
          { key: "s", header: "Source", width: 2 },
          { key: "l", header: "Leads", kind: "number" },
          { key: "c", header: "Converted", kind: "number" },
        ],
        rows: d.sources.map((s) => ({ s: s.source, l: s.leads, c: s.converted })),
        empty: "No leads in this period.",
      },
      {
        heading: all ? "Team" : "My numbers",
        columns: [
          { key: "n", header: "Name", width: 2 },
          { key: "l", header: "Leads", kind: "number" },
          { key: "i", header: "Interactions", kind: "number" },
          { key: "o", header: "Open pipeline", kind: "money" },
          { key: "w", header: "Won", kind: "money" },
        ],
        rows: d.team.map((t) => ({ n: t.name, l: t.leads, i: t.interactions, o: t.open, w: t.won })),
      },
      {
        heading: "Lost reasons",
        columns: [
          { key: "r", header: "Reason", width: 2 },
          { key: "n", header: "Deals", kind: "number" },
        ],
        rows: d.lostReasons.map((r) => ({ r: r.label, n: r.value })),
        empty: "No lost deals in this period.",
      },
    ],
  };
}

export const REPORTS = { leads, opportunities, clients, outstanding, ledger, todo, dashboard } as const;
export type ReportName = keyof typeof REPORTS;

export async function buildReport(user: SessionUser, name: string, params: Params): Promise<Report> {
  const fn = REPORTS[name as ReportName];
  if (!fn) throw new NotFoundError("Report");
  return fn(user, params);
}
