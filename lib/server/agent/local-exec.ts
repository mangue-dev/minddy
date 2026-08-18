import "server-only";

import {
  LOCAL_EXEC_MAX_TTL_SECONDS,
  resolveLocalExecSecret,
  signLocalExecToken,
} from "./local-exec-token";
import { rowMayRunLocally, localRunScope, type LocalRunContext } from "./local-exec-scope";
import { runKeyMintingEnabled } from "./run-key";
import { bumpLocalExecGen, runLocalExecScopeRow } from "./runs";

/**
 * THE LOCAL EXECUTION LEASE (MIN-355) — the issuance of the token, half base.
 *
 * Separate from [local-exec-token.ts](local-exec-token.ts), which remains PURE: the
 * cryptography and the claims contract are tested without a base, and this is what
 * allows them to be broken in a test rather than in production. Here, there is only one
 * gesture, and it does two at once.
 *
 * TO ISSUE IS TO REVOK. We increment the generation BEFORE signing: at the
 * second when this function renders, any token emitted previously for this run is
 * refused by the control plane. This is not a side effect, it is the
 * functionality — a self-carrying token does not remember, and "a machine per
 * run" cannot therefore be a rule that we ask someone to respect.
 *
 * Corollary to know before wiring the renewal (MIN-294): two machines
 * which claim the same run chase each other, the last one served wins. A conflict can therefore be seen immediately, instead of producing two harnesses which write the same checkpoint on their own.
 *
 * AND A DECISION THAT IS TAKEN BEFORE (MIN-357): `admitLocalRun`, which says if ce
 * run has the right to play on a machine. It's here and not in the launcher
 * because it deals with the same thing as the lease — which a local tower is allowed to do — and a launcher is the last place you want to see a handwritten security.
 * `if` */

/**
 * Why a run cannot play on the user's machine.
 *
 * - `no_mint`: `OPENROUTER_PROVISIONING_KEY` is not installed on this
 * deployment. In a disposable microVM, degradation to the platform key
 * is assumed; on someone's machine, this key is UNCAPED and
 * shared with Numo, transcription, embeddings and catalog.
 */
export type LocalRunRefusal = "no_mint";

export type LocalRunAdmission = { ok: true } | { ok: false; reason: LocalRunRefusal };

/**
 * IS A RUN ALLOWED TO PLAY LOCALLY? (MIN-357)
 *
 * The caller is the LAUNCHER (MIN-293), and what he must do with it is in one
 * sentence: **switch to the cloud when a platform key cannot be
 * minted.** A run refused here is not a run that fails — it's a run which leaves
 * in microVM, where everything that is missing from a machine exists (firewall, key placed at
 * at the exit, compute charged). A BYOK is admitted directly: the run is
 * interactive and the user assumes the calls billed by his provider.
 *
 * What matters is that the flip-flop SAYS: a phase `status` event
 * `local_exec_declined` carrying this `reason`, which the thread renders as a note
 * ([agent-event-feed.tsx](../../../components/agent/agent-event-feed.tsx),
 * `LOCAL_DECLINED_KEYS`). A silent toggle would be exactly the
 * flaw we just fixed in `mintRunKey` — something that degrades without
 * anyone knowing about it. The phase travels literally on both sides, like
 * `sandbox_ready` and `transient_error`: this module is `server-only` *, the thread is
 * a client component, and a shared constant would require a third
 * file for two strings.
 *
 * PURE, and without base reading: the two inputs are the run key mode and
 * the deployment environment. This is what allows it to be broken in a test.
 */
export function admitLocalRun(opts: { keyMode: "platform" | "byok" }): LocalRunAdmission {
  // A local BYOK is an interactive gesture by the user. Contexts without
  // monitoring (routine, automation, mention, review) are already excluded by
  // `localRunScope`; they continue to run in the cloud.
  if (opts.keyMode === "byok") return { ok: true };
  if (!runKeyMintingEnabled()) return { ok: false, reason: "no_mint" };
  return { ok: true };
}

/**
 * DOES THE FLAG REQUESTED BY THE PAGE SURVIVE LAUNCH? (MIN-359, MIN-360)
 *
 * `localExec` arrives in the body of a POST: it is a REQUEST, not a fact.
 * This function confronts it with what the run IS — and the nature of the run, it,
 * is decided once and for all by
 * [local-exec-scope.ts](local-exec-scope.ts), which is also what `createRun`
 * applies to writing the column and what issuing the lease rechecks.
 *
 * Three readings of the same invariant, only one writing: this is what was missing
 * in MIN-359, where the predicate knew neither the `pr` anchor nor the input gates
 * which did not yet exist.
 */
export function localExecRequested(
  input: { localExec?: boolean } & LocalRunContext,
): boolean {
  if (input.localExec !== true) return false;
  return localRunScope(input).ok;
}

/** The failure is SAID, never returned as an empty token: the caller must be able to choose
 * between “this run is not local” and “this deployment cannot sign”. */
export type IssueLocalExecTokenResult =
  | { ok: true; token: string; gen: number; expiresInSeconds: number }
  | { ok: false; error: "not_configured" | "not_local" | "third_party_context" };

/**
 * Issues the token for the next local round of a run — 15 minutes rolling.
 *
 * The caller is the APP, which has the user's session: it is the only
 * authority that can say that a machine has the right to play this run. The harness,
 * only wears what we give it, and asks for more when it expires.
 */
export async function issueLocalExecToken(
  runId: string,
): Promise<IssueLocalExecTokenResult> {
  const secret = resolveLocalExecSecret();
  if (!secret) {
    // The same behavior as the missing tenant on the cloud path: a
    // deployment that does not know how to sign does not deliver anything, and it says so.
    console.error("[agent-local-exec] SUPABASE_SERVICE_ROLE_KEY manquante — aucun jeton local");
    return { ok: false, error: "not_configured" };
  }
  /**
 * THE INVARIANT, RECHECKED ON THE LINE (MIN-360) — and before the lease, never
 * after: to issue is to revoke, so a refusal which would arrive afterwards would have
 * already broken the current run.
 *
 * `createRun` is the only writer of `local_exec` and is already enforcing the rule. This
 * check is therefore not a repeat but a second curtain, at the place which
 * counts: **without a token, no machine can play this run.** A column
 * written by a migration, a back office or a future launch path is not
 * sufficient to open the door.
 */
  const row = await runLocalExecScopeRow(runId);
  if (row && !rowMayRunLocally(row).ok) {
    console.error(`[agent-local-exec] run ${runId} : contexte tiers, aucun jeton local`);
    return { ok: false, error: "third_party_context" };
  }
  const gen = await bumpLocalExecGen(runId);
  if (gen === null) return { ok: false, error: "not_local" };
  return {
    ok: true,
    token: signLocalExecToken({ runId, gen }, secret),
    gen,
    expiresInSeconds: LOCAL_EXEC_MAX_TTL_SECONDS,
  };
}
