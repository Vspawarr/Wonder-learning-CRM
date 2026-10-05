"use client";

import { normalizeMobile } from "@/lib/phone";

/** Mobile number box: digits only, at most 10 (a pasted +91 / 0 in front is dropped). */
export function MobileInput({ id, value, onChange, placeholder = "10-digit mobile" }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      className="in"
      id={id}
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      maxLength={10}
      placeholder={placeholder}
      value={normalizeMobile(value).slice(0, 10)}
      onChange={(e) => onChange(normalizeMobile(e.target.value).slice(0, 10))}
      onPaste={(e) => {
        // maxLength would cut "+91 98220 12345" to "+91 98220 "; take the digits ourselves.
        e.preventDefault();
        onChange(normalizeMobile(e.clipboardData.getData("text")).slice(0, 10));
      }}
    />
  );
}
