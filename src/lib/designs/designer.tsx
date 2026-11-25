"use client";

// R57: the design generator. The sales person fills in (or picks) the school's details, presses Generate and a pop-up
// shows every design with them; one tap opens a design large to download (PNG / print-size PDF) or share on WhatsApp.
// Self-contained (own styles, no CRM code), so the same component runs in the CRM and in the standalone HTML file.
import { useEffect, useMemo, useState } from "react";
import { DESIGN_KINDS } from "./id-cards";
import { SAMPLE_CARD, type CardData } from "./sample";
import { download, fileSafe, pdfBlob, pngBlob, shareFiles } from "./export";

export type School = { key: string; label: string; schoolName: string; schoolAddress: string; schoolPhone: string };

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Reads a picture and makes it small enough for a design (long side `max` px), as a data URL. */
function readPicture(file: File, max: number): Promise<string> {
  return new Promise((ok, fail) => {
    if (!/^image\//.test(file.type)) return fail(new Error("Please choose a picture (PNG or JPG)."));
    const r = new FileReader();
    r.onerror = () => fail(new Error("Couldn't read the picture."));
    r.onload = () => {
      const src = String(r.result);
      if (file.type === "image/svg+xml") return ok(src);
      const img = new Image();
      img.onerror = () => fail(new Error("Couldn't read the picture."));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        // PNG keeps a logo's see-through background; photos are smaller as JPG.
        ok(file.type === "image/png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.9));
      };
      img.src = src;
    };
    r.readAsDataURL(file);
  });
}

type Props = {
  /** CRM: the user's leads / clients to fill the school details from. */
  schools?: School[];
  /** CRM: the school's saved logo (data URL) or null. */
  loadLogo?: (key: string) => Promise<string | null>;
};

export function Designer({ schools, loadLogo }: Props) {
  const [kindId, setKindId] = useState(DESIGN_KINDS[0].id);
  const kind = DESIGN_KINDS.find((k) => k.id === kindId) ?? DESIGN_KINDS[0];
  const [d, setD] = useState<CardData>(SAMPLE_CARD);
  const [school, setSchool] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [shown, setShown] = useState<CardData | null>(null);
  const set = (k: keyof CardData) => (e: React.ChangeEvent<HTMLInputElement>) => setD((p) => ({ ...p, [k]: e.target.value }));
  const say = (text: string, bad = false) => setMsg({ text, bad });

  const pick = async (key: string) => {
    setSchool(key);
    const s = schools?.find((x) => x.key === key);
    if (!s) return;
    setD((p) => ({ ...p, schoolName: s.schoolName, schoolAddress: s.schoolAddress, schoolPhone: s.schoolPhone }));
    const logo = loadLogo ? await loadLogo(key).catch(() => null) : null;
    setD((p) => ({ ...p, logo }));
    say(logo ? "School details and saved logo filled in." : "School details filled in. No logo saved for this school yet: upload one below.");
  };

  const upload = (k: "logo" | "photo") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return say("That picture is too big (over 15 MB).", true);
    try {
      const url = await readPicture(f, k === "logo" ? 600 : 700);
      setD((p) => ({ ...p, [k]: url }));
      setMsg(null);
    } catch (err) {
      say((err as Error).message, true);
    }
  };

  const generate = () => {
    if (!d.schoolName.trim()) return say("Enter the school's name first.", true);
    setMsg(null);
    setShown({ ...d });
  };

  return (
    <div className="idd">
      <style>{CSS}</style>
      <div className="idd-form">
        {DESIGN_KINDS.length > 1 ? (
          <label className="idd-f">
            <span>Design</span>
            <select value={kindId} onChange={(e) => setKindId(e.target.value)}>
              {DESIGN_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <section>
          <h3>School</h3>
          {schools?.length ? (
            <label className="idd-f">
              <span>Fill from a lead or client (optional)</span>
              <select value={school} onChange={(e) => pick(e.target.value)}>
                <option value="">Choose a school…</option>
                {schools.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="idd-pic">
            <Thumb src={d.logo} label="Logo" />
            <div className="idd-picb">
              <label className="idd-btn">
                {d.logo ? "Change logo" : "Upload logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={upload("logo")} hidden />
              </label>
              {d.logo ? (
                <button type="button" className="idd-link" onClick={() => setD((p) => ({ ...p, logo: null }))}>
                  Remove
                </button>
              ) : (
                <small>Without a logo the school&apos;s initials are shown.</small>
              )}
            </div>
          </div>
          <label className="idd-f">
            <span>School name</span>
            <input value={d.schoolName} onChange={set("schoolName")} maxLength={60} />
          </label>
          <div className="idd-2">
            <label className="idd-f">
              <span>Address</span>
              <input value={d.schoolAddress} onChange={set("schoolAddress")} maxLength={80} />
            </label>
            <label className="idd-f">
              <span>Phone</span>
              <input value={d.schoolPhone} onChange={set("schoolPhone")} maxLength={30} inputMode="tel" />
            </label>
          </div>
        </section>

        <section>
          <h3>Sample student</h3>
          <div className="idd-pic">
            <Thumb src={d.photo} label="Photo" />
            <div className="idd-picb">
              <label className="idd-btn">
                {d.photo ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload("photo")} hidden />
              </label>
              {d.photo ? (
                <button type="button" className="idd-link" onClick={() => setD((p) => ({ ...p, photo: null }))}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <div className="idd-2">
            <label className="idd-f">
              <span>Name</span>
              <input value={d.studentName} onChange={set("studentName")} maxLength={40} />
            </label>
            <label className="idd-f">
              <span>Class</span>
              <input value={d.className} onChange={set("className")} maxLength={20} />
            </label>
            <label className="idd-f">
              <span>Date of birth</span>
              <input value={d.dob} onChange={set("dob")} maxLength={20} />
            </label>
            <label className="idd-f">
              <span>Parent&apos;s mobile</span>
              <input value={d.mobile} onChange={set("mobile")} maxLength={20} inputMode="tel" />
            </label>
          </div>
          <label className="idd-f">
            <span>Home address</span>
            <input value={d.homeAddress} onChange={set("homeAddress")} maxLength={70} />
          </label>
          <button type="button" className="idd-link" onClick={() => setD((p) => ({ ...SAMPLE_CARD, schoolName: p.schoolName, schoolAddress: p.schoolAddress, schoolPhone: p.schoolPhone, logo: p.logo }))}>
            Use the sample student again
          </button>
        </section>

        {msg ? <p className={`idd-msg ${msg.bad ? "bad" : ""}`}>{msg.text}</p> : null}
        <button type="button" className="idd-go" onClick={generate}>
          Generate designs
        </button>
      </div>
      {shown ? <Gallery kind={kind} data={shown} onClose={() => setShown(null)} /> : null}
    </div>
  );
}

function Thumb({ src, label }: { src: string | null; label: string }) {
  return (
    <div className="idd-thumb" aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={label} /> : <span>{label}</span>}
    </div>
  );
}

type Kind = (typeof DESIGN_KINDS)[number];

function Gallery({ kind, data, onClose }: { kind: Kind; data: CardData; onClose: () => void }) {
  const rendered = useMemo(() => kind.designs.map((x) => ({ ...x, svg: x.render(data) })), [kind, data]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (open !== null ? setOpen(null) : onClose());
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const base = `${fileSafe(data.schoolName)}-${kind.id}`;
  const act = async (what: string, fn: () => Promise<void | string>) => {
    setBusy(what);
    setNote("");
    try {
      const r = await fn();
      if (r) setNote(r);
    } catch (e) {
      setNote((e as Error).message || "Something went wrong.");
    } finally {
      setBusy("");
    }
  };
  const cur = open !== null ? rendered[open] : null;
  const share = (x: (typeof rendered)[number]) =>
    act("share", async () => {
      const file = new File([await pngBlob(x.svg, kind.width, kind.height)], `${base}-${x.id}.png`, { type: "image/png" });
      const r = await shareFiles([file], `${kind.name} design for ${data.schoolName}, from Wonder Learning.`);
      return r === "downloaded" ? "The picture is saved: attach it in the WhatsApp chat that opened." : "";
    });

  return (
    <div className="idd-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="idd-modal" role="dialog" aria-modal="true" aria-label={`${kind.name} designs`}>
        <div className="idd-mh">
          <div>
            <h2>{cur ? cur.name : `${kind.name} designs`}</h2>
            <p>{cur ? data.schoolName : `${rendered.length} designs for ${data.schoolName}. Tap one to see it large.`}</p>
          </div>
          <button type="button" className="idd-x" aria-label={cur ? "Back to all designs" : "Close"} onClick={() => (cur ? setOpen(null) : onClose())}>
            {cur ? "‹ All" : "✕"}
          </button>
        </div>
        <div className="idd-mb">
          {cur ? (
            <div className="idd-big">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={svgUrl(cur.svg)} alt={`${cur.name} design`} />
              <div className="idd-nav">
                <button type="button" className="idd-btn" disabled={open === 0} onClick={() => setOpen((o) => (o ?? 1) - 1)}>
                  ‹ Previous
                </button>
                <span>
                  {open! + 1} / {rendered.length}
                </span>
                <button type="button" className="idd-btn" disabled={open === rendered.length - 1} onClick={() => setOpen((o) => (o ?? -1) + 1)}>
                  Next ›
                </button>
              </div>
            </div>
          ) : (
            <div className="idd-grid">
              {rendered.map((x, i) => (
                <button type="button" key={x.id} className="idd-card" onClick={() => setOpen(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={svgUrl(x.svg)} alt={`${x.name} design`} loading="lazy" />
                  <span>
                    <i style={{ background: `linear-gradient(90deg, ${x.colors.join(",")})` }} />
                    {x.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="idd-mf">
          {note ? <p className="idd-msg">{note}</p> : null}
          {cur ? (
            <>
              <button type="button" className="idd-btn" disabled={!!busy} onClick={() => act("png", async () => download(await pngBlob(cur.svg, kind.width, kind.height), `${base}-${cur.id}.png`))}>
                {busy === "png" ? "Making…" : "Download PNG"}
              </button>
              <button type="button" className="idd-btn" disabled={!!busy} onClick={() => act("pdf", async () => download(await pdfBlob([cur.svg], kind.width, kind.height, kind.mm), `${base}-${cur.id}.pdf`))}>
                {busy === "pdf" ? "Making…" : "Download PDF"}
              </button>
              <button type="button" className="idd-btn wa" disabled={!!busy} onClick={() => share(cur)}>
                {busy === "share" ? "Preparing…" : "Share on WhatsApp"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="idd-btn"
              disabled={!!busy}
              onClick={() => act("all", async () => download(await pdfBlob(rendered.map((x) => x.svg), kind.width, kind.height, kind.mm), `${base}-all-designs.pdf`))}
            >
              {busy === "all" ? "Making the PDF…" : "Download all designs (PDF)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.idd{--b:var(--brand,#6C2D91);--ink:var(--ink-1,#2a2233);--mut:#6b6377;--line:#e6e0ee;font:inherit;color:var(--ink)}
.idd *{box-sizing:border-box}
.idd-form{display:flex;flex-direction:column;gap:14px;max-width:760px}
.idd section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px}
.idd h3{margin:0;font-size:16px;font-weight:700;color:var(--b)}
.idd-f{display:flex;flex-direction:column;gap:5px;min-width:0}
.idd-f span{font-size:13px;font-weight:600;color:var(--mut)}
.idd-f input,.idd-f select{width:100%;min-height:42px;border:1px solid #d5cde0;border-radius:10px;padding:8px 11px;font:inherit;font-size:15px;background:#fff;color:inherit}
.idd-f input:focus,.idd-f select:focus{outline:2px solid color-mix(in srgb,var(--b) 35%,transparent);border-color:var(--b)}
.idd-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.idd-pic{display:flex;align-items:center;gap:14px}
.idd-picb{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.idd-picb small{color:var(--mut);font-size:12px}
.idd-thumb{width:72px;height:72px;border-radius:14px;border:1px dashed #cbbfdc;background:#faf7fd;display:grid;place-items:center;overflow:hidden;flex:none}
.idd-thumb img{width:100%;height:100%;object-fit:contain}
.idd-thumb span{font-size:12px;color:var(--mut)}
.idd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:8px 16px;border-radius:999px;border:1px solid #d5cde0;background:#fff;color:var(--ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.idd-btn:hover{border-color:var(--b);color:var(--b)}
.idd-btn:disabled{opacity:.5;cursor:default}
.idd-btn.wa{background:#25D366;border-color:#25D366;color:#fff}
.idd-link{background:none;border:0;padding:4px 0;color:var(--b);font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-align:left;align-self:flex-start}
.idd-go{min-height:50px;border:0;border-radius:999px;background:var(--b);color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px color-mix(in srgb,var(--b) 35%,transparent)}
.idd-go:hover{filter:brightness(1.08)}
.idd-msg{margin:0;font-size:14px;color:#2f6b1e}
.idd-msg.bad{color:#b3261e}
.idd-scrim{position:fixed;inset:0;z-index:100;background:rgba(30,16,44,.55);display:flex;align-items:center;justify-content:center;padding:24px}
.idd-modal{background:#fff;border-radius:20px;width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.idd-mh{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)}
.idd-mh h2{margin:0;font-size:19px}
.idd-mh p{margin:3px 0 0;color:var(--mut);font-size:14px}
.idd-x{border:1px solid var(--line);background:#fff;border-radius:999px;min-width:42px;height:42px;padding:0 12px;font:inherit;font-weight:600;cursor:pointer;color:inherit;white-space:nowrap}
.idd-mb{overflow:auto;padding:18px 20px;flex:1;min-height:0}
.idd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.idd-card{border:1px solid var(--line);background:#faf8fc;border-radius:14px;padding:10px;cursor:pointer;display:flex;flex-direction:column;gap:8px;font:inherit;color:inherit;text-align:left}
.idd-card:hover{border-color:var(--b);box-shadow:0 4px 14px rgba(108,45,145,.15)}
.idd-card img{width:100%;aspect-ratio:1374/868;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);background:#fff}
.idd-card span{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.idd-card i{width:28px;height:10px;border-radius:5px;flex:none}
.idd-big{display:flex;flex-direction:column;align-items:center;gap:14px}
.idd-big img{width:100%;max-width:820px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18)}
.idd-nav{display:flex;align-items:center;gap:14px;font-size:14px;color:var(--mut)}
.idd-mf{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;align-items:center;padding:14px 20px;border-top:1px solid var(--line)}
.idd-mf .idd-msg{flex-basis:100%;text-align:right}
@media (max-width:600px){
  .idd-2{grid-template-columns:1fr}
  .idd-scrim{padding:0;align-items:flex-end}
  .idd-modal{border-radius:20px 20px 0 0;max-height:94vh}
  .idd-mh,.idd-mb,.idd-mf{padding-left:14px;padding-right:14px}
  .idd-grid{grid-template-columns:1fr}
  .idd-mf .idd-btn{flex:1 1 100%}
  .idd-mf .idd-msg{text-align:left}
}
`;
