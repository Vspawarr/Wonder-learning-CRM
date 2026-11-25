"use client";

// R57 / R58: Marketing → Tools: ID cards and book covers with a school's details, filled from the user's leads /
// clients and their saved logos.
import { designSchoolLogo } from "@/app/actions";
import { COVER_KINDS } from "@/lib/designs/book-covers";
import { Designer, type School } from "@/lib/designs/designer";
import { DESIGN_KINDS } from "@/lib/designs/id-cards";

const KINDS = [...DESIGN_KINDS, ...COVER_KINDS];

export function MarketingTools({ schools }: { schools: School[] }) {
  return (
    <div className="grid gap-3">
      <div className="card p-4">
        <h2 className="text-lg">ID card and book cover designer</h2>
        <p className="muted mt-1">
          Show a school how its own student ID cards and Wonder Learning book covers can look. Choose what to design, pick the school (or type its details),
          upload its logo, press <b>Generate designs</b>, then download or share the one they like. On book covers the school&apos;s logo and address take the
          place of Wonder Learning&apos;s.
        </p>
        <p className="muted mt-2 text-sm">
          Also as single files that open in any browser without logging in or internet:{" "}
          <a className="link" href="/tools/id-card-designer.html" download>
            id-card-designer.html
          </a>{" "}
          (ID cards) and{" "}
          <a className="link" href="/tools/book-cover-designer.html" download>
            book-cover-designer.html
          </a>{" "}
          (UKG book covers, about 4 MB).
        </p>
      </div>
      <Designer schools={schools} loadLogo={designSchoolLogo} kinds={KINDS} />
    </div>
  );
}
