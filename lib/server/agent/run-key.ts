import "server-only";
import { SITE_NAME } from "@/lib/site";

/**
 * LLM PAR RUN key, hard cap (MIN-223).
 *
 * THE PROBLEM IT COVERS, and it doesn't close otherwise. The
 * network policy ([network-policy.ts](network-policy.ts)) means that the microVM no longer holds
 * the key: it is the firewall which sets it, after exit. But it lets
 * the VM **call the credited route out of the loop** — a `curl` is enough, the
 * framing probe did it. It's not exfiltration, it's
 * EXPENDITURE, and it escapes the ledger: no one sees it pass.
 *
 * One more check IN the VM limits nothing — it is compromised by
 * hypothesis. What limits this is a ceiling held **outside the VM and outside our
 * code**: an OpenRouter key issued for this run, with `limit` in dollars and
 * `expires_at`. Beyond that, it is the supplier who refuses. The worst case becomes
 * "the run spent its budget without producing anything", not "mindy's bill
 * doubled last night".
 *
 * BYOK: no mint. The user's key is injected as is — as
 * inexfiltrable as ours, but **uncapped**: it's their key and their
 * bill, and OpenRouter's provisioning API only issues to the account that owns it. It is SAYED in the BYOK screen, it cannot be corrected.
 *
 * DESIRED DEGRADATION **IN A MICROVM**, and nowhere else: without
 * `OPENROUTER_PROVISIONING_KEY`, the cloud path falls back on the platform key.
 * The mint is there a spending safeguard, not an operating prerequisite —
 * a variable not yet set in prod must not prevent a run from running,
 * it must remove its supplier ceiling and SAY it in the logs. She didn't
 * say it: `mintRunKey` made `null` silently when the variable
 * was missing, which is the only way for a degradation to be truly
 * silent (MIN-357).
 *
 * AND THIS DEGRADATION DOES NOT EXIST ON THE USER'S MACHINE. The key
 * platform is UNCAPED and shared with Numo, the transcription, the
 * embeddings and the catalog: letting it go down on a Mac, where the compute of
 * microVM — the last safeguard of the cloud — is structurally worth zero, would be
 * offering an open tap. **No mint = no local run**: the launcher keeps
 * the run in the cloud (`admitLocalRun`, [local-exec.ts](local-exec.ts)) and the
 * surface which serves the key refuses in 503 (`/llm-key`, control-plane.ts).
 */

/** OpenRouter provisioning key (issues and revokes run keys). NEVER
 * passed to network policy: it does not exit the function. */
const PROVISIONING_ENV = "OPENROUTER_PROVISIONING_KEY";
const KEYS_URL = "https://openrouter.ai/api/v1/keys";

/**
 * Ceiling floor, in dollars. A run with almost nothing left to spend on ITS budget would otherwise receive a $0 key, therefore dead at the first
 * completion — and the round would fail on an unreadable 402 instead of stopping
 * properly on its budget (which the loop already knows how to do, and say).
 *
 * It NEVER crosses the remainder of the ACCOUNT: it is a floor under a ceiling,
 * not a right to spend a quarter of a dollar more than the user has.
 */
const MIN_CAP_USD = 0.25;
/**
 * Margin above the remaining RUN budget. This ceiling is a NET behind a
 * governor which works: it is the loop which stops the run on `budget_usd`, with
 * a message. Tightening it to the nearest euro would make the supplier win the race, and
 * the user would read an API error where he should have read "budget reached".
 *
 * It ONLY applies TO this budget. The remainder of the account does not multiply
 *: it is money that does not exist.
 */
const CAP_HEADROOM = 1.5;
/**
 * What we grant when the remainder of the account is UNKNOWN — `checkAgentQuota` en
 * breakdown, therefore unreachable billing. The loop is then without a ceiling
 * also (`budgetUsd` is worth `undefined`), which makes this key the only safeguard
 * of the passage: too low it breaks an ordinary run (0.07 to 0.24 $ measured), too
 * high it no longer limits nothing.
 */
const UNKNOWN_REMAINING_CAP_USD = 1.5;
/** Lifespan of a run key. Large in front of a turn, short in front of oblivion. */
const KEY_TTL_MS = 24 * 60 * 60_000;

/**
 * Maximum managed-AI amount a new run asks the atomic launch transaction to
 * reserve. A run-specific governor keeps its provider headroom; an ordinary
 * run asks for the account cap and lets the database grant only what remains.
 */
export function requestedRunReservationUsd(opts: {
  runBudgetUsd?: number | null;
  accountCapUsd: number;
}): number {
  const accountCap = Math.max(0, Number(opts.accountCapUsd) || 0);
  if (opts.runBudgetUsd == null) return accountCap;
  const runRequest = Math.max(0, Number(opts.runBudgetUsd) || 0) * CAP_HEADROOM;
  return Math.min(accountCap, Math.max(runRequest, MIN_CAP_USD));
}

export interface RunKey {
  /** The `sk-or-v1-…` secret. Only exits here to network policy. */
  key: string;
  /** Revocation identifier (`hash` at OpenRouter) — to persist on the run. */
  hash: string;
  /** Ceiling installed, in dollars. */
  capUsd: number;
}

/** Is the provisioning API configured? Also used on the admin screen. */
export function runKeyMintingEnabled(): boolean {
  return Boolean(process.env[PROVISIONING_ENV]?.trim());
}

