"use client";

import { type ReactNode, useState } from "react";
import { useAuth } from "./auth-context";
import { AppQueryProvider } from "./query-provider";

export type AccountCacheScope = {
  /** React key of the query provider: a new value discards the whole cache. */
  key: string;
  /** Account the mounted cache belongs to; `undefined` until auth first resolves. */
  owner: string | null | undefined;
};

export const INITIAL_ACCOUNT_CACHE_SCOPE: AccountCacheScope = { key: "initial", owner: undefined };

/**
 * The cache mounted before auth resolves was filled with the same session
 * cookie that auth then resolves, so the first resolution adopts it instead of
 * remounting the tree and repeating every startup request. Any later identity
 * change (sign-out, account switch, recovery to another user) still gets a
 * fresh provider so one account's data never renders under another.
 */
export function nextAccountCacheScope(
  scope: AccountCacheScope,
  loading: boolean,
  userId: string | null,
): AccountCacheScope {
  if (scope.owner === undefined) return loading ? scope : { key: scope.key, owner: userId };
  if (scope.owner === userId) return scope;
  return { key: userId ?? "signed-out", owner: userId };
}

export function AccountQueryProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [scope, setScope] = useState(INITIAL_ACCOUNT_CACHE_SCOPE);
  const next = nextAccountCacheScope(scope, loading, user?.id ?? null);
  // Derived state: React re-renders immediately without committing the stale key.
  if (next !== scope) setScope(next);
  return <AppQueryProvider key={next.key}>{children}</AppQueryProvider>;
}
