"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  if (state?.done)
    return state.emailReady ? (
      <div className="note ok">If that email belongs to a CRM user, a reset link is on its way. It works for 1 hour. Check spam too.</div>
    ) : (
      <div className="note warn">
        Email sending isn&apos;t set up yet, so the link can&apos;t be sent. Please ask your admin (Gautami) to set a new password for you in
        Settings → Users.
      </div>
    );
  return (
    <form action={action}>
      <div className="fld">
        <label htmlFor="fp-email">Your email</label>
        <input className="in" id="fp-email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <button className="btn pri mt-1 w-full justify-center" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
