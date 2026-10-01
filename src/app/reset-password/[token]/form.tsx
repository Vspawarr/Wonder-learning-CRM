"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { resetPassword } from "@/app/actions";

export function ResetForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok)
    return (
      <div className="note ok">
        Password changed. <Link href="/login">Sign in now →</Link>
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pw !== again) return setMsg({ ok: false, text: "The two passwords don't match." });
        start(async () => {
          const r = await resetPassword(token, pw);
          setMsg(r.ok ? { ok: true, text: "" } : { ok: false, text: r.error });
        });
      }}
    >
      <div className="fld">
        <label htmlFor="rp-1">New password (at least 8 characters)</label>
        <input className="in" id="rp-1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </div>
      <div className="fld">
        <label htmlFor="rp-2">Type it again</label>
        <input className="in" id="rp-2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
      </div>
      {msg && !msg.ok ? (
        <div className="note bad" role="alert">
          {msg.text}
        </div>
      ) : null}
      <button className="btn pri mt-1 w-full justify-center" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
