"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "./icons";

const noSubscribe = () => () => {};

/** The browser's user agent ("" while rendering on the server). */
export function useUserAgent() {
  return useSyncExternalStore(noSubscribe, () => navigator.userAgent, () => "");
}

/** True inside the Wonder CRM Android app (it adds "WonderCRMApp" to its user agent); null before the page loads. */
export function useInApp() {
  const ua = useUserAgent();
  return ua ? ua.includes("WonderCRMApp") : null;
}

/** "Download app" link; hidden inside the app itself. */
export function DownloadAppLink({ className }: { className?: string }) {
  const inApp = useInApp();
  if (inApp !== false) return null;
  return (
    <Link href="/download-app" className={className ?? "btn sm"}>
      <Icon name="download" size={14} /> Download app
    </Link>
  );
}
