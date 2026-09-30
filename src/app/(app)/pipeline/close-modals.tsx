"use client";

import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { moveOpportunity } from "@/app/actions";
import { COMPETITORS, LOST_REASONS } from "@/lib/constants";

export function LostModal({
  oppId,
  school,
  competitor,
  onClose,
  onDone,
}: {
  oppId: string;
  school: string;
  competitor: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [comp, setComp] = useState(competitor ?? "");
  const [remarks, setRemarks] = useState("");
  const { pending, run } = useAction();
  return (
    <Modal
      title="Mark as lost"
      sub={school}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn bad"
            disabled={pending || !reason || !remarks.trim()}
            onClick={() =>
              run(() => moveOpportunity(oppId, { stage: "LOST", lostReason: reason, lostRemarks: remarks, competitor: comp }), {
                success: `Marked as lost: ${reason}.`,
                onDone: () => {
                  onClose();
                  onDone?.();
                },
              })
            }
          >
            Mark as lost
          </button>
        </>
      }
    >
      <div className="note warn">A reason and remarks are required. They feed the lost-deal report.</div>
      <Field label="Reason *" htmlFor="lost-reason">
        <select className="sel" id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <Options list={LOST_REASONS} blank="Choose a reason" />
        </select>
      </Field>
      <Field label="Competitor" htmlFor="lost-comp">
        <select className="sel" id="lost-comp" value={comp} onChange={(e) => setComp(e.target.value)}>
          <Options list={COMPETITORS} blank="None" />
        </select>
      </Field>
      <Field label="Remarks *" htmlFor="lost-rem">
        <textarea className="ta" id="lost-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function WonModal({ oppId, school, onClose }: { oppId: string; school: string; onClose: () => void }) {
  const { pending, run } = useAction();
  return (
    <Modal
      title="Mark as won"
      sub={school}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() => run(() => moveOpportunity(oppId, { stage: "WON" }), { success: `${school} marked as won.`, onDone: onClose })}
          >
            Mark as won
          </button>
        </>
      }
    >
      <p>This closes the deal at 100%. Closed deals can&apos;t be moved back.</p>
      <p className="small muted mt-2">Creating the school profile and sales order from a won deal comes in the next phase.</p>
    </Modal>
  );
}
