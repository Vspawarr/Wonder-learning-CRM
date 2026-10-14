"use client";

import { useState } from "react";
import { useAction } from "@/components/client";
import { clearTestData } from "@/app/actions";

export function ClearDataForm({ empty }: { empty: boolean }) {
  const [word, setWord] = useState("");
  const { pending, run } = useAction();
  const ready = word.trim().toUpperCase() === "CLEAR";
  return (
    <div className="card mt-4 border-coral">
      <h2>Delete the test data</h2>
      <div className="note bad">This cannot be undone. Make sure nobody is entering real work in the CRM right now.</div>
      {empty ? <p className="muted">There is no test data left. The CRM is ready for real use.</p> : null}
      <label className="fld max-w-[360px]" htmlFor="clear-word">
        <span className="small strong muted">Type CLEAR to confirm</span>
        <input id="clear-word" className="in" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" placeholder="CLEAR" />
      </label>
      <button
        className="btn bad"
        disabled={!ready || pending}
        onClick={() => run(() => clearTestData(word), { success: "Test data cleared. Logins, products and templates are kept.", onDone: () => setWord("") })}
      >
        {pending ? "Clearing…" : "Delete all test data"}
      </button>
    </div>
  );
}
