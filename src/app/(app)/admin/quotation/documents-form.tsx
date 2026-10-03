"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { Field, useAction } from "@/components/client";
import { saveDocumentSettings } from "@/app/actions";
import type { DocumentSettings } from "@/server/documents";

const toLines = (t: string) =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Settings for the PO template and payment receipt (the client's own formats), and starting numbers. */
export function DocumentSettingsForm({ initial, fy, used }: { initial: DocumentSettings; fy: string; used: { receipt: number; po: number } }) {
  const current = initial.numbering.fy === fy ? initial.numbering : { nextReceipt: null, nextPo: null };
  const [v, setV] = useState({
    sellerLines: initial.sellerLines.join("\n"),
    receiptLines: initial.receiptLines.join("\n"),
    signatory: initial.signatory,
    bankLines: initial.bankLines.join("\n"),
    poTerms: initial.poTerms.join("\n"),
    poCustomise: initial.poCustomise.join("\n"),
    poShippingTerms: initial.poShippingTerms,
    nextReceipt: current.nextReceipt ? String(current.nextReceipt) : "",
    nextPo: current.nextPo ? String(current.nextPo) : "",
  });
  const { pending, run } = useAction();
  const area = (key: keyof typeof v, label: string, help: string, rows = 4) => (
    <Field label={label} htmlFor={`ds-${key}`}>
      <textarea className="ta font-mono text-[13px]" rows={rows} id={`ds-${key}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
      <span className="small muted">{help}</span>
    </Field>
  );
  const save = () =>
    run(
      () =>
        saveDocumentSettings({
          sellerLines: toLines(v.sellerLines),
          receiptLines: toLines(v.receiptLines),
          signatory: v.signatory,
          bankLines: toLines(v.bankLines),
          poTerms: toLines(v.poTerms),
          poCustomise: toLines(v.poCustomise),
          poShippingTerms: v.poShippingTerms,
          numbering: { fy, nextReceipt: v.nextReceipt || null, nextPo: v.nextPo || null },
        }),
      { success: "Saved. New POs and receipts use these settings." },
    );

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Numbering · financial year ${fy}`}>
        <p className="small muted mb-3">
          To continue from your own receipt book and PO series, type the next number to use. The CRM never goes below a number it has
          already used, and starts again from 1 in each new financial year (April).
        </p>
        <div className="fg2">
          <Field label="Next receipt number" htmlFor="ds-rcpt">
            <input className="in" id="ds-rcpt" inputMode="numeric" placeholder={String(used.receipt + 1)} value={v.nextReceipt} onChange={(e) => setV({ ...v, nextReceipt: e.target.value })} />
            <span className="small muted">
              Prints as {v.nextReceipt || used.receipt + 1}/{fy.slice(2)}
              {used.receipt ? ` · last used ${used.receipt}` : ""}
            </span>
          </Field>
          <Field label="Next PO number" htmlFor="ds-po">
            <input className="in" id="ds-po" inputMode="numeric" placeholder={String(used.po + 1)} value={v.nextPo} onChange={(e) => setV({ ...v, nextPo: e.target.value })} />
            <span className="small muted">
              Prints as PO/{fy.slice(2, 4)}
              {fy.slice(5)}/{v.nextPo || used.po + 1}
              {used.po ? ` · last used ${used.po}` : ""}
            </span>
          </Field>
        </div>
      </Card>
      <Card title="Purchase order template">
        {area("sellerLines", "Seller address (under Wonder Learning India Pvt. Ltd)", "One line each.", 5)}
        {area("poTerms", "Terms and Conditions", "One per line; numbered automatically. Put **two stars** around words to make them bold.", 5)}
        {area("poCustomise", "Items to be customised with school name & logo", "One per line. Each PO marks them YES or NO.", 4)}
        {area("bankLines", "Account details", "One line each (account name, number, bank and branch, IFSC).", 4)}
        <Field label="Default shipping terms" htmlFor="ds-ship">
          <input className="in" id="ds-ship" value={v.poShippingTerms} onChange={(e) => setV({ ...v, poShippingTerms: e.target.value })} />
        </Field>
      </Card>
      <Card title="Payment receipt">
        {area("receiptLines", "Office address on receipts", "One line each, printed under the company name.", 2)}
        <Field label="Signatory (Authorized By)" htmlFor="ds-sign">
          <input className="in" id="ds-sign" value={v.signatory} onChange={(e) => setV({ ...v, signatory: e.target.value })} />
        </Field>
      </Card>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-bg py-3">
        <button className="btn pri" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
