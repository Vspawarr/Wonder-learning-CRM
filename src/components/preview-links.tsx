"use client";

// R62: on phones and in the Android app, a link that opens one of the CRM's PDFs or files in a new tab (Preview PDF,
// View PO, challan, bills…) opens it in the CRM's own viewer instead of downloading it. Computers are unchanged
// (the browser shows the PDF). Links that download (download attribute or ?download=1) are left alone.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { needsViewer, safeFileSrc, viewerHref } from "@/lib/file-preview";

export function PreviewLinks() {
  const router = useRouter();
  useEffect(() => {
    if (!needsViewer(navigator.userAgent)) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target !== "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.searchParams.has("download")) return;
      const src = safeFileSrc(url.pathname + url.search);
      if (!src) return;
      e.preventDefault();
      router.push(viewerHref(src));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
  return null;
}
