"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PrEndpoint } from "@/lib/agent-api";

/**
 * What pull request is this piece of screen talking about? Nothing, anywhere else.
 *
 * Two needs gave rise to it, and they ask the same question (MIN-162):
 *
 * · **images.** A capture pasted into a forge comment is not
 * serverable as is — its URL requires a session GitHub that minddy doesn't have
 *, and you have to proxy it through SA pull request
 * (`lib/forge-image-assets`);
 * · **compose it.** Mention a forge account and attach a file
 * both request the routes of THIS pull request.
 *
 * A context rather than a prop because these surfaces are many and
 * deep — PR body, thread messages, activity, line remarks and
 * their responses, all the way to the bottom of the diff view — and because the response is the
 * same for all of them: that of the panel, not that of the component. A single
 * wraps, and the next surface will have it without wiring anything.
 *
 * The value is a `PrEndpoint` and not an id: the diff view of an agent session
 * passes through the `agent-runs/[runId]/pr/*` facades, and this is what gives it
 * exactly the same composition as the PR panel.
 */
const PrEndpointContext = createContext<PrEndpoint | null>(null);

export function PrEndpointProvider({
  endpoint,
  children,
}: {
  endpoint: PrEndpoint;
  children: ReactNode;
}) {
  return (
    <PrEndpointContext.Provider value={endpoint}>{children}</PrEndpointContext.Provider>
  );
}

/** `null` out of a pull request view — a ticket comment does not have one. */
export function usePrEndpoint(): PrEndpoint | null {
  return useContext(PrEndpointContext);
}
