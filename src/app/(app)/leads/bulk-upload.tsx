"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal, useToast } from "@/components/client";
import { Icon } from "@/components/icons";

type Result = {
  created: { row: number; school: string }[];
  skipped: { row: number; school: string; reason: string }[];
};

export function BulkLeadButtons() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/leads/import", { method: "POST", body });
      const data = await res.json().catch(() => ({ error: "The server sent an unexpected reply. Please try again." }));
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setResult(data as Result);
      if ((data as Result).created.length) {
        toast(`${(data as Result).created.length} lead(s) created.`);
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <a className="btn" href="/api/leads/template" download>
        <Icon name="download" size={16} /> Download template
      </a>
      <button
        className="btn"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Icon name="upload" size={16} /> Upload leads
      </button>
      {open ? (
        <Modal
          title="Upload leads"
          sub="Use the Excel template from “Download template”. Every row is checked before anything is created."
          wide
          onClose={close}
          footer={
            result ? (
              <>
                <button className="btn" onClick={reset}>
                  Upload another file
                </button>
                <button className="btn pri" onClick={close}>
                  Done
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={close}>
                  Cancel
                </button>
                <button className="btn pri" disabled={!file || busy} onClick={upload}>
                  {busy ? "Checking and uploading…" : "Upload"}
                </button>
              </>
            )
          }
        >
          {!result ? (
            <>
              <div className="fld">
                <label htmlFor="bulk-file">Filled-in template (.xlsx)</label>
                <input
                  className="in"
                  id="bulk-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
              </div>
              {error ? (
                <div className="note bad" role="alert">
                  {error}
                </div>
              ) : null}
              <p className="small muted">
                Rows that pass every check are created with their first follow-up task. Rows with a problem, and possible duplicates
                (same school name and mobile number), are skipped and listed with the reason.
              </p>
              <p className="small muted">
                Always fill in a freshly downloaded template: its columns and dropdowns follow the current lead form, people and
                cities. A template saved from an older version is refused, and the message says which column changed.
              </p>
            </>
          ) : (
            <UploadSummary result={result} />
          )}
        </Modal>
      ) : null}
    </>
  );
}

function UploadSummary({ result }: { result: Result }) {
  const { created, skipped } = result;
  return (
    <div role="status">
      <div className="grid grid-cols-2 gap-3">
        <div className="kpi" style={{ "--c": "#0E8F79" } as React.CSSProperties}>
          <div className="l">Leads created</div>
          <div className="v">{created.length}</div>
        </div>
        <div className="kpi" style={{ "--c": skipped.length ? "#D9412D" : "#8B88A6" } as React.CSSProperties}>
          <div className="l">Rows skipped</div>
          <div className="v">{skipped.length}</div>
        </div>
      </div>
      {skipped.length ? (
        <>
          <h3 className="mt-4">Skipped rows: fix these in the sheet and upload them again</h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {skipped.map((s) => (
              <li key={s.row} className="rounded-lg border border-line bg-surf2 px-3 py-2">
                <div className="font-semibold">
                  Row {s.row} · {s.school}
                </div>
                <div className="small text-coral">{s.reason}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="note ok mt-4">Every row was imported.</div>
      )}
      {created.length ? (
        <details className="mt-4">
          <summary className="small cursor-pointer">Show created rows</summary>
          <ul className="small mt-2 pl-5">
            {created.map((c) => (
              <li key={c.row}>
                Row {c.row} · {c.school}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
