// R53: marketing material (presentations, videos, animations, HTML files, PDFs) to show and send to schools.
// Small files are kept in the database (4 MB max, the most the website accepts in one upload); large ones are a link,
// usually Google Drive. Everyone can view and share; Admin / Director / Sales Head add, change and remove.
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { MARKETING_CATEGORIES } from "@/lib/constants";
import { canManageMarketing, type SessionUser } from "@/lib/permissions";
import { DomainError, NotFoundError } from "./errors";
import { getFeatures } from "./features";
import { sign } from "./share-links";
import { clientScope, leadScope } from "./access";
import { parse } from "./validation";

export const MARKETING_MAX_BYTES = 4 * 1024 * 1024;

/** Allowed files by extension, and how they are served: shown in the browser, shown sandboxed (HTML), or downloaded. */
export const MARKETING_TYPES: Record<string, { type: string; show: "inline" | "sandbox" | "download" }> = {
  pdf: { type: "application/pdf", show: "inline" },
  png: { type: "image/png", show: "inline" },
  jpg: { type: "image/jpeg", show: "inline" },
  jpeg: { type: "image/jpeg", show: "inline" },
  webp: { type: "image/webp", show: "inline" },
  gif: { type: "image/gif", show: "inline" },
  mp4: { type: "video/mp4", show: "inline" },
  webm: { type: "video/webm", show: "inline" },
  html: { type: "text/html; charset=utf-8", show: "sandbox" },
  htm: { type: "text/html; charset=utf-8", show: "sandbox" },
  pptx: { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", show: "download" },
  ppt: { type: "application/vnd.ms-powerpoint", show: "download" },
  ppsx: { type: "application/vnd.openxmlformats-officedocument.presentationml.slideshow", show: "download" },
  docx: { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", show: "download" },
  zip: { type: "application/zip", show: "download" },
};
export const MARKETING_ACCEPT = Object.keys(MARKETING_TYPES)
  .map((e) => `.${e}`)
  .join(",");
const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

async function assertOn() {
  if (!(await getFeatures()).marketing) throw new DomainError("Marketing material is switched off in Settings → Features.");
}
function assertManager(user: SessionUser) {
  if (!canManageMarketing(user.role)) throw new DomainError("Only an Admin or the Sales Head can change marketing material.");
}

const fields = z.object({
  title: z.string().trim().min(2, "Give it a title.").max(120),
  category: z.enum(MARKETING_CATEGORIES, { message: "Choose a category." }),
  description: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((s) => s || null),
});
const link = z
  .string()
  .trim()
  .max(1000)
  .refine((u) => /^https:\/\/[^\s]+$/i.test(u), "Paste the full link, starting with https:// (e.g. a Google Drive share link).");

export async function listMarketing() {
  await assertOn();
  const rows = await db.marketingItem.findMany({
    select: { id: true, title: true, category: true, description: true, url: true, fileName: true, size: true, createdAt: true, createdBy: { select: { name: true } } },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    by: r.createdBy.name,
    kind: r.url ? ("link" as const) : ("file" as const),
    show: r.fileName ? (MARKETING_TYPES[extOf(r.fileName)]?.show ?? "download") : null,
    /** The link to send to a school: the Drive link itself, or a private link to the file. */
    share: r.url ?? `/m/${marketingToken(r.id)}`,
  }));
}

export async function addMarketingLink(user: SessionUser, raw: unknown) {
  await assertOn();
  assertManager(user);
  const d = parse(fields.extend({ url: link }), raw);
  const r = await db.marketingItem.create({ data: { ...d, createdById: user.id } });
  return r.id;
}

export async function addMarketingFile(user: SessionUser, raw: unknown, file: { name: string; bytes: Uint8Array }) {
  await assertOn();
  assertManager(user);
  const d = parse(fields, raw);
  const t = MARKETING_TYPES[extOf(file.name)];
  if (!t) throw new DomainError("This kind of file can't be uploaded. Use PDF, PowerPoint, picture, video, HTML or ZIP, or add a Google Drive link.");
  if (!file.bytes.length) throw new DomainError("The file is empty.");
  if (file.bytes.length > MARKETING_MAX_BYTES) throw new DomainError("The file is larger than 4 MB. Put it on Google Drive and add the link instead.");
  const r = await db.marketingItem.create({
    data: { ...d, fileName: file.name.slice(0, 200), contentType: t.type, size: file.bytes.length, data: Buffer.from(file.bytes), createdById: user.id },
  });
  return r.id;
}

export async function updateMarketing(user: SessionUser, id: string, raw: unknown) {
  await assertOn();
  assertManager(user);
  const item = await db.marketingItem.findUnique({ where: { id }, select: { url: true } });
  if (!item) throw new NotFoundError("Item");
  const d = parse(item.url ? fields.extend({ url: link }) : fields, raw);
  await db.marketingItem.update({ where: { id }, data: d });
}

export async function deleteMarketing(user: SessionUser, id: string) {
  await assertOn();
  assertManager(user);
  await db.marketingItem.deleteMany({ where: { id } });
}

/** The stored file, for the signed-in team. */
export async function marketingFile(id: string) {
  await assertOn();
  const f = await db.marketingItem.findUnique({ where: { id } });
  if (!f?.data || !f.fileName) throw new NotFoundError("File");
  return { fileName: f.fileName, data: f.data, ...(MARKETING_TYPES[extOf(f.fileName)] ?? { type: "application/octet-stream", show: "download" as const }) };
}

/* ---------- private links for schools (signed, nothing stored) ---------- */

export function marketingToken(id: string) {
  return `${id}.${sign(`m${id}`)}`;
}

/** The file behind a private link, or null when the link isn't valid (or the file is gone / the feature is off). */
export async function sharedMarketingFile(token: string) {
  const m = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{24})$/.exec(token);
  if (!m) return null;
  const want = Buffer.from(sign(`m${m[1]}`));
  const got = Buffer.from(m[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return await marketingFile(m[1]);
  } catch {
    return null;
  }
}

/** Response headers for a marketing file: HTML runs only in a sandbox (no access to the CRM), office files download. */
export function marketingHeaders(f: { fileName: string; type: string; show: "inline" | "sandbox" | "download" }, download: boolean) {
  const name = f.fileName.replace(/["\r\n]/g, "");
  return {
    "Content-Type": f.type,
    "Content-Disposition": `${download || f.show === "download" ? "attachment" : "inline"}; filename="${name}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
    ...(f.show === "sandbox" ? { "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms" } : {}),
  };
}

/* ---------- R57: design tools (ID card designer) ---------- */

/** The sales person's own leads and clients (all of them for Admin / Sales Head), to fill a design with a school's details. */
export async function designSchools(user: SessionUser) {
  await assertOn();
  const [leads, clients] = await Promise.all([
    db.lead.findMany({ where: leadScope(user), select: { id: true, schoolName: true, mobile: true, city: true, area: true, address: true }, orderBy: { schoolName: "asc" }, take: 1000 }),
    db.client.findMany({ where: clientScope(user), select: { id: true, schoolName: true, mobile: true, city: true, area: true, address: true }, orderBy: { schoolName: "asc" }, take: 1000 }),
  ]);
  const addr = (s: { city: string; area: string | null; address: string | null }) => s.address?.trim() || [s.area, s.city].filter(Boolean).join(", ");
  return [
    ...clients.map((c) => ({ key: `client:${c.id}`, label: `${c.schoolName} · client`, schoolName: c.schoolName, schoolAddress: addr(c), schoolPhone: c.mobile })),
    ...leads.map((l) => ({ key: `lead:${l.id}`, label: `${l.schoolName} · lead`, schoolName: l.schoolName, schoolAddress: addr(l), schoolPhone: l.mobile })),
  ];
}

/** The school's saved logo (R51) as a picture the designer can use, or null. Only for a lead / client the user can see. */
export async function designSchoolLogo(user: SessionUser, key: string) {
  await assertOn();
  const [kind, id] = key.split(":");
  if (!id || (kind !== "lead" && kind !== "client")) return null;
  const visible =
    kind === "lead" ? await db.lead.findFirst({ where: { id, ...leadScope(user) }, select: { id: true } }) : await db.client.findFirst({ where: { id, ...clientScope(user) }, select: { id: true } });
  if (!visible) return null;
  const l = await db.schoolLogo.findFirst({ where: kind === "lead" ? { leadId: id } : { clientId: id } });
  return l ? `data:${l.contentType};base64,${Buffer.from(l.data).toString("base64")}` : null;
}
