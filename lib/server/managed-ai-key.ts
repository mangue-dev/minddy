import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUsagePeriod, getUserUsage } from "@/lib/server/usage";
import { managedAiKeyMode } from "@/lib/managed-services";
import {
  createKey,
  deleteKey,
  getKey,
  listKeys,
  patchKey,
  readManagementKey,
  type ManagedKeyInfo,
} from "@/lib/server/openrouter-management";
import {
  decodeManagedAiKey,
  encodeManagedAiKey,
} from "@/lib/server/managed-ai-key-content";

/**
 * Per-account OpenRouter keys on Minddy Cloud (MIN-761).
 *
 * Every billed AI call uses an OpenRouter key issued for its account, whose
 * `limit` is what the plan still includes. The cap is then held by OpenRouter,
 * outside our code: a route that forgets `ensureUsageBudget`, parallel requests
 * that all pass the pre-flight, or a leaked key can spend at most that
 * account's budget. The pre-flight stays first in line to show "budget
 * reached"; the key is the net that holds when the pre-flight is wrong.
 *
 * OpenRouter's own `limit_reset: monthly` restarts on the first of the
 * calendar month, not on our usage window (Stripe cycle, annual sub-cycles,
 * admin reset watermark), so keys have no reset: `usage` is cumulative, and the
 * row remembers the key's usage at the start of the window (`baseline`). The
 * limit is reconciled lazily, when the key is resolved and the window or the
 * plan changed, and eagerly from the Stripe webhook and the admin reset.
 *
 * A key that is no longer used is DELETED at OpenRouter, never disabled.
 */

/** Margin above the included usage, so that our pre-flight wins the race. */
export const KEY_LIMIT_HEADROOM = 1.05;
/** Daily cap of the key shared by the anonymous surfaces (demo, FAQ). */
export const PUBLIC_KEY_DAILY_LIMIT_USD = 5;
/** Every key issued here carries this prefix, which the orphan sweep relies on. */
export const MANAGED_KEY_NAME_PREFIX = "minddy-cloud:";

/**
 * The prefix of the keys this database references. Preview and production
 * share one OpenRouter account but not their `managed_ai_keys` rows: each
 * names its keys after its Supabase project, so that a sweep never mistakes
 * the other environment's live keys for orphans.
 */
export function keyNamePrefix(supabaseUrl = process.env.MINDDY_PUBLIC_SUPABASE_URL): string {
  let scope = "";
  try {
    scope = new URL(supabaseUrl ?? "").hostname.split(".")[0] ?? "";
  } catch {
    // An unreadable URL keeps the generic scope below.
  }
  return `${MANAGED_KEY_NAME_PREFIX}${scope.replace(/[^a-z0-9-]/gi, "") || "default"}:`;
}

const CACHE_TTL_MS = 60_000;
/** A key younger than this may still be on its way to its row: the sweep spares it. */
const SWEEP_GRACE_MS = 10 * 60_000;
const ROW_PAGE_SIZE = 1_000;
const PUBLIC_CACHE_KEY = "public";

export class ManagedAiKeyUnavailableError extends Error {
  constructor(reason: string) {
    super(`Managed AI key unavailable: ${reason}`);
    this.name = "ManagedAiKeyUnavailableError";
  }
}

interface KeyRow {
  id: string;
  purpose: "user" | "public";
  user_id: string | null;
  key_hash: string;
  key_encrypted: string;
  window_start: string | null;
  baseline_usd: number | string;
  plan_id: string | null;
  limit_usd: number | string;
}

interface AccountState {
  planId: string;
  includedUsd: number;
  windowStart: string;
  windowEnd: string;
}

const KEY_COLUMNS =
  "id, purpose, user_id, key_hash, key_encrypted, window_start, baseline_usd, plan_id, limit_usd";

const cache = new Map<string, { apiKey: string; expiresAt: number }>();

function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function userKeyName(userId: string): string {
  return `${keyNamePrefix()}user:${userId}`;
}

