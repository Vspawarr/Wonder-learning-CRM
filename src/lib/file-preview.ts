// R62: Preview of PDFs and uploaded files on phones and in the Android app (see src/app/view/).

/** Only the CRM's own files (PDFs, uploaded pictures) can be opened in the viewer. */
export const safeFileSrc = (s: string | null | undefined) =>
  s && /^\/api\/[A-Za-z0-9/_\-.?=&%]+$/.test(s) && !s.includes("..") && !s.includes("//") ? s : null;

/** Phones and the Android app can't show a PDF inside a page (they download it), so they use the viewer page. */
export const needsViewer = (ua: string) => /WonderCRMApp|Android|iPhone|iPad|iPod/i.test(ua);

export const viewerHref = (src: string, name?: string) => `/view?src=${encodeURIComponent(src)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;
