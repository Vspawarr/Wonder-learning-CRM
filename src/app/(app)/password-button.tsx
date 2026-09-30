"use client";

import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { changePassword } from "@/app/actions";

export function PasswordButton() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const { pending, run } = useAction();
  const close = () => {
    setOpen(false);
    setCur("");
    setNext("");
  };
  return (
    <>
      <button
        className="btn sm border-[#3a3680] bg-[#26225a] text-white hover:text-white"
        aria-label="Change password"
        title="Change password"
        onClick={() => setOpen(true)}
      >
        <Icon name="key" size={14} />
      </button>
      {open ? (
        <Modal
          title="Change password"
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending}
                onClick={() => run(() => changePassword(cur, next), { success: "Password changed.", onDone: close })}
              >
                Save
              </button>
            </>
          }
        >
          <Field label="Current password" htmlFor="pw-cur">
            <input className="in" id="pw-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="New password (min 8 characters)" htmlFor="pw-new">
            <input className="in" id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}
