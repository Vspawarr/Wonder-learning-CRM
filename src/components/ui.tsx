// Presentational building blocks shared by server and client components.
import Link from "next/link";
import { avatarColor, initials } from "@/lib/format";
import { daysFrom, fmtDate, todayIST, type DateStr } from "@/lib/dates";

export type Tone = "" | "ok" | "warn" | "bad" | "info" | "mute" | "grape";

const TONE: Record<string, Tone> = {
  New: "info",
  Contacted: "warn",
  Qualified: "",
  Converted: "ok",
  Disqualified: "mute",
  Hot: "bad",
  Warm: "warn",
  Cold: "info",
  Interested: "info",
  "Demo Scheduled": "grape",
  "Proposal Sent": "warn",
  Negotiation: "warn",
  Won: "ok",
  Lost: "bad",
  Critical: "bad",
  High: "warn",
  Active: "ok",
  Inactive: "mute",
  Auto: "mute",
};

export function Pill({ children, tone }: { children: string; tone?: Tone }) {
  return <span className={`pill ${tone ?? TONE[children] ?? ""}`}>{children}</span>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="mt-1 text-ink2">{sub}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2.5">{children}</div> : null}
    </div>
  );
}

export function Card({ title, children, className }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card ${className ?? ""}`}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub, color, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; href?: string }) {
  const style = { "--c": color ?? "var(--brand)" } as React.CSSProperties;
  const body = (
    <>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      <div className="s">{sub ?? " "}</div>
    </>
  );
  return href ? (
    <Link className="kpi" style={style} href={href}>
      {body}
    </Link>
  ) : (
    <div className="kpi" style={style}>
      {body}
    </div>
  );
}

export function Avatar({ id, name, size = 26 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className="av"
      title={name}
      style={{ width: size, height: size, background: avatarColor(id), fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarName({ id, name }: { id: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Avatar id={id} name={name} size={24} />
      <span>{name}</span>
    </span>
  );
}

/** Next follow-up style: overdue in coral, today in amber. */
export function FollowUp({ date, today = todayIST() }: { date: DateStr | null; today?: DateStr }) {
  if (!date) return <span className="faint">Not set</span>;
  const n = daysFrom(date, today);
  if (n < 0) return <span className="od">{fmtDate(date, today)} · overdue</span>;
  if (n === 0) return <span className="today">Today</span>;
  return <>{fmtDate(date, today)}</>;
}

/** Task due style: "3d overdue", "Today" or the date. */
export function DueTag({ date, today = todayIST() }: { date: DateStr; today?: DateStr }) {
  const n = daysFrom(date, today);
  if (n < 0) return <span className="od">{-n}d overdue</span>;
  if (n === 0) return <span className="today">Today</span>;
  return <>{fmtDate(date, today)}</>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export type Bar = { label: string; value: number; color?: string; href?: string };

export function HBars({ data, format }: { data: Bar[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {data.map((d) => {
        const row = (
          <>
            <span className="l" title={d.label}>
              {d.label}
            </span>
            <div className="tr">
              <div className="fi" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
            </div>
            <span className="v">{format ? format(d.value) : d.value}</span>
          </>
        );
        return d.href ? (
          <Link key={d.label} href={d.href} className="hb text-ink no-underline hover:[&_.l]:text-brand hover:[&_.l]:underline">
            {row}
          </Link>
        ) : (
          <div key={d.label} className="hb">
            {row}
          </div>
        );
      })}
    </div>
  );
}

export function VBars({ data }: { data: Bar[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="vb">
      {data.map((d) => (
        <div key={d.label} className="b">
          <span className="bv">{d.value}</span>
          <div className="bar" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color }} />
          <span className="bl">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Table({ head, children, empty }: { head: (string | [string, "num"])[]; children: React.ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {head.map((h) => {
              const [label, cls] = typeof h === "string" ? [h, ""] : h;
              return (
                <th key={label} className={cls}>
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows ? (
            children
          ) : (
            <tr>
              <td colSpan={head.length}>
                <Empty>{empty ?? "Nothing to show."}</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
