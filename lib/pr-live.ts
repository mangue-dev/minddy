import type { QueryKey } from "@tanstack/react-query";

/**
 * The direct of A pull request — the vocabulary shared between the server which
 * pushes (`lib/server/agent/pr-live.ts`) and the screen which listens to
 * (`lib/use-pr-live.ts`).
 *
 * PUR module: no server import, it crosses the border.
 *
 * The message NEVER carries content, only the PARTS that have
 * moved. This is not a saving of bytes: the content of a PR is read with the READER's
 * token, and it is not the same for everyone — a reaction
 * carries a `viewerIsActor`, the gestures offered depend on `viewer.capability`
 * (MIN-144). To push what another has read would be wrong in the receiver. The
 * message therefore says "this part has moved", and each client will reread it with their
 * own eyes.
 *
 * This is also what makes the topic safe: subscribing to it does not give access to anything
 * that cannot already be read through it. route.
 */

/** Private topic of the live PR (migration 20260929090000_pull_request_realtime). */
export function pullRequestTopic(prId: string): string {
  return `pull-request:${prId}`;
}

/**
 * The surfaces of a PR, as the screen loads them — one per cache:
 *
 * `pr` — the header: status, CI checks, approvals, merge methods;
 * `conversation` — the thread (messages, activity, thread reactions);
 * `commits` — the Commits tab;
 * `reviewComments` — line comments, their threads and their reactions.
 */
export type PrLivePart = "pr" | "conversation" | "commits" | "reviewComments";

/** Charge utile du message `changed`. */
export interface PrLiveChanged {
  parts: PrLivePart[];
  /** Transmission timestamp (ms) — is used for diagnosis, not for order: a
 * invalidation is not a delta, replaying it out of order has no effect. */
  at: number;
}

/**
 * React Query caches to invalidate for these parts (see `lib/use-agent-runs.ts`).
 *
 * `reviewComments` returns a PREFIX key, without its endpoint: the diff view serves
 * two surfaces — the Pull Requests page (`prEndpoint(prId)`) and the diff
 * view of an agent session (`runPrEndpoint(runId)`) —, which read the SAME
 * comments under two different keys. The prefix catches them every
 * two; naming one of the two forms would leave one out of date.
 *
 * Duplicates are ruled out: two parties can aim for the same key (a review
 * moves the thread AND the header), and invalidating twice would trigger two refetch.
 */
export function prLiveQueryKeys(prId: string, parts: PrLivePart[]): QueryKey[] {
  const keys: QueryKey[] = [];
  const seen = new Set<string>();
  const push = (key: QueryKey) => {
    const hash = JSON.stringify(key);
    if (seen.has(hash)) return;
    seen.add(hash);
    keys.push(key);
  };
  for (const part of parts) {
    switch (part) {
      case "pr":
        push(["pull-request", prId]);
        break;
      case "conversation":
        push(["pr-comments", prId]);
        break;
      case "commits":
        push(["pr-commits", prId]);
        break;
      case "reviewComments":
        push(["pr-review-comments"]);
        break;
    }
  }
  return keys;
}

/** The parts of a received message, filtered from what is not a message. */
export function parsePrLiveParts(raw: unknown): PrLivePart[] {
  const known: PrLivePart[] = ["pr", "conversation", "commits", "reviewComments"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is PrLivePart => known.includes(p as PrLivePart));
}