/**
 * The cap of an account key.
 *
 * - `windowChanged`: a later usage window started (renewal, annual sub-cycle,
 *   first of the month on the free plan, admin reset): the baseline moves to
 *   the key's current usage.
 * - Otherwise the baseline stays: a plan change only moves the included part,
 *   up or down. A downgrade below what was already spent leaves the limit at
 *   the current usage, which blocks the key until the next window.
 *
 * The headroom applies to the included usage, never to the baseline.
 */
export function computeKeyLimit(input: {
  keyUsage: number;
  baseline: number;
  includedUsd: number;
  windowChanged: boolean;
}): { baseline: number; limit: number } {
  const keyUsage = Math.max(0, input.keyUsage);
  const baseline = input.windowChanged ? keyUsage : input.baseline;
  const included = Math.max(0, input.includedUsd) * KEY_LIMIT_HEADROOM;
  return {
    baseline: roundUsd(baseline),
    limit: roundUsd(Math.max(keyUsage, baseline + included, 0)),
  };
}

/**
 * Whether `current` starts a later window than the one the row was capped for.
 * A window that moves EARLIER (a cancelled subscription falling back to the
 * calendar month, an undone admin reset) keeps its baseline: what the key
 * already spent still counts against the plan it falls back to.
 */
export function startsLaterWindow(stored: string, current: string): boolean {
  return Date.parse(current) > Date.parse(stored);
}

function sameInstant(a: string | null, b: string): boolean {
  return a !== null && Date.parse(a) === Date.parse(b);
}

function ensurePerUserMode(): void {
  if (!readManagementKey()) {
    // Fail closed, and say it: falling back to the uncapped shared key would
    // remove the provider cap silently (MIN-357).
    console.error("[managed-ai-key] OPENROUTER_MANAGEMENT_KEY missing; billed AI calls are refused");
    throw new ManagedAiKeyUnavailableError("management key not configured");
  }
}

async function readUserRow(userId: string): Promise<KeyRow | null> {
  const { data, error } = await getServiceClient()
    .from("managed_ai_keys")
    .select(KEY_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`managed_ai_keys read failed: ${error.message}`);
  return (data as KeyRow | null) ?? null;
}

async function readPublicRow(): Promise<KeyRow | null> {
  const { data, error } = await getServiceClient()
    .from("managed_ai_keys")
    .select(KEY_COLUMNS)
    .eq("purpose", "public")
    .maybeSingle();
  if (error) throw new Error(`managed_ai_keys read failed: ${error.message}`);
  return (data as KeyRow | null) ?? null;
}

async function deleteRow(keyHash: string): Promise<void> {
  const { error } = await getServiceClient()
    .from("managed_ai_keys")
    .delete()
    .eq("key_hash", keyHash);
  if (error) throw new Error(`managed_ai_keys delete failed: ${error.message}`);
}

/** Deletes a key that lost a race or failed to store; the sweep catches a failure. */
async function deleteKeyQuietly(keyHash: string): Promise<void> {
  try {
    await deleteKey(keyHash);
  } catch (err) {
    console.error("[managed-ai-key] could not delete an unused key:", (err as Error).message);
  }
}

/**
 * Stores a freshly created key. A concurrent issuance that stored its key first
 * wins: ours is deleted at OpenRouter and the winner's key is returned.
 */
async function storeIssuedKey(
  created: { key: string; hash: string },
  row: Omit<KeyRow, "id" | "key_hash" | "key_encrypted">,
  readWinner: () => Promise<KeyRow | null>,
): Promise<string> {
  let encrypted: string;
  try {
    encrypted = await encodeManagedAiKey(created.key, created.hash);
  } catch (err) {
    await deleteKeyQuietly(created.hash);
    throw err;
  }
  const { error } = await getServiceClient()
    .from("managed_ai_keys")
    .insert({ ...row, key_hash: created.hash, key_encrypted: encrypted });
  if (!error) return created.key;

  await deleteKeyQuietly(created.hash);
  if (error.code === "23505") {
    const winner = await readWinner();
    if (winner) return decodeManagedAiKey(winner.key_encrypted, winner.key_hash);
  }
  throw new Error(`managed_ai_keys insert failed: ${error.message}`);
}