/**
 * The cap to put on the key of a run.
 *
 * TWO BUDGETS, AND THEY DON'T HAVE THE SAME STATUS — that's all this
 * function says.
 *
 * - the RUN budget (`agent_runs.budget_usd`, a routine set to "15% of my
 * plan") is a GOVERNOR: the loop pits it against its expenditure each round and
 * stops on it by saying so. The key doubles it by a margin, so that it is always our message that the user reads, never a 402 ;
 * - the remainder of the ACCOUNT (monthly budget included in the plan, minus what has been consumed) is a HARD CEILING. It does not multiply and does not rise again:
 * beyond that, we would make the user spend money that he does not have.
 *
 * The old version took the `min` of the two THEN multiplied everything by the
 * margin, floor included. On the COMMON case — a run with no budget of its own, so
 * the only remaining part of the account — a user with $3 left received a key at
 * $4.50, and a user with $0.10 a key at $0.25. The safeguard granted
 * up to 50% more than the budget it was supposed to hold.
 *
 * The two entries are REAL, not columns: `runSpentUsd` is the max of
 * the column and the sum of the ledger (MIN-215), and the remainder of the account descends
 * from `getUserUsage`, which sums the usage of the billing window, all
 * features included — microVM compute included.
 */
export function runKeyCapUsd(opts: {
  /** Ceiling placed on the run itself (`agent_runs.budget_usd`), if there is one. */
  runBudgetUsd?: number | null;
  /** What the run has already spent, all chunks combined (ledger included). */
  runSpentUsd?: number;
  /** What remains of the ACCOUNT's monthly budget. `undefined` = unknown or
 * unlimited — but in BYOK (the only unlimited case) we do not mint. */
  accountRemainingUsd?: number;
  /** Unspent amount atomically reserved for this managed-AI run. */
  reservedBudgetUsd?: number | null;
}): number {
  const reserved =
    typeof opts.reservedBudgetUsd === "number" && Number.isFinite(opts.reservedBudgetUsd)
      ? Math.max(0, opts.reservedBudgetUsd)
      : undefined;
  const account =
    typeof opts.accountRemainingUsd === "number" && Number.isFinite(opts.accountRemainingUsd)
      ? Math.max(0, opts.accountRemainingUsd)
      : undefined;
  // New platform runs own a serialized reservation. Account snapshots remain
  // only as a compatibility ceiling for legacy rows that predate the column.
  const ceiling = reserved ?? account;
  const fromRun =
    opts.runBudgetUsd == null
      ? undefined
      : Math.max(0, Number(opts.runBudgetUsd) - (opts.runSpentUsd ?? 0)) * CAP_HEADROOM;

  // Without a run budget, what we ask for IS the remainder of the account — so, once
  // the hard ceiling applied, exactly him.
  const asked = fromRun ?? ceiling ?? UNKNOWN_REMAINING_CAP_USD;
  const floored = Math.max(asked, MIN_CAP_USD);
  const capped = ceiling === undefined ? floored : Math.min(floored, ceiling);
  return Math.round(capped * 100) / 100;
}

/**
 * Issues a key for this run. `null` if the provisioning API is not configured
 * or refuses: the caller then falls back on the platform key — without ceiling
 * provider, and it says so.
 */
export async function mintRunKey(opts: {
  runId: string;
  capUsd: number;
}): Promise<RunKey | null> {
  const provisioning = process.env[PROVISIONING_ENV]?.trim();
  if (!provisioning) {
    // THE ONLY FAILURE THAT IS NOT SAYING (MIN-357). The other two branches
    // log from start; this one, the only one that is permanent on
    // a deployment, returned `null` silently — and the caller fell back to the
    // platform key without anything, anywhere, saying it even once.
    console.error(`[agent-run-key] ${PROVISIONING_ENV} manquante — run non plafonné chez le fournisseur`);
    return null;
  }
  try {
    const res = await fetch(KEYS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provisioning}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // The name is READ by a human in the OpenRouter dashboard during the day
        // where a key is lying around: it must say which run it comes from.
        name: `${SITE_NAME} agent run ${opts.runId}`,
        limit: opts.capUsd,
        expires_at: new Date(Date.now() + KEY_TTL_MS).toISOString(),
      }),
    });
    if (!res.ok) {
      console.error(`[agent-run-key] mint failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body = (await res.json()) as { key?: string; data?: { hash?: string } };
    const key = body.key?.trim();
    const hash = body.data?.hash?.trim();
    // The secret is only returned to creation: without both, the key is
    // unusable AND irrevocable. Better not to use it at all.
    if (!key || !hash) {
      console.error("[agent-run-key] mint returned no key/hash");
      return null;
    }
    return { key, hash, capUsd: opts.capUsd };
  } catch (err) {
    console.error("[agent-run-key] mint failed:", (err as Error).message);
    return null;
  }
}

/**
 * Revokes a run key. Best-effort and idempotent: an already deleted key
 * returns 404, which is the desired result. Called when the microVM is put to
 * dormancy — the key never survives the session that used it, and a wakeup in
 * returns one.
 */
export async function revokeRunKey(hash: string): Promise<void> {
  const provisioning = process.env[PROVISIONING_ENV]?.trim();
  if (!provisioning || !hash) return;
  try {
    const res = await fetch(`${KEYS_URL}/${encodeURIComponent(hash)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${provisioning}` },
    });
    if (!res.ok && res.status !== 404) {
      console.error(`[agent-run-key] revoke failed (${res.status}) for ${hash}`);
    }
  } catch (err) {
    console.error("[agent-run-key] revoke failed:", (err as Error).message);
  }
}
