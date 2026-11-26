// R62: Preview of PDFs and uploaded files on phones and in the Android app (see src/app/view/).

/** Only the CRM's own files (PDFs, uploaded pictures) can be opened in the viewer. */
export const safeFileSrc = (s: string | null | undefined) =>
  s && /^\/api\/[A-Za-z0-9/_\-.?=&%]+$/.test(s) && !s.includes("..") && !s.includes("//") ? s : null;

/** Phones and the Android app can't show a PDF inside a page (they download it), so they use the viewer page. */
export const needsViewer = (ua: string) => /WonderCRMApp|Android|iPhone|iPad|iPod/i.test(ua);

export const viewerHref = (src: string, name?: string) => `/view?src=${encodeURIComponent(src)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;

/**
 * The CRM files a person previews (PDFs and uploaded files); not exports, templates or backups, which are downloads.
 * Opened as a page on a phone, these go to the viewer (src/auth.ts), even when the phone still has old code loaded.
 */
export const PREVIEWABLE =
  /^\/api\/(quotations\/[^/]+\/(pdf|po-template|received-po)|quotations\/sample|sales-orders\/[^/]+\/(po|proforma)|invoices\/[^/]+\/pdf|credit-notes\/[^/]+\/pdf|payments\/[^/]+\/receipt|dispatches\/[^/]+\/challan|products\/checklist|files\/[^/]+|company\/files\/[^/]+\/[^/]+|expenses\/files\/[^/]+|marketing\/[^/]+)$/;