/**
 * Issues the account key. What the ledger already counts in the current window
 * enters as a negative baseline: the key starts with what the plan still
 * includes, not with a fresh budget.
 */
async function issueUserKey(userId: string): Promise<string> {
  const usage = await getUserUsage(userId);
  const { baseline, limit } = computeKeyLimit({
    keyUsage: 0,
    baseline: -usage.usedUsd,
    includedUsd: usage.billing.plan.includedUsageUsd,
    windowChanged: false,
  });
  const created = await createKey({ name: userKeyName(userId), limitUsd: limit, limitReset: null });
  return storeIssuedKey(
    created,
    {
      purpose: "user",
      user_id: userId,
      window_start: usage.period.start,
      baseline_usd: baseline,
      plan_id: usage.billing.planId,
      limit_usd: limit,
    },
    () => readUserRow(userId),
  );
}

async function accountState(userId: string): Promise<AccountState> {
  const billing = await getResolvedBilling(userId);
  const period = await getUsagePeriod(userId, billing);
  return {
    planId: billing.planId,
    includedUsd: billing.plan.includedUsageUsd,
    windowStart: period.start,
    windowEnd: period.end,
  };
}

/**
 * Brings the key's cap in line with the account's window and plan.
 *
 * The row is claimed before OpenRouter is patched: the update only applies to
 * the window and plan this request read, so two requests that both saw a new
 * window cannot each move the baseline. The loser re-reads the row once.
 */
async function reconcileRow(
  row: KeyRow,
  state: AccountState,
  userId: string,
  retried = false,
): Promise<string> {
  const apiKey = await decodeManagedAiKey(row.key_encrypted, row.key_hash);
  const baseline = Number(row.baseline_usd) || 0;
  const storedStart = row.window_start ?? state.windowStart;
  const windowChanged = startsLaterWindow(storedStart, state.windowStart);
  // The included usage of the same plan rose (a plan definition changed): the
  // cap is below what the plan now allows. A blocked key sits above it, by
  // design, and is left alone.
  const allowed = computeKeyLimit({ keyUsage: 0, baseline, includedUsd: state.includedUsd, windowChanged: false });
  const includedRose = Number(row.limit_usd) < allowed.limit - 1e-6;
  if (
    !windowChanged && !includedRose && row.plan_id === state.planId &&
    sameInstant(row.window_start, state.windowStart)
  ) {
    return apiKey;
  }

  const info = await getKey(row.key_hash);
  if (!info) return reissueUserKey(row, userId);
  const next = computeKeyLimit({
    keyUsage: info.usage,
    baseline,
    includedUsd: state.includedUsd,
    windowChanged,
  });
  const service = getServiceClient();
  let claim = service
    .from("managed_ai_keys")
    .update({
      window_start: state.windowStart,
      baseline_usd: next.baseline,
      plan_id: state.planId,
      limit_usd: next.limit,
      updated_at: new Date().toISOString(),
    })
    .eq("key_hash", row.key_hash)
    .eq("baseline_usd", row.baseline_usd);
  if (row.window_start) claim = claim.eq("window_start", row.window_start);
  if (row.plan_id) claim = claim.eq("plan_id", row.plan_id);
  const { data: claimed, error } = await claim.select("key_hash");
  if (error) throw new Error(`managed_ai_keys update failed: ${error.message}`);
  if (!claimed || claimed.length === 0) {
    // Another request re-capped this key first.
    const fresh = retried ? null : await readUserRow(userId);
    if (!fresh) return retried ? apiKey : issueUserKey(userId);
    return reconcileRow(fresh, state, userId, true);
  }

  if (info.limit === null || Math.abs(info.limit - next.limit) > 1e-6) {
    let patched: ManagedKeyInfo | null;
    try {
      patched = await patchKey(row.key_hash, { limitUsd: next.limit });
    } catch (err) {
      // Release the claim, so that the next call retries the re-cap instead
      // of trusting a row that OpenRouter never received.
      await service
        .from("managed_ai_keys")
        .update({
          window_start: row.window_start,
          baseline_usd: row.baseline_usd,
          plan_id: row.plan_id,
          limit_usd: row.limit_usd,
        })
        .eq("key_hash", row.key_hash);
      throw err;
    }
    if (!patched) return reissueUserKey(row, userId);
  }
  return apiKey;
}

