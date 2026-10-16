"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuthSessionSummary } from "./types";

export const authSessionsQueryKey = ["auth-sessions"] as const;

async function fetchAuthSessions(): Promise<AuthSessionSummary[]> {
  const response = await fetch("/api/account/sessions");
  if (!response.ok) throw new Error(`sessions_${response.status}`);
  const { sessions } = (await response.json()) as { sessions: AuthSessionSummary[] };
  return sessions;
}

/** The account's live sessions, listed in Security settings. */
export function useAuthSessionsQuery() {
  const { data, isPending, isError } = useQuery({
    queryKey: authSessionsQueryKey,
    queryFn: fetchAuthSessions,
  });
  return { sessions: data ?? [], loading: isPending, failed: isError };
}

/** Ends one other session of the account. */
export async function revokeAuthSessionApi(sessionId: string): Promise<void> {
  const response = await fetch(`/api/account/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`revoke_${response.status}`);
}
