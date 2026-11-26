"use client";

// R62: the Android app (and a phone browser left open) keeps the CRM loaded for days, so after an update it would keep
// running the old screens. This checks the live version when the CRM comes back on screen and every 10 minutes; when
// a newer one is live it reloads: at once if the screen is just coming back and no pop-up is open, otherwise on the
// next move to another page (never in the middle of typing).
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const KEY = "wl-reloaded-for";

/** Reload once per new version: if the page still isn't the new one afterwards (an update still rolling out), stop. */
function reloadFor(build: string) {
  try {
    if (sessionStorage.getItem(KEY) === build) return;
    sessionStorage.setItem(KEY, build);
  } catch {
    // no storage: reload anyway, the version check below stops repeats only within this page
  }
  window.location.reload();
}

export function VersionWatch() {
  const pathname = usePathname();
  const stale = useRef<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!MINE) return;
    const check = async (resumed: boolean) => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return;
        const { build } = (await r.json()) as { build?: string };
        if (!build || build === MINE) return;
        stale.current = build;
        if (resumed && !document.querySelector('[role="dialog"]')) reloadFor(build);
      } catch {
        // offline: try again later
      }
    };
    const onShow = () => document.visibilityState === "visible" && check(true);
    document.addEventListener("visibilitychange", onShow);
    const t = setInterval(() => check(false), 10 * 60_000);
    void check(true);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      clearInterval(t);
    };
  }, []);

  // Moved to another page while an update is waiting: load the new version there.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (stale.current) reloadFor(stale.current);
  }, [pathname]);
  return null;
}