/** The key vanished at OpenRouter: its row goes, and a new key starts from the ledger. */
async function reissueUserKey(row: KeyRow, userId: string): Promise<string> {
  console.error(`[managed-ai-key] key ${row.key_hash} is gone at OpenRouter; issuing a new one`);
  await deleteRow(row.key_hash);
  return issueUserKey(userId);
}

function rethrowUnavailable(err: unknown): never {
  if (err instanceof ManagedAiKeyUnavailableError) throw err;
  console.error("[managed-ai-key] resolution failed:", (err as Error).message);
  throw new ManagedAiKeyUnavailableError((err as Error).message);
}

/**
 * The OpenRouter key of a billed account: issued on first use, its cap
 * reconciled when the usage window or the plan changed.
 */
export async function resolveUserAiKey(userId: string): Promise<string> {
  if (!userId) throw new ManagedAiKeyUnavailableError("no billed account");
  ensurePerUserMode();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.apiKey;

  try {
    const [row, state] = await Promise.all([readUserRow(userId), accountState(userId)]);
    const apiKey = row
      ? await reconcileRow(row, state, userId)
      : await issueUserKey(userId);
    // Never past the end of the window: the next window must be re-capped on
    // its first call, not up to a cache lifetime later.
    const windowEnd = Date.parse(state.windowEnd);
    const expiresAt = Math.min(
      Date.now() + CACHE_TTL_MS,
      Number.isFinite(windowEnd) ? windowEnd : Number.POSITIVE_INFINITY,
    );
    cache.set(userId, { apiKey, expiresAt });
    return apiKey;
  } catch (err) {
    rethrowUnavailable(err);
  }
}

/** The daily-capped key of the surfaces that have no account (demo, FAQ). */
export async function resolvePublicAiKey(): Promise<string> {
  ensurePerUserMode();
  const cached = cache.get(PUBLIC_CACHE_KEY);
  if (cached && cached.expiresAt > Date.now()) return cached.apiKey;

  try {
    let row = await readPublicRow();
    if (row && Number(row.limit_usd) !== PUBLIC_KEY_DAILY_LIMIT_USD) {
      // The daily cap changed since the key was issued.
      if (await patchKey(row.key_hash, { limitUsd: PUBLIC_KEY_DAILY_LIMIT_USD })) {
        const { error } = await getServiceClient()
          .from("managed_ai_keys")
          .update({ limit_usd: PUBLIC_KEY_DAILY_LIMIT_USD, updated_at: new Date().toISOString() })
          .eq("key_hash", row.key_hash);
        if (error) throw new Error(`managed_ai_keys update failed: ${error.message}`);
      } else {
        await deleteRow(row.key_hash);
        row = null;
      }
    }
    let apiKey: string;
    if (row) {
      apiKey = await decodeManagedAiKey(row.key_encrypted, row.key_hash);
    } else {
      const created = await createKey({
        name: `${keyNamePrefix()}public`,
        limitUsd: PUBLIC_KEY_DAILY_LIMIT_USD,
        limitReset: "daily",
      });
      apiKey = await storeIssuedKey(
        created,
        {
          purpose: "public",
          user_id: null,
          window_start: null,
          baseline_usd: 0,
          plan_id: null,
          limit_usd: PUBLIC_KEY_DAILY_LIMIT_USD,
        },
        readPublicRow,
      );
    }
    cache.set(PUBLIC_CACHE_KEY, { apiKey, expiresAt: Date.now() + CACHE_TTL_MS });
    return apiKey;
  } catch (err) {
    rethrowUnavailable(err);
  }
}

