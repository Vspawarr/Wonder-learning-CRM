// Every exportable report, built with the same filters and access rules as its screen.
import { CLIENT_STATUS_LABEL, LEAD_STATUS_LABEL, STAGE_LABEL, TEMPERATURE_LABEL, clientCode, leadCode, oppCode } from "@/lib/constants";
import { daysFrom, istDate, todayIST } from "@/lib/dates";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { salesDashboard, serviceSummary } from "../dashboard";
import { NotFoundError } from "../errors";
import { INVOICE_STATE_LABEL } from "../finance/money";
import { clientLedger, ledgerSummary, resolvePeriod } from "../finance/ledger";
import { approvalQueue, collectionsSummary, outstandingList } from "../finance/service";
import { YEAR_FILTERS, YEAR_STANDING_LABEL, clientsList, leadsList, pipelineCards, taskList, type TaskKind } from "../queries";
import type { Cell, Report } from "./types";
import { financialYear, fyLabel, fyRange, parseYearCookie } from "@/lib/fy";
import { yearAnchor } from "../year";
import { getFeatures } from "../features";
import { renewalCandidates } from "../renewals";
import { targetProgress } from "../targets";
import { DASH_SECTIONS, parseSections, type DashSection } from "@/lib/dashboard-sections";

type Params = Record<string, string | undefined>;

