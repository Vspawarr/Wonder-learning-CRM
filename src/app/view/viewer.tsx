"use client";

// R62: shows a PDF (drawn with PDF.js, page by page, sharp on any screen) or a picture, with Back, zoom and Download.
// Phones and the Android app can't display a PDF in a page; computers keep the browser's own PDF viewer.
import { useEffect, useRef, useState } from "react";

const withDownload = (src: string) => `${src}${src.includes("?") ? "&" : "?"}download=1`;

export function FileViewer({ src, name }: { src: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "pdf" | "image" | "other" | "error">("loading");
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [img, setImg] = useState<string | null>(null);
  const [title, setTitle] = useState(name);
  const doc = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);

  useEffect(() => {
    let gone = false;
    let url: string | null = null;
    (async () => {
      try {
        const res = await fetch(src, { credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const type = res.headers.get("content-type") ?? "";
        // The file's own name (Quotation-WLQ-…pdf) as the title.
        const file = /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
        if (file && name === "Preview") setTitle(file);
        const data = await res.arrayBuffer();
        if (gone) return;
        if (type.startsWith("image/")) {
          url = URL.createObjectURL(new Blob([data], { type }));
          setImg(url);
          setState("image");
          return;
        }
        if (!type.includes("pdf")) return setState("other");
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const d = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
        if (gone) return void d.destroy();
        doc.current = d;
        setPages(d.numPages);
        setState("pdf");
      } catch {
        if (!gone) setState("error");
      }
    })();
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
      void doc.current?.destroy();
      doc.current = null;
    };
  }, [src, name]);

  // Draw every page to the screen width (× zoom), sharp for the screen's pixel density.
  useEffect(() => {
    const d = doc.current;
    const el = box.current;
    if (state !== "pdf" || !d || !el) return;
    let stop = false;
    const tasks: { cancel: () => void }[] = [];
    (async () => {
      const width = (el.clientWidth - 16) * zoom;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const canvases = el.querySelectorAll("canvas");
      for (let n = 1; n <= d.numPages && !stop; n++) {
        const page = await d.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (width / base.width) * ratio });
        const c = canvases[n - 1];
        if (!c) continue;
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        c.style.width = `${Math.floor(vp.width / ratio)}px`;
        c.style.height = `${Math.floor(vp.height / ratio)}px`;
        const task = page.render({ canvasContext: c.getContext("2d")!, viewport: vp });
        tasks.push(task);
        await task.promise.catch(() => undefined);
      }
    })();
    return () => {
      stop = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [state, pages, zoom]);

  const back = () => (history.length > 1 ? history.back() : window.close());
  return (
    <div className="fixed inset-0 flex flex-col bg-[#525659]">
      <div className="flex items-center gap-2 bg-white px-3 py-2 shadow">
        <button className="btn sm" onClick={back} aria-label="Back">
          ‹ Back
        </button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</div>
        {state === "pdf" ? (
          <>
            <button className="btn sm" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
              −
            </button>
            <button className="btn sm" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
              +
            </button>
          </>
        ) : null}
        <a className="btn sm pri" href={withDownload(src)}>
          Download
        </a>
      </div>
      <div ref={box} className="flex-1 overflow-auto p-2" style={{ WebkitOverflowScrolling: "touch" }}>
        {state === "loading" ? <p className="mt-10 text-center text-white">Opening…</p> : null}
        {state === "error" ? <p className="mt-10 text-center text-white">This file couldn&apos;t be opened. Try Download.</p> : null}
        {state === "other" ? <p className="mt-10 text-center text-white">This file can&apos;t be shown here. Use Download to open it.</p> : null}
        {state === "image" && img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={title} className="mx-auto block max-w-full bg-white" style={{ width: `${zoom * 100}%` }} />
        ) : null}
        {state === "pdf"
          ? Array.from({ length: pages }, (_, i) => <canvas key={`${i}-${zoom}`} className="mx-auto mb-2 block bg-white shadow" aria-label={`Page ${i + 1}`} />)
          : null}
      </div>
    </div>
  );
}
