"use client";

import { Icon } from "@/components/icons";

/** Print, or save as PDF from the print window. */
export function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      <Icon name="download" size={16} /> Print / save as PDF
    </button>
  );
}
