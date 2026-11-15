import "server-only";

import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * In-process guard against running the same PR gesture twice at once (a
 * double click, or the panel and Numo merging together). Gestures that act on
 * the same forge state share one operation name: enabling and disabling
 * auto-merge exclude each other, and so do every merge path.
 *
 * The lock is per server instance; the forge stays the authority when two
 * instances race.
 */
export type PrOperation =
  | "merge"
  | "merge-flow"
  | "review-state"
  | "update-branch"
  | "update-title"
  | "update-body"
  | "request-reviewer"
  | `rerun:${string}`;

export interface PrLockTarget {
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
}

export class PrOperationInProgressError extends Error {
  constructor() {
    super("Pull request operation already in progress");
    this.name = "PrOperationInProgressError";
  }
}

const ACTIVE_PR_OPERATIONS = new Set<string>();

/** Runs `run` unless the same operation already runs on this PR, which throws instead. */
export async function withPrOperation<T>(
  target: PrLockTarget,
  operation: PrOperation,
  run: () => Promise<T>,
): Promise<T> {
  const key = `${target.provider}:${target.repoFullName.toLowerCase()}#${target.number}:${operation}`;
  if (ACTIVE_PR_OPERATIONS.has(key)) throw new PrOperationInProgressError();
  ACTIVE_PR_OPERATIONS.add(key);
  try {
    return await run();
  } finally {
    ACTIVE_PR_OPERATIONS.delete(key);
  }
}
