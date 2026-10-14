"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * Startup admission for auxiliary chrome reads (badges, usage meter, model
 * catalog…). At load, roughly twenty reads start together and the tab list
 * that decides the restored destination waits behind them. Reads that opt in
 * stay disabled until restoration has chosen its tab, so the destination
 * starts sooner. The gate opens once per QueryClient and never closes again:
 * later mounts are never delayed. A deadline guarantees no read waits forever
 * when no tab session is mounted or restoration stalls.
 *
 * Only defer reads that are not a page's main content: a page loaded directly
 * must not wait for the tab list.
 */
export const STARTUP_READ_DEADLINE_MS = 2_000;

type Gate = { open: boolean; listeners: Set<() => void>; timer?: ReturnType<typeof setTimeout> };
const gates = new WeakMap<QueryClient, Gate>();

function gateOf(client: QueryClient): Gate {
  let gate = gates.get(client);
  if (!gate) {
    gate = { open: false, listeners: new Set() };
    gates.set(client, gate);
    if (typeof window !== "undefined") {
      gate.timer = setTimeout(() => openStartupReads(client), STARTUP_READ_DEADLINE_MS);
    }
  }
  return gate;
}

/** Restoration chose its tab, failed, or has nothing to restore. Idempotent. */
export function openStartupReads(client: QueryClient): void {
  const gate = gateOf(client);
  if (gate.open) return;
  gate.open = true;
  clearTimeout(gate.timer);
  for (const listener of Array.from(gate.listeners)) listener();
}

export function startupReadsAdmitted(client: QueryClient): boolean {
  return gateOf(client).open;
}

/** `enabled` input for an auxiliary read; false on the server and until the gate opens. */
export function useStartupReadsAdmitted(): boolean {
  const client = useQueryClient();
  return useSyncExternalStore(
    (listener) => {
      const gate = gateOf(client);
      gate.listeners.add(listener);
      return () => { gate.listeners.delete(listener); };
    },
    () => gateOf(client).open,
    () => false,
  );
}
