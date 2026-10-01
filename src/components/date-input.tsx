"use client";

import { useRef, useState } from "react";
import { Icon } from "./icons";

// Always DD/MM/YYYY, whatever the browser's language. The browser's own date
// field follows the computer's locale (often MM/DD/YYYY), so we use a text box
// plus a calendar button that opens the native picker. Values in and out are
// "YYYY-MM-DD" ("" when empty or not a real date).

const toDmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

function toIso(dmy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
  if (!m) return "";
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : "";
}

/** Inserts the slashes as the user types digits. */
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateInput({
  id,
  value,
  onChange,
  min,
  disabled,
  ariaLabel,
  className,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState(() => ({ text: toDmy(value), iso: value }));
  // Follow changes made from outside (e.g. form reset) without fighting the user's typing.
  if (value !== state.iso) setState({ text: toDmy(value), iso: value });
  const picker = useRef<HTMLInputElement>(null);
  const invalid = state.text.length === 10 && !state.iso;

  const setText = (text: string) => {
    const iso = toIso(text);
    setState({ text, iso });
    if (iso !== value) onChange(iso);
  };

  return (
    <div className={`relative flex ${className ?? ""}`}>
      <input
        className={`in pr-10 ${invalid ? "border-coral" : ""}`}
        id={id}
        value={state.text}
        onChange={(e) => setText(mask(e.target.value))}
        placeholder="DD/MM/YYYY"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="absolute top-1/2 right-1.5 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink3 hover:bg-brandsoft hover:text-brand disabled:opacity-40"
        aria-label="Open calendar"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => {
          try {
            picker.current?.showPicker();
          } catch {
            picker.current?.focus();
          }
        }}
      >
        <Icon name="calendar" size={16} />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        // Phones: this invisible date box sits right over the calendar button, so a tap
        // opens the phone's own date picker directly (showPicker isn't on every phone).
        className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:top-1/2 [@media(pointer:coarse)]:right-1.5 [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8 [@media(pointer:coarse)]:-translate-y-1/2"
        disabled={disabled}
        value={state.iso}
        min={min}
        onChange={(e) => setText(toDmy(e.target.value))}
      />
    </div>
  );
}
