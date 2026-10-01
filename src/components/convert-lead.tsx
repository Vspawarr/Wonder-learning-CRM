"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { convertLead } from "@/app/actions";
import { Modal, useAction } from "./client";
import { CategoryPicker } from "./category-picker";
import { Icon } from "./icons";

/** "Convert to opportunity" with a short confirmation; opens the new opportunity afterwards. */
export function ConvertLeadButton({ leadId, schoolName, small }: { leadId: string; schoolName: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("");
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <>
      <button className={`btn pri ${small ? "sm" : ""}`} onClick={() => setOpen(true)}>
        <Icon name="briefcase" size={small ? 14 : 16} /> Convert to opportunity
      </button>
      {open ? (
        <Modal
          title="Convert to opportunity?"
          sub={schoolName}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending || !cat}
                onClick={() =>
                  run(() => convertLead(leadId, { temperature: cat }), {
                    success: `${schoolName} is now an opportunity.`,
                    onDone: (oppId) => {
                      setOpen(false);
                      if (oppId) router.push(`/opportunities?opp=${oppId}`);
                    },
                  })
                }
              >
                {pending ? "Converting…" : "Convert"}
              </button>
            </>
          }
        >
          <div className="mb-1.5 font-semibold">Category *</div>
          <CategoryPicker value={cat} onChange={setCat} />
          <p className="mt-3">
            The school moves to the Pipeline as <b>Interested</b> (20%), and a &quot;Schedule demo&quot; follow-up is booked in 2 days. The lead is
            marked Converted.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
