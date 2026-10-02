"use client";

import { type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { AppQueryProvider } from "./query-provider";

export function AccountQueryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <AppQueryProvider key={user?.id ?? "signed-out"}>{children}</AppQueryProvider>;
}
