"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { Field, useAction } from "@/components/client";
import { resetQuotationSettings, saveQuotationSettings } from "@/app/actions";
import { sectionsToText, textToSections } from "@/lib/quotation-text";
import type { QuotationContent } from "@/server/quotation/content";

const toLines = (t: string) =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function QuotationSettingsForm({ initial }: { initial: QuotationContent }) {
  const fromContent = (c: QuotationContent) => ({
    defaultValidityDays: String(c.defaultValidityDays),
    footerLines: c.footerLines.join("\n"),
    quoteTerms: c.quoteTerms.join("\n"),
    kitLeft: sectionsToText(c.kitLeft),
    kitRight: sectionsToText(c.kitRight),
    terms: c.terms.join("\n"),
    payment: c.payment.join("\n"),
    notes: c.notes.join("\n"),
    closing: c.closing.join("\n"),
    company: c.company,
  });
  const [v, setV] = useState(() => fromContent(initial));
  const { pending, run } = useAction();
  const area = (key: keyof typeof v, label: string, help: string, rows = 5) => (
    <Field label={label} htmlFor={`qs-${key}`}>
      <textarea className="ta font-mono text-[13px]" rows={rows} id={`qs-${key}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
      <span className="small muted">{help}</span>
    </Field>
  );

  const save = () =>
    run(
      () =>
        saveQuotationSettings({
          defaultValidityDays: v.defaultValidityDays,
          footerLines: toLines(v.footerLines),
          quoteTerms: toLines(v.quoteTerms),
          kitLeft: textToSections(v.kitLeft),
          kitRight: textToSections(v.kitRight),
          terms: toLines(v.terms),
          payment: toLines(v.payment),
          notes: toLines(v.notes),
          closing: toLines(v.closing),
          company: v.company,
        }),
      { success: "Quotation text saved. Use “Preview sample PDF” to check it." },
    );

  return (
    <div className="flex flex-col gap-4">
      <Card title="Page 1 · Quotation">
        <div className="fg2">
          <Field label="Default validity (days)" htmlFor="qs-valid">
            <input className="in" id="qs-valid" type="number" min={1} value={v.defaultValidityDays} onChange={(e) => setV({ ...v, defaultValidityDays: e.target.value })} />
          </Field>
        </div>
        {area("quoteTerms", "Terms and Conditions box", "One term per line; they are numbered automatically.", 3)}
        {area("footerLines", "Footer address (also at the top of page 3)", "One line each, up to 6 lines.", 4)}
      </Card>
      <Card title="Page 2 · Kit Components & Services">
        <div className="grid grid-cols-1 gap-4 min-[901px]:grid-cols-2">
          {area("kitLeft", "Left column", "Start each heading with ## (e.g. ## Study Kit), then one item per line.", 18)}
          {area("kitRight", "Right column", "Start each heading with ## (e.g. ## Common Kit), then one item per line.", 18)}
        </div>
      </Card>
      <Card title="Page 3 · Terms & Conditions">
        {area("terms", "Terms & Conditions", "One point per line. Start a line with ! to print it in red. Put **two stars** around words to make them bold.", 6)}
        {area("payment", "Payment Schedules", "One step per line; they are numbered automatically.", 4)}
        {area("notes", "Note", "One note per line (printed small).", 6)}
        {area("closing", "Closing lines", "Printed before “Yours truly,”.", 2)}
        <Field label="Company line" htmlFor="qs-company">
          <input className="in" id="qs-company" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />
          <span className="small muted">Followed by the name and mobile number of the person who prepared the quotation.</span>
        </Field>
      </Card>
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-bg py-3">
        <button
          className="btn"
          disabled={pending}
          onClick={() =>
            confirm("Put back the original Wonder Learning quotation text? Your edits will be lost.") &&
            run(() => resetQuotationSettings(), { success: "Original text restored.", onDone: () => location.reload() })
          }
        >
          Restore original text
        </button>
        <button className="btn pri" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
