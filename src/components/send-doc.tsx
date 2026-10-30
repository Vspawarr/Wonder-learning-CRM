"use client";

// R48: "Send on WhatsApp" for the proforma invoice, delivery challan and credit note: the PDF goes with
// the message (as for quotations, invoices and receipts) and the message carries a private link to it.
import { useEffect, useState } from "react";
import { docShareLink } from "@/app/actions";
import { Field, Modal, useToast } from "@/components/client";
import { Icon } from "@/components/icons";
import { MobileInput } from "@/components/mobile-input";
import { WHATSAPP_DONE, useWhatsAppPdf } from "@/components/whatsapp-share";
import type { ShareKind } from "@/server/share-links";

export function SendDocButton(props: Omit<SendDocProps, "onClose"> & { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}>
        <Icon name="chat" size={14} /> {props.label ?? "WhatsApp"}
      </button>
      {open ? <SendDoc {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type SendDocProps = {
  kind: ShareKind;
  id: string;
  /** The signed-in PDF address (preview / download). */
  pdf: string;
  /** "Proforma invoice PI/12/26-27" */
  title: string;
  schoolName: string;
  mobile: string | null;
  /** First lines of the message, before the link. */
  body: string;
  me: { name: string };
  onClose: () => void;
};

function SendDoc({ kind, id, pdf, title, schoolName, mobile: mobile0, body, me, onClose }: SendDocProps) {
  const toast = useToast();
  const [mobile, setMobile] = useState(mobile0 ?? "");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(`Dear Sir/Madam,\n${body}\n\nRegards,\n${me.name}\nWonder Learning India Pvt. Ltd.`);
  const wa = useWhatsAppPdf(pdf, `${title} ${schoolName}`);
  useEffect(() => {
    let live = true;
    docShareLink(kind, id).then((r) => {
      if (!live) return;
      if (r.ok) setLink(`${window.location.origin}${r.data}`);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [kind, id]);
  const send = () => {
    const [head, ...sign] = message.split("\n\nRegards,");
    const text = `${head}\nPDF attached; also here: ${link}${sign.length ? `\n\nRegards,${sign.join("\n\nRegards,")}` : ""}`;
    toast(WHATSAPP_DONE[wa.send(mobile, text)]);
    onClose();
  };
  const ready = wa.ready && !!link;
  return (
    <Modal
      title={`Send ${title}`}
      sub={schoolName}
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <Field label="WhatsApp number" htmlFor="sd-mobile">
        <MobileInput id="sd-mobile" value={mobile} onChange={setMobile} />
      </Field>
      <Field label="Message" htmlFor="sd-msg">
        <textarea className="ta" id="sd-msg" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      {error ? <div className="note bad mb-2">{error}</div> : null}
      <div className="grid grid-cols-1 gap-2 min-[501px]:grid-cols-3">
        <a className="btn justify-center" href={pdf} target="_blank" rel="noreferrer">
          Preview PDF
        </a>
        <a className="btn justify-center" href={`${pdf}?download=1`}>
          <Icon name="download" size={16} /> Download PDF
        </a>
        <button className="btn pri justify-center" disabled={!ready || mobile.length !== 10} onClick={send}>
          <Icon name="chat" size={16} /> {ready ? "Send on WhatsApp" : "Preparing PDF…"}
        </button>
      </div>
      <p className="small muted mt-2">
        WhatsApp sends the PDF with the message and a private link to it. On a computer, WhatsApp Web opens with the message and the PDF is saved for you to attach (📎).
      </p>
    </Modal>
  );
}
