// Files kept on a client: documents and proofs of delivery (stored in the database, 4 MB max each).
import { db } from "@/lib/db";
import { DOCUMENT_CATEGORIES, POD_CATEGORY } from "@/lib/constants";
import type { SessionUser } from "@/lib/permissions";
import { clientScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { PO_MAX_BYTES, PO_TYPES } from "./finance/po";

export async function saveClientFile(
  user: SessionUser,
  clientId: string,
  f: { category: string; title: string; dispatchId?: string | null; name: string; type: string; bytes: Uint8Array },
) {
  const client = await db.client.findFirst({ where: { id: clientId, ...clientScope(user) }, select: { id: true } });
  if (!client) throw new NotFoundError("Client");
  const category = f.dispatchId ? POD_CATEGORY : f.category;
  if (!f.dispatchId && !(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) throw new DomainError("Choose what kind of document this is.");
  if (!PO_TYPES[f.type]) throw new DomainError("Upload a PDF or a photo (JPG or PNG).");
  if (!f.bytes.length) throw new DomainError("The file is empty.");
  if (f.bytes.length > PO_MAX_BYTES) throw new DomainError("The file is larger than 4 MB. Please upload a smaller PDF or photo.");
  if (f.dispatchId && !(await db.dispatch.count({ where: { id: f.dispatchId, clientId } }))) throw new NotFoundError("Dispatch");
  const title = (f.title || category).trim().slice(0, 120);
  await db.$transaction([
    db.clientFile.create({
      data: {
        clientId,
        category,
        title,
        fileName: f.name.slice(0, 200) || "document",
        contentType: f.type,
        size: f.bytes.length,
        data: Buffer.from(f.bytes),
        dispatchId: f.dispatchId ?? null,
        uploadedById: user.id,
      },
    }),
    db.activity.create({ data: { type: "SYSTEM", subject: `${category === title ? title : `${category}: ${title}`} uploaded`, byId: user.id, clientId } }),
  ]);
}

export async function clientFile(user: SessionUser, id: string) {
  const f = await db.clientFile.findFirst({ where: { id, client: clientScope(user) } });
  if (!f) throw new NotFoundError("File");
  return f;
}

export async function deleteClientFile(user: SessionUser, id: string) {
  const f = await clientFile(user, id);
  await db.$transaction([
    db.clientFile.delete({ where: { id } }),
    db.activity.create({ data: { type: "SYSTEM", subject: `${f.title} deleted`, byId: user.id, clientId: f.clientId } }),
  ]);
}
