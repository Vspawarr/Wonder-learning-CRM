"use client";

import { useSearchParams } from "next/navigation";
import { Icon } from "./icons";

/** "PDF" and "Excel" downloads of a report, with the screen's current filters. */
export function ExportButtons({ report, extra }: { report: string; extra?: Record<string, string> }) {
  const sp = useSearchParams();
  const href = (format: string) => {
    const q = new URLSearchParams(sp);
    q.delete("opp");
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    q.set("format", format);
    return `/api/export/${report}?${q}`;
  };
  return (
    <span className="inline-flex gap-1.5">
      <a className="btn sm" href={href("pdf")} download>
        <Icon name="download" size={14} /> PDF
      </a>
      <a className="btn sm" href={href("xlsx")} download>
        <Icon name="download" size={14} /> Excel
      </a>
    </span>
  );
}
