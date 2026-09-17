"use client";

import { createContext, useContext, ReactNode } from "react";

const AppwriteContext = createContext<{
  client: unknown;
  account: unknown;
} | null>(null);

export function AppwriteProvider({ children }: { children: ReactNode }) {
  return (
    <AppwriteContext.Provider value={{ client: null, account: null }}>
      {children}
    </AppwriteContext.Provider>
  );
}

export const useAppwrite = () => {
  const context = useContext(AppwriteContext);
  if (!context) {
    throw new Error("useAppwrite must be used within AppwriteProvider");
  }
  return context;
};
