"use client";

import { createContext, useContext } from "react";
import { DEFAULT_FEATURES, type Features } from "@/lib/features";

/** Who is signed in and which optional features are on, for client components. */
export type AppInfo = { userId: string; name: string; canFinance: boolean; seesAll: boolean; features: Features };

const Ctx = createContext<AppInfo>({ userId: "", name: "", canFinance: false, seesAll: false, features: DEFAULT_FEATURES });

export function AppProvider({ value, children }: { value: AppInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
