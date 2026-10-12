import type { QueryClient } from "@tanstack/react-query";

type Priority = { owners: Set<object>; listeners: Set<() => void> };
const priorities = new WeakMap<QueryClient, Priority>();
function priority(client: QueryClient) {
  let state = priorities.get(client);
  if (!state) { state = { owners: new Set(), listeners: new Set() }; priorities.set(client, state); }
  return state;
}

/** Open navigation prerequisites precede optional auxiliary preparation. */
export function navigationPreparationPending(client: QueryClient): boolean {
  return !!priorities.get(client)?.owners.size;
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
    release() { if (state.owners.delete(owner)) notify(); },
  };
}
