"use client";

import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { LogInteractionButton } from "@/components/activity";
import { completeOnboarding, removeClient } from "@/app/actions";
import { openWhatsApp } from "@/lib/phone";

export function ClientActions({ id, mobile, onboarding }: { id: string; mobile: string; onboarding: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const { pending, run } = useAction();
  const tel = mobile.replace(/[^\d+]/g, "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn" href={`tel:${tel}`}>
        <Icon name="phone" size={16} /> Call
      </a>
      <button className="btn" onClick={() => openWhatsApp(mobile)}>
        <Icon name="chat" size={16} /> WhatsApp
      </button>
      <LogInteractionButton clientId={id} />
      {onboarding ? (
        <button className="btn pri" onClick={() => setConfirm(true)}>
          <Icon name="check" size={16} /> Onboarding complete
        </button>
      ) : null}
      {confirm ? (
        <Modal
          title="Mark onboarding complete?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending}
                onClick={() => run(() => completeOnboarding(id), { success: "Onboarding complete. Client is now Active.", onDone: () => setConfirm(false) })}
              >
                Mark complete
              </button>
            </>
          }
        >
          <p>The client&apos;s status changes from Onboarding to Active.</p>
        </Modal>
      ) : null}
    </div>
  );
}

/** R43: Admin / Director undo a conversion made by mistake. The deal reopens; the lead stays. */
export function RemoveClientButton({ id, school }: { id: string; school: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <>
      <button className="btn text-coral" onClick={() => setOpen(true)}>
        Remove client
      </button>
      {open ? (
        <Modal
          title={`Remove ${school} as a client?`}
          sub="Use this only when the school was converted to a client by mistake."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn bad"
                disabled={pending || reason.trim().length < 3}
                onClick={() =>
                  run(() => removeClient(id, reason), {
                    success: "Client removed. The deal is open again.",
                    onDone: (oppId) => router.push(oppId ? `/opportunities?opp=${oppId}` : "/clients"),
                  })
                }
              >
                {pending ? "Removing…" : "Remove client"}
              </button>
            </>
          }
        >
          <ul className="small mb-3 list-disc pl-5">
            <li>The client page, its contacts, documents and open to-dos are deleted.</li>
            <li>The deal reopens at the stage it had before Won; its quotations and history stay on it.</li>
            <li>The lead stays as it is.</li>
            <li>Not possible once there are sales orders, invoices or payments.</li>
          </ul>
          <Field label="Why is it being removed? *" htmlFor="rm-reason">
            <textarea className="ta" id="rm-reason" rows={3} placeholder="e.g. Converted by mistake; school hasn't confirmed yet" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}
