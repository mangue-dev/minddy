"use client";

import { useSyncExternalStore } from "react";

/**
 * “Optimistic” draft of agent launch, posed by a “Launch a
 * agent” button (exit panel, card — or the NOTEBOOK, MIN-84, or an integration wizard
 *) then read by the Agents page. He carries just enough to OPEN the
 * good shutter and start the conversation in composition. Purely UI: if
 * the user never sends the 1st message, it is deleted without any run
 * having existed — and without any entry having ever appeared in the list, which
 * only shows actual conversations.
 *
 * Two forms: `issue` (anchored to a ticket, `?compose=<issueId>`) and `free`
 * (conversation WITHOUT ticket — the project is chosen in the composer or arrives
 * pre-chosen, `?compose=new`). The blank conversation of the Agents page, it,
 * poses NO draft: it is its default view, there is nothing to pre-write.
 *
 * Store module-level (no context): it only has one producer at a time and
 * only one consumer (the page), and must survive to navigate `router.push`
 * between the two — something a local React state would not do.
 */
/**
 * What we ask of the agent, from the point of view of the TICKET — not the prompt, which
 * the user can rewrite. Only `implement` STARTS the ticket; the
 * two others leave it exactly where it is:
 * • `plan` — frame (write or check the plan): planning is not
 * starting the work (same rule as the copied prompt, which only auto-starts
 * on the “implement” branch) ;
 * • `verify` — reread an already done implementation: the ticket is beyond
 * work, not before. Replaying it “in progress” would REGRESS a ticket in
 * review — but we are only checking it.
 * • `custom` — instructions written by the user: we do not know what it
 * is asking (explore, correct a detail, reread), so we do not assume que
 * the work begins and we leave the ticket exactly where it is.
 */
export type AgentComposeIntent = "implement" | "plan" | "verify" | "custom";

export interface AgentIssueComposeDraft {
  kind: "issue";
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  projectId: string;
  projectKey: string;
  /**
 * Pre-written prompt that initiates the composer (implementation request tailored to
 * effort / outcome plan, ALREADY located — see `agentLaunchPromptVariant`).
 * Editable before sending; emptied if it is never sent, like the rest of the draft.
 */
  prompt: string;
  /** Default: `implement` (launch starts the ticket). */
  intent?: AgentComposeIntent;
}

export interface AgentFreeComposeDraft {
  kind: "free";
  /**
 * PRE-WRITTEN text of the composer, editable before sending: a notebook note
 * (MIN-84), an integration prompt. A conversation that starts from scratch leaves
 * no draft at all — this is the default view on the Agents page.
 */
  prompt: string;
  /**
 * PRE-CHOSEN project in the composer, when the draft producer knows
 * already which repository is targeted — the feedback integration prompt starts from the
 * settings of ONE project. Absent (the notebook): composing it allows you to choose. Rest
 * freely editable: it's a prefill, not a lock.
 */
  projectId?: string;
}

export type AgentComposeDraft = AgentIssueComposeDraft | AgentFreeComposeDraft;

/** Value of the `?compose=` parameter which designates a draft WITHOUT a ticket. */
export const FREE_COMPOSE_PARAM = "new";

let current: AgentComposeDraft | null = null;
const listeners = new Set<() => void>();

/** Sets (or deletes with `null`) the draft and notifies the Agents page. */
export function setAgentComposeDraft(draft: AgentComposeDraft | null): void {
  current = draft;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AgentComposeDraft | null {
  return current;
}

/** Current draft, responsive. `null` server side (never draft to SSR). */
export function useAgentComposeDraft(): AgentComposeDraft | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