/** The financial year chosen after login (the export route passes ?fy=); undefined = All years (R31). */
function yearOf(p: Params) {
  if (p.fy === undefined) return undefined;
  const y = parseYearCookie(p.fy || undefined, todayIST());
  return y === null ? undefined : fyRange(y);
}
/** "FY 2026-27" / "All years" for the subtitle (nothing when no year was passed, e.g. in tests). */
function yearLine(p: Params) {
  if (p.fy === undefined) return undefined;
  const y = yearOf(p);
  return y ? `FY ${fyLabel(financialYear(y.from).start)}` : "All years";
}
const dmy = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "");
const PRIORITY: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
const time12 = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const filtersLine = (parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(" · ") || undefined;
/** "Added 01/10/2026 – 31/10/2026" for the custom date filter, or nothing. */
const rangeLine = (label: string, p: Params) =>
  p.from || p.to ? `${label} ${p.from ? dmy(p.from) : "…"} – ${p.to ? dmy(p.to) : "…"}` : undefined;

async function leads(user: SessionUser, p: Params): Promise<Report> {
  const rows = await leadsList(user, { q: p.q, status: p.status, src: p.src, sort: p.sort, from: p.from, to: p.to, year: yearOf(p) });
  return {
    title: "Leads",
    subtitle: filtersLine([
      yearLine(p),
      `Status: ${p.status || "All"}`,
      p.src && `Source: ${p.src}`,
      rangeLine("Added", p),
      p.q && `Search: "${p.q}"`,
      !seesAllSales(user.role) && "My leads only",
    ]),
    sections: [
      {
        columns: [
          { key: "no", header: "Lead", width: 0.7 },
          { key: "added", header: "Added", width: 1.3 },
          { key: "school", header: "School", width: 2 },
          { key: "contact", header: "Contact", width: 1.3 },
          { key: "mobile", header: "Mobile", width: 1.1 },
          { key: "city", header: "City", width: 1 },
          { key: "source", header: "Source", width: 1.1 },
          { key: "status", header: "Status", width: 0.9 },
          { key: "owner", header: "Assigned to", width: 1.2 },
          { key: "next", header: "Next follow-up", width: 1 },
        ],
        rows: rows.map((l) => ({
          no: leadCode(l.number),
          added: l.createdAt,
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
  const stage = p.stage || "All";
  const rows = await pipelineCards(user, {
    q: p.q,
    stage: stage === "All" ? undefined : stage,
    owner: p.owner,
    cat: p.cat,
    from: p.from,
    to: p.to,
    year: yearOf(p),
  });
  const total = rows.reduce((s, o) => s + o.value, 0);
  return {
    title: "Opportunities",
    subtitle: filtersLine([
      yearLine(p),
      `Stage: ${STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}`,
      p.cat && `Category: ${TEMPERATURE_LABEL[p.cat as "HOT"] ?? p.cat}`,
      rangeLine("Added", p),
      p.q && `Search: "${p.q}"`,
    ]),
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
          { key: "owner", header: "Assigned to", width: 1.1 },
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
  const year = yearOf(p);
  const rows = await clientsList(user, { q: p.q, status: p.status, from: p.from, to: p.to, year, yr: p.yr });
  const yl = year ? fyLabel(financialYear(year.from).start) : null;
  return {
    title: "Clients",
    subtitle: filtersLine([
      yearLine(p),
      p.status && `Status: ${CLIENT_STATUS_LABEL[p.status as "ACTIVE"] ?? p.status}`,
      yl && p.yr && YEAR_FILTERS[p.yr] && `In ${yl}: ${{ ordered: "Ordered", renewed: "Renewed", new: "New", notrenewed: "Not renewed", none: "No order" }[p.yr]}`,
      p.q && `Search: "${p.q}"`,
      rangeLine("Client since", p),
    ]),
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
          { key: "year", header: yl ? `In ${yl}` : "Last order", width: 1 },
          { key: "since", header: "Since", width: 0.8 },
          { key: "owner", header: "Assigned to", width: 1 },
        ],
        rows: rows.map((c) => ({
          no: clientCode(c.number),
          school: c.schoolName,
          contact: c.contactName,
          mobile: c.mobile,
          city: c.city,
          status: CLIENT_STATUS_LABEL[c.status],
          year: c.standing
            ? `${YEAR_STANDING_LABEL[c.standing]}${c.yearAmount ? ` · ₹${c.yearAmount.toLocaleString("en-IN")}` : c.lastOrdered ? ` · last ${c.lastOrdered}` : ""}`
            : c.lastOrdered ?? "None",
          since: dmy(istDate(c.since)),
          owner: c.owner.name,
        })),
        empty: "No clients match these filters.",
      },
    ],
  };
}

async function outstanding(user: SessionUser, p: Params): Promise<Report> {
  const { shown, summary, ageing, forecast } = await outstandingList(user, { ...p, year: yearOf(p) });
  const sum = (k: "total" | "paid" | "balance") => shown.reduce((s, r) => s + r[k], 0);
  const show = { overdue: "Overdue", paid: "Paid", all: "All invoices" }[p.show ?? ""] ?? "To collect";
  return {
    title: "Outstanding",
    subtitle: filtersLine([yearLine(p), `Showing: ${show}`, p.q && `Search: "${p.q}"`, rangeLine("Invoice date", p)]),
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
          {
            k: `Overdue (${summary.overdueCount} invoices)`,
            v: summary.overdue,
          },
        ],
      },
      {
        heading: "How late is the money?",
        columns: [
          { key: "k", header: "", width: 2 },
          { key: "n", header: "Invoices", kind: "number" },
          { key: "v", header: "Amount", kind: "money" },
        ],
        rows: ageing.map((b) => ({ k: b.label, n: b.count, v: b.amount })),
      },
      {
        heading: "Expected collections",
        columns: [
          { key: "k", header: "", width: 2 },
          { key: "n", header: "Invoices", kind: "number" },
          { key: "v", header: "Amount", kind: "money" },
        ],
        rows: [
          ...forecast.buckets.map((b) => ({
            k: b.label,
            n: b.count,
            v: b.amount,
          })),
          { k: "Cheques awaiting clearance", v: forecast.chequesPending },
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
          { key: "owner", header: "Assigned to", width: 1 },
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
        totals: {
          inv: `${shown.length} invoices`,
          total: sum("total"),
          paid: sum("paid"),
          balance: sum("balance"),
        },
        empty: "No invoices match these filters.",
      },
    ],
  };
}

async function ledger(user: SessionUser, p: Params): Promise<Report> {
  const period = resolvePeriod(p, yearAnchor(yearOf(p)));
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
            ...l.entries.map((e) => ({
              date: dmy(e.date),
              ref: e.ref,
              part: e.particulars,
              debit: e.debit || null,
              credit: e.credit || null,
              bal: e.balance,
            })),
          ],
          totals: {
            part: "Closing balance",
            debit: l.debit,
            credit: l.credit,
            bal: l.closing,
          },
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
          { key: "owner", header: "Assigned to", width: 1 },
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
  const { open } = await taskList(user, team, kind, { from: p.from, to: p.to });
  const today = todayIST();
  const when = (d: string) => (daysFrom(d, today) < 0 ? "Overdue" : daysFrom(d, today) === 0 ? "Today" : "Upcoming");
  return {
    title: "To-do",
    subtitle: filtersLine([
      team ? "Whole team" : `For ${user.name}`,
      kind === "todos" ? "Own to-dos" : kind === "followups" ? "School follow-ups" : "Everything",
      rangeLine("Due", p),
    ]),
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
  const f = {
    period: p.period,
    from: p.from,
    to: p.to,
    exec: all ? p.exec : undefined,
    state: p.state,
    year: yearOf(p),
  } as Parameters<typeof salesDashboard>[1];
  // Same sections as on screen (?show=…; the export route fills in the remembered choice).
  const shown = parseSections(p.show);
  const has = (k: DashSection) => shown.includes(k);
  const features = await getFeatures();
  const d = await salesDashboard(user, f);
  const k = d.kpis;
  const range = `${dmy(d.range.from)} – ${dmy(d.range.to)}`;
  const sections: Report["sections"] = [];
  const numbers = (heading: string, rows: { k: string; v?: Cell; m?: Cell }[]) =>
    sections.push({
      heading,
      columns: [
        { key: "k", header: "Measure", width: 2 },
        { key: "v", header: "Count", kind: "number" },
        { key: "m", header: "Amount", kind: "money" },
      ],
      rows,
    });

  if (has("sales")) {
    numbers(`Sales · ${range}`, [
      { k: "Leads created", v: k.leads },
      { k: "Hot opportunities (open)", v: k.hot },
      { k: "Leads converted", v: k.converted },
      { k: "Open pipeline", v: k.openCount, m: k.openValue },
      { k: "Weighted forecast", m: k.weighted },
      { k: "Won", v: k.wonCount, m: k.wonValue },
    ]);
    sections.push({
      heading: "Pipeline by stage",
      columns: [
        { key: "s", header: "Stage", width: 2 },
        { key: "c", header: "Deals", kind: "number" },
        { key: "v", header: "Value", kind: "money" },
      ],
      rows: d.byStage.map((b) => ({ s: STAGE_LABEL[b.stage], c: b.count, v: b.value })),
    });
    sections.push({
      heading: "Lead sources",
      columns: [
        { key: "s", header: "Source", width: 2 },
        { key: "l", header: "Leads", kind: "number" },
        { key: "c", header: "Converted", kind: "number" },
      ],
      rows: d.sources.map((s) => ({ s: s.source, l: s.leads, c: s.converted })),
      empty: "No leads in this period.",
    });
    sections.push({
      heading: "Biggest open deals",
      columns: [
        { key: "s", header: "School", width: 2 },
        { key: "st", header: "Stage", width: 1.2 },
        { key: "p", header: "Chance %", kind: "number" },
        { key: "v", header: "Value", kind: "money" },
      ],
      rows: d.biggest.map((o) => ({ s: o.school, st: STAGE_LABEL[o.stage], p: o.probability, v: o.value })),
      empty: "No open deals.",
    });
  }

  if (has("finance")) {
    const cash = await collectionsSummary(user, { exec: f.exec, state: f.state }, d.range.from, d.range.to);
    const owed = await outstandingList(user, { owner: f.exec, year: f.year });
    numbers(`Finance · collected ${range}, owed as of today`, [
      { k: "Collected", v: cash.collectedCount, m: cash.collected },
      { k: "Outstanding", m: cash.outstanding },
      { k: "Overdue", v: cash.overdueCount, m: cash.overdue },
      { k: "Cheques not cleared", m: owed.forecast.chequesPending },
      { k: "Waiting for Accounts approval", m: cash.awaiting },
    ]);
    sections.push({
      heading: "How late is the money owed",
      columns: [
        { key: "k", header: "Age", width: 2 },
        { key: "n", header: "Invoices", kind: "number" },
        { key: "v", header: "Amount", kind: "money" },
      ],
      rows: owed.ageing.map((a) => ({ k: a.label, n: a.count, v: a.amount })),
    });
    sections.push({
      heading: "Expected collections",
      columns: [
        { key: "k", header: "When", width: 2 },
        { key: "n", header: "Invoices", kind: "number" },
        { key: "v", header: "Amount", kind: "money" },
      ],
      rows: owed.forecast.buckets.map((b) => ({ k: b.label, n: b.count, v: b.amount })),
    });
  }

  if (has("team")) {
    numbers(`Team & management · ${range}`, [
      { k: "Win rate %", v: k.winRate },
      { k: "Lost", v: k.lostCount, m: k.lostValue },
      { k: "Interactions logged", v: d.team.reduce((t, r) => t + r.interactions, 0) },
    ]);
    sections.push({
      heading: all ? "Sales team" : "My numbers",
      columns: [
        { key: "n", header: "Name", width: 2 },
        { key: "l", header: "Leads", kind: "number" },
        { key: "i", header: "Interactions", kind: "number" },
        { key: "o", header: "Open pipeline", kind: "money" },
        { key: "w", header: "Won", kind: "money" },
      ],
      rows: d.team.map((t) => ({ n: t.name, l: t.leads, i: t.interactions, o: t.open, w: t.won })),
    });
    if (features.targets) {
      const t = await targetProgress(user);
      const rows = t.rows.filter((r) => r.salesTarget || r.collectionTarget);
      if (rows.length)
        sections.push({
          heading: `Targets · ${t.month}`,
          columns: [
            { key: "n", header: "Name", width: 2 },
            { key: "st", header: "Sales target", kind: "money" },
            { key: "s", header: "Sales", kind: "money" },
            { key: "ct", header: "Collection target", kind: "money" },
            { key: "c", header: "Collected", kind: "money" },
          ],
          rows: rows.map((r) => ({ n: r.name, st: r.salesTarget, s: r.sales, ct: r.collectionTarget, c: r.collection })),
        });
    }
    sections.push({
      heading: "Why deals were lost",
      columns: [
        { key: "r", header: "Reason", width: 2 },
        { key: "n", header: "Deals", kind: "number" },
      ],
      rows: d.lostReasons.map((r) => ({ r: r.label, n: r.value })),
      empty: "No lost deals in this period.",
    });
    sections.push({
      heading: "Competitors met",
      columns: [
        { key: "r", header: "Competitor", width: 2 },
        { key: "n", header: "Deals", kind: "number" },
      ],
      rows: d.competitors.map((r) => ({ r: r.label, n: r.value })),
      empty: "None recorded.",
    });
  }

  if (has("service")) {
    const svc = await serviceSummary(user, f);
    const renewals = features.renewals ? await renewalCandidates(user) : null;
    numbers("Service & delivery · as of today", [
      { k: "Follow-ups overdue", v: svc.tasks.overdue },
      { k: "Follow-ups due today", v: svc.tasks.dueToday },
      { k: "Follow-ups in the next 7 days", v: svc.tasks.nextWeek },
      { k: "Orders to deliver", v: svc.orders.length },
      ...(features.dispatch ? [{ k: "Kits in transit", v: svc.inTransit }] : []),
      { k: "Clients onboarding", v: svc.onboarding },
      ...(renewals ? [{ k: `Renewals due (FY ${renewals.ay.label})`, v: renewals.clients.length }] : []),
    ]);
    sections.push({
      heading: "Follow-ups due",
      columns: [
        { key: "d", header: "Due", width: 0.8 },
        { key: "t", header: "Follow-up", width: 2.4 },
        { key: "r", header: "Related to", width: 1.6 },
        { key: "a", header: "Assigned to", width: 1.1 },
      ],
      rows: d.due.map((t) => ({ d: dmy(t.dueDate), t: t.title, r: t.related?.label ?? "", a: t.assignee.name })),
      empty: "Nothing due.",
    });
    sections.push({
      heading: "Orders waiting for delivery",
      columns: [
        { key: "n", header: "Sales order", width: 1.2 },
        { key: "s", header: "School", width: 2.4 },
        { key: "d", header: "Order date", width: 0.9 },
      ],
      rows: svc.orders.map((o) => ({ n: o.number, s: o.client.schoolName, d: dmy(o.date) })),
      empty: "Every order has been delivered.",
    });
  }

  return {
    title: "Dashboard",
    subtitle: filtersLine([
      yearLine(p),
      range,
      all ? (f.exec ? "One salesperson" : "Whole team") : `For ${user.name}`,
      f.state && `State: ${f.state}`,
      shown.length < DASH_SECTIONS.length && `Sections: ${DASH_SECTIONS.filter(([key]) => has(key)).map(([, l]) => l).join(", ")}`,
    ]),
    sections,
  };
}

/** Accounts → Payment approvals (R36): what waits, and what was decided in the last 30 days. */
async function approvals(user: SessionUser): Promise<Report> {
  const { waiting, decided } = await approvalQueue(user);
  const base = [
    { key: "school", header: "School", width: 1.8 },
    { key: "against", header: "Against", width: 1.4 },
    { key: "amount", header: "Amount", width: 0.9, kind: "money" as const },
    { key: "date", header: "Paid on", width: 0.8 },
    { key: "mode", header: "Mode / ref.", width: 1.3 },
    { key: "by", header: "Recorded by", width: 1 },
  ];
  const row = (p: (typeof waiting)[number]) => ({
    school: p.client.schoolName,
    against: p.against,
    amount: p.amount,
    date: p.date.split("-").reverse().join("/"),
    mode: [p.mode, p.reference, p.bank].filter(Boolean).join(" · "),
    by: p.recordedBy,
  });
  return {
    title: "Payment approvals",
    subtitle: `${waiting.length} waiting · decided in the last 30 days: ${decided.length}`,
    landscape: true,
    sections: [
      {
        heading: "Waiting for approval",
        columns: base,
        rows: waiting.map(row),
        totals: { school: "Total", amount: waiting.reduce((t, p) => t + p.amount, 0) },
        empty: "Nothing waiting.",
      },
      {
        heading: "Decided in the last 30 days",
        columns: [...base, { key: "decision", header: "Decision", width: 0.8 }, { key: "receipt", header: "Receipt / reason", width: 1.4 }, { key: "decidedBy", header: "By", width: 0.9 }],
        rows: decided.map((p) => ({ ...row(p), decision: p.approval === "APPROVED" ? "Approved" : "Rejected", receipt: p.number ?? p.rejectReason ?? "", decidedBy: p.decidedBy ?? "" })),
        empty: "No decisions yet.",
      },
    ],
  };
}

export const REPORTS = {
  approvals,
  leads,
  opportunities,
  clients,
  outstanding,
  ledger,
  todo,
  dashboard,
} as const;
export type ReportName = keyof typeof REPORTS;

export async function buildReport(user: SessionUser, name: string, params: Params): Promise<Report> {
  const fn = REPORTS[name as ReportName];
  if (!fn) throw new NotFoundError("Report");
  return fn(user, params);
}
