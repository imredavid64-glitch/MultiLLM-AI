"use client";

import { useState, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "react-query";

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
