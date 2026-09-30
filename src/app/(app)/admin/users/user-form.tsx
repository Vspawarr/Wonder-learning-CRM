"use client";

import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { createUser, updateUser, type ActionResult } from "@/app/actions";
import { ROLE_LABEL } from "@/lib/constants";
import type { Role } from "@/generated/prisma/enums";

type U = { id: string; name: string; email: string; mobile: string | null; role: Role; active: boolean };

export function UserButton({ actorRole, user, isSelf }: { actorRole: Role; user?: U; isSelf?: boolean }) {
  const init = () => ({
    name: user?.name ?? "",
    email: user?.email ?? "",
    mobile: user?.mobile ?? "",
    role: user?.role ?? "SALES_EXECUTIVE",
    active: user?.active ?? true,
    password: "",
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(init);
  const { pending, run } = useAction();
  const close = () => setOpen(false);
  const roles = (Object.entries(ROLE_LABEL) as [Role, string][]).filter(([r]) => r !== "DIRECTOR" || actorRole === "DIRECTOR");

  return (
    <>
      {user ? (
        <button
          className="btn sm"
          onClick={() => {
            setV(init());
            setOpen(true);
          }}
        >
          Edit
        </button>
      ) : (
        <button
          className="btn pri"
          onClick={() => {
            setV(init());
            setOpen(true);
          }}
        >
          <Icon name="plus" size={16} /> Add user
        </button>
      )}
      {open ? (
        <Modal
          title={user ? `Edit ${user.name}` : "Add user"}
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending}
                onClick={() =>
                  run(() => (user ? updateUser(user.id, v) : createUser(v)) as Promise<ActionResult<unknown>>, {
                    success: user ? "User saved." : `${v.name} added. Share the initial password with them securely.`,
                    onDone: close,
                  })
                }
              >
                Save
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="Name *" htmlFor="u-name">
              <input className="in" id="u-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Role *" htmlFor="u-role">
              <select className="sel" id="u-role" disabled={isSelf} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>
                <Options list={roles} />
              </select>
            </Field>
            <Field label="Email *" htmlFor="u-email">
              <input className="in" id="u-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field label="Mobile" htmlFor="u-mob">
              <input className="in" id="u-mob" inputMode="tel" value={v.mobile} onChange={(e) => setV({ ...v, mobile: e.target.value })} />
            </Field>
            <Field label={user ? "New password (leave blank to keep)" : "Initial password * (min 8)"} htmlFor="u-pw">
              <input className="in" id="u-pw" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
            </Field>
            <Field label="Status" htmlFor="u-active">
              <select className="sel" id="u-active" disabled={isSelf} value={v.active ? "1" : "0"} onChange={(e) => setV({ ...v, active: e.target.value === "1" })}>
                <option value="1">Active</option>
                <option value="0">Inactive (can&apos;t sign in)</option>
              </select>
            </Field>
          </div>
          <div className="small muted">
            Sales Managers and Sales Executives see only their own leads, opportunities and tasks. The Sales Head, Admins and Directors
            see the whole team. Directors and Admins also manage users, products and cities; the Sales Head manages products.
          </div>
        </Modal>
      ) : null}
    </>
  );
}
