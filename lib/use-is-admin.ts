"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth-context";

/**
 * Client-side admin flag — the single source for gating admin-only UI (the
 * account-menu "Admin dashboard" entry). Resolves via `GET /api/me/admin`,
 * which evaluates the server-only `ADMIN_EMAILS` allowlist the client can't see.
 * Cached per user; the answer changes rarely, so a long staleTime is fine.
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["is-admin", user?.id ?? null],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ isAdmin: boolean }> => {
      const res = await fetch("/api/me/admin");
      if (!res.ok) return { isAdmin: false };
      return res.json();
    },
  });

  return data?.isAdmin === true;
}
