// R48: private links for documents that have no link of their own (proforma invoice, delivery challan,
// credit note), so a WhatsApp message carries the PDF and a link to it. The link is signed with the
// app's secret (AUTH_SECRET); nothing is stored, and a changed or made-up link is refused.
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { clientScope } from "./access";
import { NotFoundError } from "./errors";
import { challanPdf } from "./finance/dispatch";
import { creditNotePdf, proformaFileName, proformaPdf } from "./finance/service";

export const SHARE_KINDS = ["proforma", "challan", "credit-note"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];
const CODE: Record<ShareKind, string> = { proforma: "p", challan: "c", "credit-note": "n" };
const KIND_OF: Record<string, ShareKind> = { p: "proforma", c: "challan", n: "credit-note" };

/** Reads the documents for a public link; the link itself is the permission. */
const LINK_VIEWER: SessionUser = { id: "", name: "Shared link", email: "", role: "ADMIN" };

function sign(body: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return createHmac("sha256", `share-link:${secret}`).update(body).digest("base64url").slice(0, 24);
}

export function shareToken(kind: ShareKind, id: string) {
  const body = `${CODE[kind]}${id}`;
  return `${body}.${sign(body)}`;
}

export function readShareToken(token: string): { kind: ShareKind; id: string } | null {
  const m = /^([pcn])([a-z0-9]{10,40})\.([A-Za-z0-9_-]{24})$/.exec(token);
  if (!m) return null;
  const want = Buffer.from(sign(`${m[1]}${m[2]}`));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { kind: KIND_OF[m[1]], id: m[2] };
}

/** The private link's path for a document the user can see. */
export async function shareLinkFor(user: SessionUser, kind: ShareKind, id: string) {
  const where = { id, client: clientScope(user) };
  const found =
    kind === "proforma"
      ? await db.salesOrder.findFirst({ where, select: { id: true } })
      : kind === "challan"
        ? await db.dispatch.findFirst({ where, select: { id: true } })
        : await db.creditNote.findFirst({ where, select: { id: true } });
  if (!found) throw new NotFoundError("Document");
  return `/d/${shareToken(kind, id)}`;
}

const fileSafe = (s: string) => s.replace(/\//g, "-");

/** The PDF behind a private link, or null when the link isn't valid (or the document is gone). */
export async function sharedPdf(token: string): Promise<{ fileName: string; pdf: Buffer } | null> {
  const t = readShareToken(token);
  if (!t) return null;
  try {
    if (t.kind === "proforma") {
      const r = await proformaPdf(LINK_VIEWER, t.id);
      return { fileName: proformaFileName(r.number), pdf: r.pdf };
    }
    if (t.kind === "challan") {
      const r = await challanPdf(LINK_VIEWER, t.id);
      return { fileName: `Challan-${fileSafe(r.number)}.pdf`, pdf: r.pdf };
    }
    const r = await creditNotePdf(LINK_VIEWER, t.id);
    return { fileName: `Credit-note-${fileSafe(r.number)}.pdf`, pdf: r.pdf };
  } catch {
    return null;
  }
}
