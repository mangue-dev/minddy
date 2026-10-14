import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query";

/** Preference metadata stays bounded independently of query cache contents. */
export const NAVIGATION_WORKING_SET_QUERY_LIMIT = 128;

const owners = new WeakMap<QueryClient, Map<symbol, ReadonlySet<string>>>();

/** Publish exact listed query identities without creating or observing queries. */
export function createNavigationWorkingSet(client: QueryClient) {
  const identity = Symbol("navigation-working-set");
  let disposed = false;
  return {
    replace(keys: readonly QueryKey[]) {
      if (disposed) return;
      const hashes = new Set<string>();
      for (const key of keys) {
        hashes.add(hashKey(key));
        if (hashes.size >= NAVIGATION_WORKING_SET_QUERY_LIMIT) break;
      }
      let leases = owners.get(client);
      if (!leases) { leases = new Map(); owners.set(client, leases); }
      leases.set(identity, hashes);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const leases = owners.get(client);
      leases?.delete(identity);
      if (!leases?.size) owners.delete(client);
    },
  };
}

/** Return an isolated snapshot; callers cannot mutate a publisher's lease. */
export function navigationWorkingSetQueryHashes(client: QueryClient): ReadonlySet<string> {
  const hashes = new Set<string>();
  for (const lease of owners.get(client)?.values() ?? []) for (const hash of lease) hashes.add(hash);
  return hashes;
}
