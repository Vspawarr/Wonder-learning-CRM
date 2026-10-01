"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo, Icon, type IconName } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { DownloadAppLink } from "@/components/app-download";
import { logout } from "@/app/actions";
import { PasswordButton } from "./password-button";

export type NavGroup = { group: string; items: { href: string; label: string; icon: IconName; badge?: number }[] };

export function Shell({
  nav,
  user,
  children,
}: {
  nav: NavGroup[];
  user: { id: string; name: string; role: string };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const title = nav.flatMap((g) => g.items).find((i) => path.startsWith(i.href))?.label ?? "";

  return (
    <div className="grid grid-cols-1 min-[901px]:h-full min-[901px]:grid-cols-[250px_minmax(0,1fr)]">
      {open ? <div className="fixed inset-0 z-30 bg-black/40 min-[901px]:hidden" onClick={() => setOpen(false)} /> : null}
      <aside
        className={`side fixed inset-y-0 z-40 flex w-[270px] flex-col gap-1.5 overflow-y-auto px-3 pt-[18px] pb-6 transition-[left] duration-200 min-[901px]:static min-[901px]:w-auto ${
          open ? "left-0" : "-left-[290px]"
        }`}
      >
        <div className="px-2 pt-1 pb-4">
          <BrandLogo width={176} priority />
          <span className="mt-1 block pl-1 text-[11.5px] text-[#9e9bd0]">Sales CRM</span>
        </div>
        {nav.map((g) => (
          <div key={g.group}>
            <div className="ngroup">{g.group}</div>
            {g.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={`nav ${path.startsWith(i.href) ? "on" : ""}`}
                onClick={() => setOpen(false)}
              >
                <Icon name={i.icon} />
                <span>{i.label}</span>
                {i.badge ? <span className="badge">{i.badge}</span> : null}
              </Link>
            ))}
          </div>
        ))}
        <div className="mt-auto px-2 pb-3">
          <DownloadAppLink className="btn sm w-full justify-center border-[#3a3680] bg-[#26225a] text-white no-underline hover:text-white" />
        </div>
        <div className="border-t border-white/10 px-2 pt-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar id={user.id} name={user.name} size={34} />
            <div className="min-w-0">
              <div className="truncate font-semibold text-white">{user.name}</div>
              <div className="small text-[#9e9bd0]">{user.role}</div>
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <PasswordButton />
            <form action={logout} className="flex-1">
              <button className="btn sm w-full justify-center border-[#3a3680] bg-[#26225a] text-white hover:text-white">
                <Icon name="logout" size={14} /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      {/* Phones scroll the whole page (not an inner box) so the browser bars and keyboard behave and taps land where they look. */}
      <div className="relative min-w-0 min-[901px]:overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg px-3.5 py-2.5 min-[901px]:px-7 min-[901px]:py-3">
          <button
            className="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-line bg-surf min-[901px]:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <h1 className="text-[20px]">{title}</h1>
        </header>
        <main className="max-w-[1520px] px-3.5 pt-4 pb-[70px] min-[901px]:px-7 min-[901px]:pt-[22px]">{children}</main>
      </div>
    </div>
  );
}
