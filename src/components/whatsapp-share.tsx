"use client";

// R43: WhatsApp messages carry the document itself, not only the link.
// - Android app: the app hands the PDF + message to WhatsApp (needs app version 1.3).
// - Phone browser: the phone's share screen with the PDF and the message; pick WhatsApp and the chat.
// - Computer: WhatsApp Web opens with the message (and link) and the PDF is saved, ready to attach with 📎.
//   (No website can attach a file inside WhatsApp Web by itself.)
import { useEffect, useState } from "react";
import { openWhatsApp, waNumber } from "@/lib/phone";

type Bridge = { shareFile?: (base64: string, name: string, mime: string, text: string, phone: string) => void };

const safeName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document"}.pdf`;

function toBase64(buf: ArrayBuffer) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Fetches the PDF as soon as the send window opens, so the share can happen inside the tap. */
export function useWhatsAppPdf(pdfUrl: string | null, name: string) {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    if (!pdfUrl) return;
    let live = true;
    fetch(pdfUrl, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (live && b) setFile(new File([b], safeName(name), { type: "application/pdf" }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pdfUrl, name]);

  /** Returns how it went, for the message shown to the user. */
  const send = (mobile: string | null | undefined, text: string): "app" | "shared" | "downloaded" => {
    const bridge = (window as unknown as { WonderApp?: Bridge }).WonderApp;
    if (bridge?.shareFile && file) {
      file.arrayBuffer().then((buf) => bridge.shareFile!(toBase64(buf), file.name, file.type, text, waNumber(mobile)));
      return "app";
    }
    const phoneLike = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (phoneLike && file && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], text }).catch(() => {});
      return "shared";
    }
    openWhatsApp(mobile, text);
    const a = document.createElement("a");
    a.download = file?.name ?? safeName(name);
    a.href = file ? URL.createObjectURL(file) : `${pdfUrl}${pdfUrl?.includes("?") ? "&" : "?"}download=1`;
    a.click();
    if (file) setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return "downloaded";
  };
  return { ready: !!file || !pdfUrl, send };
}

export const WHATSAPP_DONE: Record<"app" | "shared" | "downloaded", string> = {
  app: "Choose the chat in WhatsApp: the PDF and the message are attached.",
  shared: "Pick WhatsApp and the chat: the PDF and the message go together.",
  downloaded: "WhatsApp opened with the message. The PDF is saved on this computer: attach it in the chat with 📎.",
};
