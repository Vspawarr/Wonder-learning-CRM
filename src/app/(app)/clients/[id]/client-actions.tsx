"use client";

import { useState } from "react";
import { Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { LogInteractionButton } from "@/components/activity";
import { completeOnboarding } from "@/app/actions";

export function ClientActions({ id, mobile, onboarding }: { id: string; mobile: string; onboarding: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const { pending, run } = useAction();
  const tel = mobile.replace(/[^\d+]/g, "");
  const wa = tel.replace(/^\+/, "").replace(/^(\d{10})$/, "91$1");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn" href={`tel:${tel}`}>
        <Icon name="phone" size={16} /> Call
      </a>
      <a className="btn" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
        <Icon name="chat" size={16} /> WhatsApp
      </a>
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
