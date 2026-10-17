"use client";

import { createContext, useContext, type ReactNode } from "react";

type Initial = { restaurant?: string; portal?: string };
const InitialLangCtx = createContext<Initial>({});

export function InitialLangProvider({ value, children }: { value: Initial; children: ReactNode }) {
  return <InitialLangCtx.Provider value={value}>{children}</InitialLangCtx.Provider>;
}

export const useInitialLang = () => useContext(InitialLangCtx);
