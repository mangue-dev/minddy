import "server-only";

import { resolveForgeActor, type ForgeActor } from "@/lib/server/git/forge-actor";
import { forgeFor, FORGE_READ_METHODS, type Forge } from "./forge";
import { ForgeApiError } from "./forge-error";
import { withGithubReadScope } from "./github-read-flight";
import type { PrLockTarget } from "./pr-operation-lock";
import { rowProvider, type PullRequestRow } from "./pull-requests";
import { resolveLinkedRepositoryWithAccess, type LinkedRepository } from "./repo-access";

/** Everything needed to address this PR at its forge with a fresh token. */
export interface PrScope {
  pr: PullRequestRow;
  target: LinkedRepository;
  /** The user may act on the PR (owner or member of a linking project). A
      reader reads it but every mutation is refused (MIN-693). */
  canWrite: boolean;
  forge: Forge;
  /** Shortcut for the three values every forge call requires. */
  call: { token: string; repoFullName: string; number: number };
  /**
   * The user's git account, under which HUMAN gestures are sent
   * (MIN-144). Lazily memoized per request: `resolvePrScope` is used by every
   * PR route—`/comments`, `/review-comments`, `/file`, and the detail route that
   * polls every 15 seconds during CI. Resolving the workspace actor eagerly
   * would add a forge round trip, and sometimes a token refresh, to each call.
   */
  actor: () => Promise<ForgeActor>;
}

export type ReadinessBatchReadControl = { beforeRead: () => void; onError: (error: unknown) => void };

/**
 * Resolves `userId`'s access to `pr` and mints a forge token, or null when no
 * project of theirs links this repository (the caller answers 404).
 */
export async function resolvePrScope(
  userId: string,
  pr: PullRequestRow,
  shareReads = false,
  readNotBefore = performance.now(),
  batch?: ReadinessBatchReadControl,
): Promise<PrScope | null> {
  const provider = rowProvider(pr);
  const resolved = await resolveLinkedRepositoryWithAccess({
    userId,
    provider,
    repoFullName: pr.repo_full_name,
  });
  if (!resolved) return null;
  const { target, canWrite } = resolved;

  const forge = forgeFor(target.provider);
  const scopedForge = { ...forge };
  // Only GET routes share reads. Sensitive mutation decisions use the original
  // forge and perform fresh reads even when a display request is in flight.
  if (shareReads && forge.sharesConcurrentReads) {
    const identity = [userId, target.provider, target.linkId, target.connectionId,
      target.externalRepoId, target.repoFullName];
    for (const name of FORGE_READ_METHODS) {
      const method = forge[name] as (...args: unknown[]) => unknown;
      Object.assign(scopedForge, { [name]: (...args: unknown[]) =>
        withGithubReadScope(identity, () => method.apply(forge, args), readNotBefore) });
    }
  }

  let pending: Promise<ForgeActor> | null = null;
  return {
    pr,
    target,
    canWrite,
    forge: shareReads ? scopedForge : forge,
    call: { token: target.token, repoFullName: target.repoFullName, number: pr.number },
    // Never rejects: a resolution failure counts as "no account" (a 403
    // inviting to reconnect, or a banner), never a 500 that would take down
    // the whole PR view.
    actor: () =>
      (pending ??= resolveForgeActor({
        userId,
        provider: target.provider,
        repoFullName: target.repoFullName,
        ...(batch ? { readControl: { beforeRead: batch.beforeRead,
          onRateLimit: (status: 403 | 429, retryAfter: string | null) => {
            batch.onError(new ForgeApiError("Forge reads are paused", status, retryAfter));
          } } } : {}),
      }).catch((error) => {
        batch?.onError(error);
        console.error("[pr-actions] actor_unresolved");
        return { kind: "none", reason: "noAccount" } as ForgeActor;
      })),
  };
}

/** The forge call triple, but signed by the user instead of the App. */
export function actorCall(
  actor: Extract<ForgeActor, { kind: "actor" }>,
  scope: PrScope,
): { token: string; repoFullName: string; number: number } {
  return {
    token: actor.token,
    repoFullName: scope.target.repoFullName,
    number: scope.pr.number,
  };
}

/** The forge identity of the PR, which keys its operation lock. */
export function lockTarget(scope: PrScope): PrLockTarget {
  return { provider: scope.target.provider, repoFullName: scope.target.repoFullName,
    number: scope.pr.number };
}
