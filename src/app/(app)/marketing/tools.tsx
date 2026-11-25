"use client";

// R57: Marketing → Tools: the ID card designer, with the user's leads / clients and their saved logos.
import { designSchoolLogo } from "@/app/actions";
import { Designer, type School } from "@/lib/designs/designer";

export function MarketingTools({ schools }: { schools: School[] }) {
  return (
    <div className="grid gap-3">
      <div className="card p-4">
        <h2 className="text-lg">ID card designer</h2>
        <p className="muted mt-1">
          Show a school how its own student ID cards can look. Pick the school (or type its details), upload its logo, press <b>Generate designs</b>, then
          download or share the one they like. A sample student and photo are filled in; change them if you wish.
        </p>
        <p className="muted mt-2 text-sm">
          Also available as a single file that opens in any browser without logging in:{" "}
          <a className="link" href="/tools/id-card-designer.html" download>
            download id-card-designer.html
          </a>
          .
        </p>
      </div>
      <Designer schools={schools} loadLogo={designSchoolLogo} />
    </div>
  );
}
