"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action}>
      <div className="fld">
        <label htmlFor="email">Email</label>
        <input className="in" id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="fld">
        <label htmlFor="password">Password</label>
        <input className="in" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error ? (
        <div className="note bad" role="alert">
          {error}
        </div>
      ) : null}
      <button className="btn pri mt-1 w-full justify-center" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
