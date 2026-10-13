import { hashKey, type Query, type QueryClient } from "@tanstack/react-query";

type Priority = { owners: Set<object>; reads: Map<object, readonly unknown[]>; listeners: Set<() => void> };
const priorities = new WeakMap<QueryClient, Priority>();

/** A displayed tab list's reconciliation does not block the active view's data. */
export function isCachedTabReconciliation(query: Pick<Query, "queryKey" | "state">): boolean {
  return query.queryKey[0] === "app-tabs" && query.state.status === "success" && query.state.data !== undefined;
}
function priority(client: QueryClient) {
  let state = priorities.get(client);
  if (!state) { state = { owners: new Set(), reads: new Map(), listeners: new Set() }; priorities.set(client, state); }
  return state;
}

/** Open navigation prerequisites precede optional auxiliary preparation. */
export function navigationPreparationPending(client: QueryClient): boolean {
  return !!priorities.get(client)?.owners.size;
}

/** Exact inactive speculation may share transport; an enabled observer cannot. */
export function navigationPreparationOwnsRead(client: QueryClient, key: readonly unknown[]): boolean {
  const state = priorities.get(client);
  return !!state && [...state.reads.values()].some((read) => hashKey(read) === hashKey(key)) &&
    client.getQueryCache().find({ queryKey: key, exact: true })?.isActive() === false;
}

export function navigationPreparationHasRead(client: QueryClient): boolean {
  return [...(priorities.get(client)?.reads.values() ?? [])].some((key) => navigationPreparationOwnsRead(client, key));
}

export function subscribeNavigationPreparation(client: QueryClient, listener: () => void) {
  const state = priority(client);
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}

/** An account-owned pass releases its priority without granting data authority. */
export function navigationPreparationPriority(client: QueryClient) {
  const state = priority(client), owner = {};
  const notify = () => { for (const listener of Array.from(state.listeners)) listener(); };
  return {
    acquire() { if (!state.owners.has(owner)) { state.owners.add(owner); notify(); } },
    startRead(key: readonly unknown[]) { if (state.owners.has(owner)) { state.reads.set(owner, key); notify(); } },
    finishRead(key: readonly unknown[]) { if (state.reads.get(owner) === key) { state.reads.delete(owner); notify(); } },
    release() { state.reads.delete(owner); if (state.owners.delete(owner)) notify(); },
  };
}
