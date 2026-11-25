// R57: turning a design into files in the browser: PNG (picture), PDF (print size, one design per page) and sharing.
// No server and no extra libraries, so the standalone HTML designer can do the same.

/** Draws an SVG string onto a canvas at `scale` × its own size. */
export async function svgToCanvas(svg: string, width: number, height: number, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("The design couldn't be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't make the file."))), type, q));

export async function pngBlob(svg: string, w: number, h: number, scale = 2) {
  return toBlob(await svgToCanvas(svg, w, h, scale), "image/png");
}

/** A picture (JPEG) of the design, for big picture designs where a PNG would be very large. */
export async function jpegBlob(svg: string, w: number, h: number, scale = 1) {
  return toBlob(await svgToCanvas(svg, w, h, scale), "image/jpeg", 0.9);
}

/** A PDF with one page per design, each page the real card size (mm), the design filling it. */
export async function pdfBlob(svgs: string[], w: number, h: number, mm: [number, number], scale = 2) {
  // One page at a time, so big designs don't use up a phone's memory.
  const pages: { bytes: Uint8Array; pw: number; ph: number }[] = [];
  for (const s of svgs) {
    const c = await svgToCanvas(s, w, h, scale);
    pages.push({
      bytes: new Uint8Array(await (await toBlob(c, "image/jpeg", 0.92)).arrayBuffer()),
      pw: c.width,
      ph: c.height,
    });
    c.width = c.height = 0;
  }
  const pt = (v: number) => +((v / 25.4) * 72).toFixed(2);
  const [W, H] = [pt(mm[0]), pt(mm[1])];
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    chunks.push(u);
    size += u.length;
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = pages.length;
  // Objects: 1 catalog, 2 pages, then per page: page, content, image.
  const obj = (id: number, body: (string | Uint8Array)[]) => {
    offsets[id] = size;
    push(`${id} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`]);
  pages.forEach((p, i) => {
    const [pg, ct, im] = [3 + i * 3, 4 + i * 3, 5 + i * 3];
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(pg, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`]);
    obj(ct, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(im, [
      `<< /Type /XObject /Subtype /Image /Width ${p.pw} /Height ${p.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`,
      p.bytes,
      "\nendstream",
    ]);
  });
  const xref = size;
  const count = 3 + n * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";

/**
 * Shares files to WhatsApp: on phones the share sheet takes the file(s) straight to WhatsApp; on computers the
 * file is saved and WhatsApp Web opens with the message, to attach it there.
 */
export async function shareFiles(files: File[], message: string, mobile?: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files }) && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files, text: message });
      return "shared" as const;
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled" as const;
    }
  }
  for (const f of files) download(f, f.name);
  const digits = (mobile ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "91$1");
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  return "downloaded" as const;
}
