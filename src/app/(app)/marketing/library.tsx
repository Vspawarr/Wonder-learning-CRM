"use client";

// R53: the marketing library: browse by category, open / download, share on WhatsApp or copy the link;
// Admin / Sales Head add files or Google Drive links, edit and remove.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Modal, Options, useAction, useToast } from "@/components/client";
import { Icon } from "@/components/icons";
import { Empty } from "@/components/ui";
import { addMarketingLink, deleteMarketing, updateMarketing } from "@/app/actions";
import { MARKETING_CATEGORIES } from "@/lib/constants";
import type { listMarketing } from "@/server/marketing";

type Item = Awaited<ReturnType<typeof listMarketing>>[number];

const CAT_COLOR: Record<string, string> = {
  Presentation: "#F28C1E",
  Brochure: "#6CB33F",
  Video: "#E3262C",
  Animation: "#1FA5DE",
  "HTML file": "#6C2D91",
  PDF: "#C2417A",
  Other: "#8E80A0",
};
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function MarketingLibrary({ items, manage, accept }: { items: Item[]; manage: boolean; accept: string }) {
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [q, setQ] = useState("");
  const { pending, run } = useAction();
  const toast = useToast();
  const shown = items.filter((i) => (!cat || i.category === cat) && (!q || `${i.title} ${i.description ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const full = (i: Item) => (i.kind === "link" ? i.share : `${window.location.origin}${i.share}`);
  const whatsapp = (i: Item) => {
    const text = `${i.title}${i.description ? `\n${i.description}` : ""}\n${full(i)}\n\nWonder Learning`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const copy = async (i: Item) => {
    try {
      await navigator.clipboard.writeText(full(i));
      toast("Link copied.");
    } catch {
      toast("Couldn't copy. Open the item and copy the address instead.", true);
    }
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <input className="in w-full min-[901px]:w-auto min-[901px]:min-w-[240px]" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search marketing material" />
        <div className="chips" role="group" aria-label="Category">
          <button className={`chip ${!cat ? "on" : ""}`} onClick={() => setCat("")}>
            All · {items.length}
          </button>
          {MARKETING_CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => (
            <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
              {c} · {items.filter((i) => i.category === c).length}
            </button>
          ))}
        </div>
        {manage ? (
          <button className="btn pri ml-auto" onClick={() => setEditing("new")}>
            <Icon name="plus" size={16} /> Add material
          </button>
        ) : null}
      </div>
      {shown.length ? (
        <div className="mk-grid">
          {shown.map((i) => (
            <div key={i.id} className="card mk-card" style={{ "--c": CAT_COLOR[i.category] ?? "#6C2D91" } as React.CSSProperties}>
              <div className="mk-top">
                <span className="mk-cat">{i.category}</span>
                <span className="small faint">{i.kind === "link" ? "Drive link" : i.size ? kb(i.size) : ""}</span>
              </div>
              <h3 className="mt-2">{i.title}</h3>
              {i.description ? <p className="small muted mt-1">{i.description}</p> : null}
              <div className="small faint mt-1">
                Added by {i.by} · {new Date(i.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a className="btn sm pri" href={i.kind === "link" ? i.share : `/api/marketing/${i.id}`} target="_blank" rel="noreferrer">
                  Open
                </a>
                {i.kind === "file" && i.show !== "download" ? (
                  <a className="btn sm" href={`/api/marketing/${i.id}?download=1`}>
                    <Icon name="download" size={14} /> Download
                  </a>
                ) : null}
                <button className="btn sm" onClick={() => whatsapp(i)}>
                  <Icon name="chat" size={14} /> WhatsApp
                </button>
                <button className="btn sm ghost" onClick={() => copy(i)}>
                  Copy link
                </button>
                {manage ? (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing(i)}>
                      Edit
                    </button>
                    <button
                      className="btn sm ghost"
                      disabled={pending}
                      onClick={() => confirm(`Remove "${i.title}"? Links already sent stop working.`) && run(() => deleteMarketing(i.id), { success: "Removed." })}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty>{items.length ? "Nothing matches." : manage ? "No material yet. Add presentations, brochures, videos (as Drive links) and more." : "No material yet. Ask an Admin to add some."}</Empty>
        </div>
      )}
      {editing ? <ItemModal item={editing === "new" ? null : editing} accept={accept} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function ItemModal({ item, accept, onClose }: { item: Item | null; accept: string; onClose: () => void }) {
  const [v, setV] = useState({ title: item?.title ?? "", category: item?.category ?? "", description: item?.description ?? "", url: item?.kind === "link" ? item.share : "" });
  const [mode, setMode] = useState<"file" | "link">(item?.kind ?? "file");
  const [file, setFile] = useState<File | null>(null);
  const { pending, run } = useAction();
  const router = useRouter();
  const save = () =>
    run(
      async () => {
        if (item) return updateMarketing(item.id, v);
        if (mode === "link") return addMarketingLink(v);
        if (!file) return { ok: false as const, error: "Choose the file to upload." };
        const body = new FormData();
        body.append("file", file);
        body.append("title", v.title);
        body.append("category", v.category);
        body.append("description", v.description);
        try {
          return (await (await fetch("/api/marketing", { method: "POST", body })).json()) as { ok: true } | { ok: false; error: string };
        } catch {
          return { ok: false as const, error: "The upload failed. Check your internet connection and try again." };
        }
      },
      {
        success: item ? "Saved." : "Added.",
        onDone: () => {
          onClose();
          router.refresh();
        },
      },
    );
  return (
    <Modal
      title={item ? "Edit material" : "Add material"}
      sub={item ? undefined : "Upload a small file (up to 4 MB), or add a Google Drive link for big files such as videos."}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : item ? "Save" : "Add"}
          </button>
        </>
      }
    >
      {!item ? (
        <div className="fld">
          <label>Add as</label>
          <div className="chips">
            <button type="button" className={`chip ${mode === "file" ? "on" : ""}`} aria-pressed={mode === "file"} onClick={() => setMode("file")}>
              File upload
            </button>
            <button type="button" className={`chip ${mode === "link" ? "on" : ""}`} aria-pressed={mode === "link"} onClick={() => setMode("link")}>
              Google Drive link
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-[minmax(0,1fr)_180px]">
        <Field label="Title *" htmlFor="mk-title">
          <input className="in" id="mk-title" placeholder="e.g. Wonder Learning curriculum presentation" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Field label="Category *" htmlFor="mk-cat">
          <select className="sel" id="mk-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
            <Options list={MARKETING_CATEGORIES} blank="Choose…" />
          </select>
        </Field>
      </div>
      <Field label="Short description" htmlFor="mk-desc">
        <input className="in" id="mk-desc" placeholder="Optional: what it shows, when to use it" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      {mode === "link" ? (
        <Field label="Google Drive (or other) link *" htmlFor="mk-url">
          <input className="in" id="mk-url" inputMode="url" placeholder="https://drive.google.com/…" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
          <span className="small muted">In Drive: Share → General access → &quot;Anyone with the link&quot;, then Copy link.</span>
        </Field>
      ) : !item ? (
        <Field label="File * (PDF, PowerPoint, picture, video, HTML or ZIP · up to 4 MB)" htmlFor="mk-file">
          <input className="in" id="mk-file" type="file" accept={accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      ) : null}
    </Modal>
  );
}
