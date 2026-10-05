"use client";

// Client page: extra contacts (Principal, Accounts…) and documents.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";
import { deleteClientFile, deleteContact, saveContact } from "@/app/actions";
import { CONTACT_ROLES, DOCUMENT_CATEGORIES } from "@/lib/constants";
import { fmtDate, istDate } from "@/lib/dates";
import type { ClientDetail } from "@/server/queries";
import { uploadClientFile } from "./dispatch";
import { MobileInput } from "@/components/mobile-input";

type K = ClientDetail["contacts"][number];

export function ContactsCard({ client }: { client: ClientDetail }) {
  const [editing, setEditing] = useState<K | "new" | null>(null);
  const { pending, run } = useAction();
  const tel = (m: string) => m.replace(/[^\d+]/g, "");
  return (
    <>
      <div className="flex flex-col">
        <div className="border-b border-line py-2">
          <b>{client.contactName}</b> <span className="small muted">· main contact{client.designation ? ` · ${client.designation}` : ""}</span>
          <div className="small muted">
            {client.mobile}
            {client.email ? ` · ${client.email}` : ""}
          </div>
        </div>
        {client.contacts.map((k) => (
          <div key={k.id} className="flex items-start justify-between gap-2 border-b border-line py-2 last:border-0">
            <div className="min-w-0">
              <b>{k.name}</b> <span className="small muted">· {k.role}</span> {k.forPayments ? <Pill tone="info">Payments</Pill> : null}
              <div className="small muted">{[k.mobile, k.email].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {k.mobile ? (
                <a className="btn sm" href={`tel:${tel(k.mobile)}`} aria-label={`Call ${k.name}`}>
                  <Icon name="phone" size={14} />
                </a>
              ) : null}
              <button className="btn sm" onClick={() => setEditing(k)}>
                Edit
              </button>
              <button
                className="btn sm ghost"
                disabled={pending}
                onClick={() => confirm(`Remove ${k.name}?`) && run(() => deleteContact(k.id), { success: "Contact removed." })}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn sm mt-2" onClick={() => setEditing("new")}>
        <Icon name="plus" size={14} /> Add contact
      </button>
      {editing ? <ContactModal clientId={client.id} contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function ContactModal({ clientId, contact, onClose }: { clientId: string; contact: K | null; onClose: () => void }) {
  const [v, setV] = useState({
    name: contact?.name ?? "",
    role: contact?.role ?? "",
    mobile: contact?.mobile ?? "",
    email: contact?.email ?? "",
    forPayments: contact?.forPayments ?? false,
  });
  const { pending, run } = useAction();
  return (
    <Modal
      title={contact ? "Edit contact" : "Add contact"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={pending} onClick={() => run(() => saveContact(clientId, contact?.id ?? null, v), { success: "Contact saved.", onDone: onClose })}>
            Save
          </button>
        </>
      }
    >
      <div className="fg2">
        <Field label="Name *" htmlFor="ct-name">
          <input className="in" id="ct-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Role *" htmlFor="ct-role">
          <select className="sel" id="ct-role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
            <Options list={CONTACT_ROLES} blank="Choose…" />
          </select>
        </Field>
        <Field label="Mobile" htmlFor="ct-mob">
          <MobileInput id="ct-mob" value={v.mobile} onChange={(mobile) => setV({ ...v, mobile })} />
        </Field>
        <Field label="Email" htmlFor="ct-email">
          <input className="in" id="ct-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 rounded-lg border border-line p-3">
        <input type="checkbox" className="mt-1" checked={v.forPayments} onChange={(e) => setV({ ...v, forPayments: e.target.checked })} />
        <span>
          <b>Send payment reminders and receipts to this person</b>
          <span className="small muted block">For example the school&apos;s accounts person.</span>
        </span>
      </label>
    </Modal>
  );
}

export function DocumentsCard({ client }: { client: ClientDetail }) {
  const [adding, setAdding] = useState(false);
  const { pending, run } = useAction();
  return (
    <>
      {client.documents.length ? (
        <div className="flex flex-col">
          {client.documents.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className="min-w-0">
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="font-semibold">
                  {f.title}
                </a>
                <div className="small muted">
                  {f.category} · {fmtDate(istDate(f.uploadedAt))} · {f.by} · {Math.max(1, Math.round(f.size / 1024))} KB
                </div>
              </div>
              <button
                className="btn sm ghost"
                disabled={pending}
                onClick={() => confirm(`Delete ${f.title}?`) && run(() => deleteClientFile(f.id), { success: "Document deleted." })}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="small muted">No documents yet. Keep the agreement, GST certificate and other papers here.</div>
      )}
      <button className="btn sm mt-2" onClick={() => setAdding(true)}>
        <Icon name="upload" size={14} /> Upload document
      </button>
      {adding ? <UploadModal clientId={client.id} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function UploadModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [v, setV] = useState({ category: "", title: "" });
  const [file, setFile] = useState<File | null>(null);
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <Modal
      title="Upload document"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={pending || !file}
            onClick={() =>
              run(() => uploadClientFile(clientId, file!, v), {
                success: "Document uploaded.",
                onDone: () => {
                  onClose();
                  router.refresh();
                },
              })
            }
          >
            {pending ? "Uploading…" : "Upload"}
          </button>
        </>
      }
    >
      <Field label="What is it? *" htmlFor="doc-cat">
        <select className="sel" id="doc-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
          <Options list={DOCUMENT_CATEGORIES} blank="Choose…" />
        </select>
      </Field>
      <Field label="Name (optional)" htmlFor="doc-title">
        <input className="in" id="doc-title" placeholder="e.g. Agreement 2026-27" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      </Field>
      <Field label="File (PDF or photo, up to 4 MB) *" htmlFor="doc-file">
        <input className="in" id="doc-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
    </Modal>
  );
}