/**
 * Re-caps an account key right away (Stripe webhook, admin reset), instead of
 * waiting for its next call. Best-effort: the lazy reconciliation catches up.
 * An account that never used managed AI has no key, and gets none here.
 */
export async function reconcileUserAiKey(userId: string): Promise<void> {
  if (managedAiKeyMode() !== "per_user" || !readManagementKey()) return;
  cache.delete(userId);
  try {
    const [row, state] = await Promise.all([readUserRow(userId), accountState(userId)]);
    if (row) await reconcileRow(row, state, userId);
  } catch (err) {
    console.error("[managed-ai-key] reconciliation failed:", (err as Error).message);
  }
}

/**
 * OpenRouter refused a key with 401: it was deleted or revoked outside Minddy.
 * Its row and the key itself go, so the next call issues a new one. A key that
 * was already replaced is left alone.
 */
export async function discardManagedAiKey(owner: string, apiKey: string): Promise<void> {
  cache.delete(owner);
  try {
    const row = owner === PUBLIC_CACHE_KEY ? await readPublicRow() : await readUserRow(owner);
    if (!row) return;
    if ((await decodeManagedAiKey(row.key_encrypted, row.key_hash)) !== apiKey) return;
    await deleteKeyQuietly(row.key_hash);
    await deleteRow(row.key_hash);
  } catch (err) {
    console.error("[managed-ai-key] discard failed:", (err as Error).message);
  }
}

/** Account deletion: the key goes at OpenRouter, then its row. */
export async function deleteUserAiKey(userId: string): Promise<boolean> {
  cache.delete(userId);
  const row = await readUserRow(userId);
  if (!row) return false;
  if (readManagementKey()) await deleteKey(row.key_hash);
  await deleteRow(row.key_hash);
  return true;
}

async function storedKeyHashes(): Promise<Set<string>> {
  const hashes = new Set<string>();
  // Paged: a truncated read would make live keys look orphaned.
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await getServiceClient()
      .from("managed_ai_keys")
      .select("key_hash")
      .order("key_hash")
      .range(from, from + ROW_PAGE_SIZE - 1);
    if (error) throw new Error(`managed_ai_keys read failed: ${error.message}`);
    const rows = (data ?? []) as { key_hash: string }[];
    for (const row of rows) hashes.add(row.key_hash);
    if (rows.length < ROW_PAGE_SIZE) return hashes;
  }
}

/** A key this environment issued; another environment's keys never match. */
function isManagedKey(key: ManagedKeyInfo): boolean {
  return key.name.startsWith(keyNamePrefix());
}

/**
 * Deletes every key this environment issued that no row references any more
 * (an issuance that died between OpenRouter and the database, a failed delete
 * on account deletion). Keys of another environment, and keys Minddy did not
 * issue, are never touched. Run nightly by the retention sweep (lib/server/retention.ts).
 */
export async function sweepOrphanKeys(): Promise<{ managed: number; deleted: number }> {
  ensurePerUserMode();
  const [keys, stored] = await Promise.all([listKeys(), storedKeyHashes()]);
  const cutoff = Date.now() - SWEEP_GRACE_MS;
  let managed = 0;
  let deleted = 0;
  for (const key of keys) {
    if (!isManagedKey(key)) continue;
    managed += 1;
    if (stored.has(key.hash)) continue;
    if (!key.createdAt || Date.parse(key.createdAt) > cutoff) continue;
    if (await deleteKey(key.hash)) deleted += 1;
  }
  return { managed, deleted };
}

/** Clears the in-process key cache (tests). */
export function clearManagedAiKeyCache(): void {
  cache.clear();
}
