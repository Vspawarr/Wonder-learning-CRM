"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { attentionAlerts, globalSearch } from "@/app/actions";
import type { Alert, SearchHit } from "@/server/search";

const KIND_TONE: Record<SearchHit["kind"], string> = { Client: "ok", Lead: "info", Opportunity: "grape", Invoice: "warn" };

/** Search, "+ Add" and the alerts bell on the right of the top bar (as in the prototype). */
export function TopBarTools() {
  const path = usePathname();
  const [menu, setMenu] = useState<"add" | "bell" | "search" | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  // A fresh value each time, so "New lead" opens the form even when already on Leads.
  const [stamp, setStamp] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Alerts: load after the page shows, and again whenever the page changes.
  useEffect(() => {
    let live = true;
    attentionAlerts()
      .then((a) => live && setAlerts(a))
      .catch(() => live && setAlerts([]));
    return () => {
      live = false;
    };
  }, [path]);

  // Close any open menu on navigation, outside tap or Escape.
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setMenu(null);
  }
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setMenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  const n = alerts?.length ?? 0;
  return (
    <div ref={box} className="flex min-w-0 flex-1 items-center gap-2.5">
      <Search open={menu === "search"} onOpen={() => setMenu("search")} onClose={() => setMenu(null)} />
      <div className="grow" />
      <button
        className="iconbtn min-[901px]:hidden"
        aria-label="Search"
        onClick={() => setMenu(menu === "search" ? null : "search")}
      >
        <Icon name="search" />
      </button>
      <div className="relative">
        <button className="btn pri h-[38px]" aria-haspopup="menu" aria-expanded={menu === "add"} onClick={() => {
            setStamp(Date.now());
            setMenu(menu === "add" ? null : "add");
          }}>
          <Icon name="plus" size={16} />
          <span className="max-[480px]:hidden">Add</span>
        </button>
        {menu === "add" ? (
          <div className="menu w-[230px]" role="menu">
            <Link className="mi" role="menuitem" href={`/leads?new=${stamp}`}>
              <Icon name="user" /> <span>New lead</span>
            </Link>
            <Link className="mi" role="menuitem" href={`/tasks?new=${stamp}`}>
              <Icon name="check" /> <span>New to-do</span>
            </Link>
            <Link className="mi" role="menuitem" href="/pipeline">
              <Icon name="funnel" /> <span>Open the pipeline</span>
            </Link>
            <Link className="mi" role="menuitem" href="/clients">
              <Icon name="school" /> <span>Find a client</span>
            </Link>
          </div>
        ) : null}
      </div>
      <div className="relative">
        <button
          className="iconbtn"
          aria-label={`Notifications${n ? `: ${n}` : ""}`}
          aria-expanded={menu === "bell"}
          onClick={() => setMenu(menu === "bell" ? null : "bell")}
        >
          <Icon name="bell" />
          {n ? <span className="dot">{n > 9 ? "9+" : n}</span> : null}
        </button>
        {menu === "bell" ? (
          <div className="menu">
            <h4>Needs attention</h4>
            {alerts === null ? (
              <div className="empty">Checking…</div>
            ) : alerts.length ? (
              alerts.map((a, i) => (
                <Link key={i} className="mi" href={a.href}>
                  <span className={`ati ${a.tone}`}>
                    <Icon name={a.icon} size={15} />
                  </span>
                  <span>{a.text}</span>
                </Link>
              ))
            ) : (
              <div className="empty">All clear. Nothing needs you right now.</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Search({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      globalSearch(q)
        .then((h) => {
          if (!live) return;
          setHits(h);
          setActive(0);
        })
        .catch(() => live && setHits([]));
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  // On phones the box appears only after tapping the search icon; focus it then.
  useEffect(() => {
    if (open && matchMedia("(max-width: 900px)").matches) input.current?.focus();
  }, [open]);

  const go = (h: SearchHit) => {
    onClose();
    setQ("");
    setHits(null);
    router.push(h.href);
  };
  const shown = q.trim().length >= 2 ? hits : null;

  return (
    <div className={`search ${open ? "open" : ""}`}>
      <span className="sic">
        <Icon name="search" size={16} />
      </span>
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onOpen();
        }}
        onFocus={onOpen}
        onKeyDown={(e) => {
          if (!shown?.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") go(shown[active]);
        }}
        placeholder="Search schools, leads, invoices"
        aria-label="Search schools, leads, invoices"
        autoComplete="off"
        enterKeyHint="search"
      />
      {open && shown ? (
        <div className="results" role="listbox">
          {shown.length ? (
            shown.map((h, i) => (
              <button key={h.kind + h.href + h.title} role="option" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => go(h)}>
                <span className={`pill ${KIND_TONE[h.kind]}`}>{h.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{h.title}</span>
                  <span className="small muted block truncate">{h.sub}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="empty">Nothing found for “{q.trim()}”.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
