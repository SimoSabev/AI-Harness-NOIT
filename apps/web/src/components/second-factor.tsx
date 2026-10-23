"use client";
import { createContext, useContext } from "react";

// D-368: in `pnpm local` (no login) an approval is a click — the server asks no code, so the forms show no code field.
const NeedsCode = createContext(true);

export function SecondFactorProvider({ needsCode, children }: { needsCode: boolean; children: React.ReactNode }) {
  return <NeedsCode.Provider value={needsCode}>{children}</NeedsCode.Provider>;
}

export const useNeedsCode = () => useContext(NeedsCode);
