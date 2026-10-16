/**
 * Whether every open realtime scope is currently joined.
 *
 * A cached read may skip its reveal refetch only while a live channel would
 * have invalidated it. A scope that has not joined yet, or that dropped, has
 * no such guarantee until its catch-up runs, so the reveal reads instead.
 * With no open scope (signed out, or no provider), nothing covers the cache.
 */
const scopes = new Map<symbol, boolean>();

export interface RealtimeCoverageScope {
  joined(): void;
  dropped(): void;
  close(): void;
}

export function openRealtimeCoverage(): RealtimeCoverageScope {
  const token = Symbol("realtime-scope");
  scopes.set(token, false);
  return {
    joined: () => { if (scopes.has(token)) scopes.set(token, true); },
    dropped: () => { if (scopes.has(token)) scopes.set(token, false); },
    close: () => { scopes.delete(token); },
  };
}

export function realtimeCoverageLive(): boolean {
  if (scopes.size === 0) return false;
  for (const joined of scopes.values()) if (!joined) return false;
  return true;
}
