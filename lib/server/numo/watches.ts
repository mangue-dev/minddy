import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedRowCodec, type StoredRow } from "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import {
  NUMO_RECURRING_FAILURE_LIMIT,
  NUMO_RECURRING_WATCH_LIMIT,
  NUMO_WATCH_DATE_GRACE_MS,
  NUMO_WATCH_EXPIRY_DAYS,
  NUMO_WATCH_INSTRUCTION_MAX,
  NUMO_WATCH_LIMIT,
  isValidTimeZone,
  nextOccurrence,
  normalizeNumoWatchInstruction,
  parseNumoWatchGrants,
  parseNumoWatchRecurrence,
  type NumoWatchAction,
  type NumoWatchGrant,
  type NumoWatchItem,
  type NumoWatchOutcome,
  type NumoWatchRecurrence,
  type NumoWatchStatus,
  type NumoWatchTarget,
} from "@/lib/numo-watches";

/**
 * Numo's reminders (MIN-923): the codec and the only repository of
 * `numo_watches`. Every user-facing call is bound to one user and filters on
 * it, since the table is service-only; the routines clock reads the active
 * watches without their instruction and decodes one only when it fires it.
 * The instruction is sealed under the user's key once content encryption is
 * enabled, like Numo's memory.
 *
 * A recurring reminder (MIN-953) never becomes `fired`: the clock claims an
 * occurrence by moving `fire_at` to the next one in a single conditional
 * update, so the row stays `active` and no later occurrence depends on what
 * happens to this one. `fired_at` then names the occurrence (its turn's
 * request id is derived from it) and `outcome` says how it went.
 */

type Row = Record<string, unknown>;

const COLUMNS = "id, user_id, project_id, target_type, target_id, condition, action, instruction, encrypted_content, encryption_version, conversation_id, timezone, status, fire_at, expires_at, fired_at, outcome, recurrence, grants, consecutive_failures, created_at, updated_at";

/** What the clock reads to evaluate a watch: never the instruction. */
const CLOCK_COLUMNS = "id, user_id, project_id, target_type, target_id, condition, fire_at, expires_at, recurrence, timezone, created_at";

/** A reminder the user still keeps: waiting, or paused. */
const OPEN_STATUSES = ["active", "paused"];

const DAY_MS = 24 * 60 * 60 * 1000;

const context = (userId: string) => ({
  table: "numo_watches" as const,
  scope: { kind: "user" as const, id: userId },
});

export class NumoWatchError extends Error {
  constructor(
    readonly code: "invalid_instruction" | "invalid_date" | "invalid_recurrence" | "invalid_grants"
      | "limit_reached" | "recurring_limit_reached" | "conflict" | "not_found" | "database",
    message: string,
  ) {
    super(message);
  }
}

/** Seal a complete row before it is written, when content encryption is on. */
export async function encodeNumoWatchRow(row: Row, userId: string,
  options: { force?: boolean } = {}): Promise<Row> {
  if (row.user_id !== userId || typeof row.id !== "string" || !row.id ||
      typeof row.instruction !== "string") {
    throw new Error("Incomplete Numo watch");
  }
  if (!options.force && !isContentEncryptionEnabled()) {
    return { ...row, encryption_version: 0, encrypted_content: null };
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  } as StoredRow, context(userId));
}

export async function decodeNumoWatchRow(row: Row, userId: string): Promise<NumoWatchItem> {
  if (row.user_id !== userId) throw new Error("Invalid Numo watch owner");
  let instruction: unknown;
  if (row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid clear Numo watch");
    instruction = row.instruction;
  } else {
    const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
      row as StoredRow, context(userId), { actorId: userId, reason: "repository_read" });
    instruction = decoded.instruction;
  }
  if (typeof instruction !== "string") throw new Error("Invalid Numo watch instruction");
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    project_id: row.project_id as string,
    target_type: row.target_type as NumoWatchItem["target_type"],
    target_id: (row.target_id as string | null) ?? null,
    condition: row.condition as NumoWatchItem["condition"],
    action: row.action as NumoWatchAction,
    instruction,
    conversation_id: (row.conversation_id as string | null) ?? null,
    timezone: (row.timezone as string | null) ?? null,
    status: row.status as NumoWatchStatus,
    fire_at: (row.fire_at as string | null) ?? null,
    expires_at: row.expires_at as string,
    fired_at: (row.fired_at as string | null) ?? null,
    outcome: (row.outcome as NumoWatchOutcome | null) ?? null,
    recurrence: parseNumoWatchRecurrence(row.recurrence),
    grants: parseNumoWatchGrants(row.grants) ?? [],
    consecutive_failures: typeof row.consecutive_failures === "number" ? row.consecutive_failures : 0,
    created_at: row.created_at as string,
  };
}

async function decodeAll(rows: Row[], userId: string): Promise<NumoWatchItem[]> {
  const watches: NumoWatchItem[] = [];
  for (const row of rows) {
    try {
      watches.push(await decodeNumoWatchRow(row, userId));
    } catch {
      console.error("[numo-watches] decode_failed");
    }
  }
  return watches;
}

/** The watches the user keeps (active, or paused), newest first. */
export async function listOpenNumoWatches(service: SupabaseClient,
  userId: string): Promise<NumoWatchItem[]> {
  const { data, error } = await service.from("numo_watches").select(COLUMNS)
    .eq("user_id", userId).in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(NUMO_WATCH_LIMIT * 2);
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  return decodeAll((data ?? []) as Row[], userId);
}

/** Every watch of the user, for the account export. */
export async function listAllNumoWatches(service: SupabaseClient,
  userId: string): Promise<NumoWatchItem[]> {
  const { data, error } = await service.from("numo_watches").select(COLUMNS)
    .eq("user_id", userId).order("created_at", { ascending: true }).limit(1000);
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  return decodeAll((data ?? []) as Row[], userId);
}

async function countActive(service: SupabaseClient, userId: string,
  options: { recurring?: boolean } = {}): Promise<number> {
  let query = service.from("numo_watches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "active");
  if (options.recurring) query = query.not("recurrence", "is", null);
  const { count, error } = await query;
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  return count ?? 0;
}

const LIMIT_MESSAGE = `The user already keeps ${NUMO_WATCH_LIMIT} active reminders, the maximum.`;
const RECURRING_LIMIT_MESSAGE =
  `The user already keeps ${NUMO_RECURRING_WATCH_LIMIT} active recurring reminders, the maximum.`;

/** Refuse a reminder past the user's caps. `added` is 1 once the row is written. */
async function assertWithinLimits(service: SupabaseClient, userId: string,
  recurring: boolean, added: 0 | 1): Promise<void> {
  if (await countActive(service, userId) + (1 - added) > NUMO_WATCH_LIMIT) {
    throw new NumoWatchError("limit_reached", LIMIT_MESSAGE);
  }
  if (recurring &&
      await countActive(service, userId, { recurring: true }) + (1 - added) > NUMO_RECURRING_WATCH_LIMIT) {
    throw new NumoWatchError("recurring_limit_reached", RECURRING_LIMIT_MESSAGE);
  }
}

/**
 * A recurring reminder does not expire. The column stays ahead of the next
 * occurrence so that the previous release, which expires every active row,
 * leaves it alone.
 */
function recurringExpiry(fireAt: Date): string {
  return new Date(fireAt.getTime() + NUMO_WATCH_EXPIRY_DAYS * DAY_MS).toISOString();
}

/**
 * The request id of the turn one occurrence runs in: stable for the
 * occurrence (`fired_at` names it), so a retry admits the same turn and the
 * reminders lane finds it.
 */
export function numoWatchOccurrenceRequestId(watchId: string, firedAt: string): string {
  const hex = createHash("sha256").update(`${watchId}:${Date.parse(firedAt)}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Check a watch before anything is written: the instruction, for a date
 * watch its time, and for a recurring one its cadence, time zone and grants.
 * Returns what the row stores. `create_watch` calls it before cancelling the
 * watch a new one replaces, so a refused replacement loses nothing.
 */
export function validateNumoWatchInput(input: {
  target: NumoWatchTarget;
  action?: NumoWatchAction;
  instruction: unknown;
  recurrence?: unknown;
  grants?: unknown;
  timezone?: string | null;
  now?: Date;
}): {
  instruction: string;
  fireAt: string | null;
  expiresAt: string;
  recurrence: NumoWatchRecurrence | null;
  grants: NumoWatchGrant[];
} {
  const instruction = normalizeNumoWatchInstruction(input.instruction);
  if (!instruction) {
    throw new NumoWatchError("invalid_instruction",
      `instruction is required: one non-empty text of ${NUMO_WATCH_INSTRUCTION_MAX} characters at most.`);
  }
  const grants = parseNumoWatchGrants(input.grants);
  if (!grants) throw new NumoWatchError("invalid_grants", "grants names a permission that does not exist.");
  const now = input.now ?? new Date();
  if (input.recurrence !== null && input.recurrence !== undefined) {
    const recurrence = parseNumoWatchRecurrence(input.recurrence);
    if (!recurrence || input.target.type !== "date" || input.action !== "act") {
      throw new NumoWatchError("invalid_recurrence",
        "A recurring reminder is a date reminder with the action act and a cadence: daily, weekdays, weekly with a weekday (1 Monday to 7 Sunday) or monthly with a day (1 to 31), at a time HH:MM.");
    }
    if (!isValidTimeZone(input.timezone)) {
      throw new NumoWatchError("invalid_recurrence", "A recurring reminder needs the user's time zone.");
    }
    const first = nextOccurrence(recurrence, input.timezone, now);
    return { instruction, fireAt: first.toISOString(), expiresAt: recurringExpiry(first), recurrence, grants };
  }
  if (grants.length > 0) {
    throw new NumoWatchError("invalid_grants", "Only a recurring reminder can carry permissions.");
  }
  let expiresAt = now.getTime() + NUMO_WATCH_EXPIRY_DAYS * DAY_MS;
  let fireAt: string | null = null;
  if (input.target.type === "date") {
    const at = Date.parse(input.target.fireAt);
    if (!Number.isFinite(at) || at <= now.getTime() || at >= expiresAt) {
      throw new NumoWatchError("invalid_date",
        `The date must be in the future and within ${NUMO_WATCH_EXPIRY_DAYS} days.`);
    }
    fireAt = new Date(at).toISOString();
    // A clock that missed the time still fires it within the grace period.
    expiresAt = Math.max(expiresAt, at + NUMO_WATCH_DATE_GRACE_MS);
  }
  return { instruction, fireAt, expiresAt: new Date(expiresAt).toISOString(), recurrence: null, grants };
}

export async function createNumoWatch(service: SupabaseClient, userId: string, input: {
  /** Set by the confirmation of a proposal, so confirming twice writes once. */
  id?: string;
  projectId: string;
  target: NumoWatchTarget;
  action: NumoWatchAction;
  instruction: unknown;
  recurrence?: unknown;
  grants?: unknown;
  conversationId: string | null;
  timezone?: string | null;
  now?: Date;
}): Promise<NumoWatchItem> {
  const now = input.now ?? new Date();
  const valid = validateNumoWatchInput({
    target: input.target, action: input.action, instruction: input.instruction,
    recurrence: input.recurrence, grants: input.grants, timezone: input.timezone, now,
  });
  const recurring = valid.recurrence !== null;
  await assertWithinLimits(service, userId, recurring, 0);
  const stamp = now.toISOString();
  const timezone = typeof input.timezone === "string" && input.timezone.length <= 64 ? input.timezone : null;
  const row = await encodeNumoWatchRow({
    id: input.id ?? randomUUID(),
    user_id: userId,
    project_id: input.projectId,
    target_type: input.target.type,
    target_id: input.target.id,
    condition: input.target.condition,
    action: input.action,
    instruction: valid.instruction,
    conversation_id: input.conversationId,
    timezone,
    status: "active",
    fire_at: valid.fireAt,
    expires_at: valid.expiresAt,
    recurrence: valid.recurrence,
    grants: valid.grants,
    created_at: stamp,
    updated_at: stamp,
  }, userId);
  const { data, error } = await service.from("numo_watches").insert(row)
    .select(COLUMNS).single();
  if (error?.code === "23505") throw new NumoWatchError("conflict", "This reminder is already set.");
  if (error || !data) throw new NumoWatchError("database", "Unable to save the reminder");
  // The counts above and the insert are separate statements: two calls in
  // the same instant could both pass. Counted again, the one past a cap goes.
  try {
    await assertWithinLimits(service, userId, recurring, 1);
  } catch (limitError) {
    await service.from("numo_watches").delete().eq("user_id", userId).eq("id", row.id as string);
    throw limitError;
  }
  return decodeNumoWatchRow(data as Row, userId);
}

/** Bring back a watch cancelled by a replacement that then failed. */
export async function restoreNumoWatch(service: SupabaseClient, userId: string,
  id: string): Promise<void> {
  const { error } = await service.from("numo_watches")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("id", id).eq("status", "canceled");
  if (error) console.error("[numo-watches] restore_failed", { code: error.code });
}

/** One watch of the user, any status; null when there is none. */
export async function getNumoWatch(service: SupabaseClient, userId: string,
  id: string): Promise<NumoWatchItem | null> {
  const { data, error } = await service.from("numo_watches").select(COLUMNS)
    .eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new NumoWatchError("database", "Unable to read the reminder");
  return data ? decodeNumoWatchRow(data as Row, userId) : null;
}

/** Cancel one of the watches the user keeps. True when it was active or paused and is now cancelled. */
export async function cancelNumoWatch(service: SupabaseClient, userId: string,
  id: string): Promise<boolean> {
  const { data, error } = await service.from("numo_watches")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("id", id).in("status", OPEN_STATUSES).select("id");
  if (error) throw new NumoWatchError("database", "Unable to cancel the reminder");
  return (data ?? []).length > 0;
}

/** Pause one of the user's active recurring watches. True when it is now paused. */
export async function pauseNumoWatch(service: SupabaseClient, userId: string,
  id: string): Promise<boolean> {
  const { data, error } = await service.from("numo_watches")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("id", id).eq("status", "active")
    .not("recurrence", "is", null).select("id");
  if (error) throw new NumoWatchError("database", "Unable to pause the reminder");
  return (data ?? []).length > 0;
}

/**
 * Resume a paused recurring watch at its next occurrence, with its failure
 * count cleared. Null when the user has no paused watch with this id.
 */
export async function resumeNumoWatch(service: SupabaseClient, userId: string,
  id: string, now = new Date()): Promise<NumoWatchItem | null> {
  const watch = await getNumoWatch(service, userId, id);
  if (!watch || watch.status !== "paused" || !watch.recurrence || !isValidTimeZone(watch.timezone)) return null;
  await assertWithinLimits(service, userId, true, 0);
  const next = nextOccurrence(watch.recurrence, watch.timezone, now);
  const { data, error } = await service.from("numo_watches")
    .update({
      status: "active", fire_at: next.toISOString(), expires_at: recurringExpiry(next),
      consecutive_failures: 0, updated_at: now.toISOString(),
    })
    .eq("user_id", userId).eq("id", id).eq("status", "paused").select(COLUMNS).maybeSingle();
  if (error) throw new NumoWatchError("database", "Unable to resume the reminder");
  if (!data) return null;
  try {
    await assertWithinLimits(service, userId, true, 1);
  } catch (limitError) {
    await service.from("numo_watches").update({ status: "paused", updated_at: now.toISOString() })
      .eq("user_id", userId).eq("id", id).eq("status", "active");
    throw limitError;
  }
  return decodeNumoWatchRow(data as Row, userId);
}

/**
 * Change the instruction or the cadence of a recurring watch the user keeps.
 * A new cadence moves the next occurrence. Its grants never change here: the
 * user confirmed them for the reminder as it was, so a reminder that holds
 * any is replaced instead (`create_watch` with `replaces`, confirmed again).
 * Null when the user keeps no recurring watch with this id.
 */
export async function updateNumoWatch(service: SupabaseClient, userId: string, id: string, changes: {
  instruction?: unknown;
  recurrence?: unknown;
  now?: Date;
}): Promise<NumoWatchItem | null> {
  const { data: stored, error: readError } = await service.from("numo_watches").select(COLUMNS)
    .eq("user_id", userId).eq("id", id).in("status", OPEN_STATUSES).maybeSingle();
  if (readError) throw new NumoWatchError("database", "Unable to read the reminder");
  if (!stored) return null;
  const watch = await decodeNumoWatchRow(stored as Row, userId);
  if (!watch.recurrence) return null;
  const now = changes.now ?? new Date();
  const valid = validateNumoWatchInput({
    target: { type: "date", id: null, condition: { kind: "date" }, fireAt: "" },
    action: "act",
    instruction: changes.instruction ?? watch.instruction,
    recurrence: changes.recurrence ?? watch.recurrence,
    grants: watch.grants,
    timezone: watch.timezone,
    now,
  });
  const sealed = await encodeNumoWatchRow({ ...(stored as Row), instruction: valid.instruction }, userId);
  const moved = changes.recurrence !== undefined && changes.recurrence !== null;
  const { data, error } = await service.from("numo_watches")
    .update({
      instruction: sealed.instruction,
      encrypted_content: sealed.encrypted_content,
      encryption_version: sealed.encryption_version,
      recurrence: valid.recurrence,
      ...(moved ? { fire_at: valid.fireAt, expires_at: valid.expiresAt } : {}),
      updated_at: now.toISOString(),
    })
    .eq("user_id", userId).eq("id", id).in("status", OPEN_STATUSES).select(COLUMNS).maybeSingle();
  if (error) throw new NumoWatchError("database", "Unable to save the reminder");
  return data ? decodeNumoWatchRow(data as Row, userId) : null;
}

/** One active watch as the clock sees it, without its instruction. */
export interface ClockWatch {
  id: string;
  user_id: string;
  project_id: string;
  target_type: "issue" | "objective" | "date";
  target_id: string | null;
  condition: NumoWatchItem["condition"];
  fire_at: string | null;
  expires_at: string;
  recurrence: NumoWatchRecurrence | null;
  timezone: string | null;
  created_at: string;
}

/**
 * One page of active watches, by id, after `afterId`: the clock walks them
 * all, page by page, within its deadline. Expired ones are included, so a
 * condition met just before expiry still fires; the clock expires the rest
 * after evaluating.
 */
export async function listClockWatches(service: SupabaseClient, afterId: string | null,
  limit: number): Promise<ClockWatch[]> {
  let query = service.from("numo_watches").select(CLOCK_COLUMNS).eq("status", "active");
  if (afterId) query = query.gt("id", afterId);
  const { data, error } = await query.order("id", { ascending: true }).limit(limit);
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  return ((data ?? []) as Row[]).map((row) => ({
    ...row, recurrence: parseNumoWatchRecurrence(row.recurrence),
  })) as unknown as ClockWatch[];
}

/**
 * Claim a watch for firing: `active` → `fired` in one conditional update, so
 * two clocks that see the same condition fire it once. Returns the decoded
 * watch for the clock that won, null otherwise.
 */
export async function claimNumoWatch(service: SupabaseClient, watch: Pick<ClockWatch, "id" | "user_id">,
  now = new Date()): Promise<NumoWatchItem | null> {
  const stamp = now.toISOString();
  const { data, error } = await service.from("numo_watches")
    .update({ status: "fired", fired_at: stamp, updated_at: stamp })
    .eq("id", watch.id).eq("user_id", watch.user_id).eq("status", "active")
    .select(COLUMNS).maybeSingle();
  if (error) throw new NumoWatchError("database", "Unable to fire the reminder");
  return data ? decodeNumoWatchRow(data as Row, watch.user_id) : null;
}

/**
 * Move a recurring watch to its next occurrence, in one conditional update
 * on the `fire_at` the clock read: two clocks that see the same occurrence
 * move it once. With `fire: true` the occurrence is claimed for firing
 * (`fired_at` names it, its outcome is open) and the decoded watch returned
 * to the clock that won; without, a missed occurrence is skipped. Null when
 * another clock was first, or the watch is no longer active.
 */
export async function advanceRecurringNumoWatch(service: SupabaseClient, watch: ClockWatch,
  options: { fire: boolean; now?: Date }): Promise<NumoWatchItem | null> {
  if (!watch.recurrence || !watch.fire_at || !isValidTimeZone(watch.timezone)) return null;
  const now = options.now ?? new Date();
  const stamp = now.toISOString();
  const next = nextOccurrence(watch.recurrence, watch.timezone, now);
  const { data, error } = await service.from("numo_watches")
    .update({
      fire_at: next.toISOString(), expires_at: recurringExpiry(next), updated_at: stamp,
      // `conversation_id` is the last occurrence's: none yet for this one.
      ...(options.fire ? { fired_at: stamp, outcome: null, conversation_id: null } : {}),
    })
    .eq("id", watch.id).eq("user_id", watch.user_id).eq("status", "active")
    .eq("fire_at", watch.fire_at).select(COLUMNS).maybeSingle();
  if (error) throw new NumoWatchError("database", "Unable to fire the reminder");
  return data ? decodeNumoWatchRow(data as Row, watch.user_id) : null;
}

/**
 * Record how one occurrence of a recurring watch went, by the `fired_at`
 * that names it: a later occurrence is never rewritten. `failed` counts one
 * more failure in a row and pauses the watch at the limit; `finished` (its
 * turn ended well) clears the count. Returns whether this call paused it.
 */
export async function recordNumoWatchOccurrence(service: SupabaseClient,
  occurrence: { id: string; firedAt: string }, result: {
    outcome?: NumoWatchOutcome;
    conversationId?: string;
    failed?: boolean;
    finished?: boolean;
  }): Promise<{ paused: boolean }> {
  const { data: row, error: readError } = await service.from("numo_watches")
    .select("id, status, fired_at, consecutive_failures")
    .eq("id", occurrence.id).not("recurrence", "is", null).maybeSingle();
  if (readError) {
    console.error("[numo-watches] outcome_failed", { code: readError.code });
    return { paused: false };
  }
  if (!row || Date.parse(row.fired_at as string) !== Date.parse(occurrence.firedAt)) return { paused: false };
  const failures = result.failed ? (row.consecutive_failures as number) + 1
    : result.finished ? 0 : row.consecutive_failures as number;
  const pause = result.failed === true && failures >= NUMO_RECURRING_FAILURE_LIMIT && row.status === "active";
  const { data, error } = await service.from("numo_watches")
    .update({
      ...(result.outcome ? { outcome: result.outcome } : {}),
      ...(result.conversationId ? { conversation_id: result.conversationId } : {}),
      consecutive_failures: failures,
      ...(pause ? { status: "paused" } : {}),
      updated_at: new Date().toISOString(),
    })
    // The count read above: a concurrent record is not counted twice.
    .eq("id", occurrence.id).eq("fired_at", row.fired_at as string)
    .eq("consecutive_failures", row.consecutive_failures as number).select("id");
  if (error) console.error("[numo-watches] outcome_failed", { code: error.code });
  return { paused: pause && !error && (data ?? []).length > 0 };
}

/**
 * Watches claimed by a clock that died before recording how the firing went
 * (no outcome, claimed over ten minutes ago, within the last two days): a
 * `fired` one-off, or an occurrence of a recurring watch. Each is re-claimed
 * once: its outcome is set to `failed` first, so a second crash leaves it
 * failed rather than retrying forever.
 */
export async function claimStrandedNumoWatches(service: SupabaseClient, now = new Date(),
  limit = 20): Promise<NumoWatchItem[]> {
  const { data, error } = await service.from("numo_watches").select(COLUMNS)
    .in("status", ["fired", "active"]).is("outcome", null)
    .lt("fired_at", new Date(now.getTime() - 10 * 60 * 1000).toISOString())
    .gt("fired_at", new Date(now.getTime() - 2 * DAY_MS).toISOString())
    .order("fired_at", { ascending: true }).limit(limit);
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  const claimed: NumoWatchItem[] = [];
  for (const row of (data ?? []) as Row[]) {
    const { data: won, error: claimError } = await service.from("numo_watches")
      .update({ outcome: "failed", updated_at: now.toISOString() })
      .eq("id", row.id as string).eq("status", row.status as string).is("outcome", null).select("id");
    if (claimError || (won ?? []).length === 0) continue;
    try {
      claimed.push(await decodeNumoWatchRow(row, row.user_id as string));
    } catch {
      console.error("[numo-watches] decode_failed");
    }
  }
  return claimed;
}

/**
 * Request ids of the turns that `act` watches started since `since`: their
 * turns run in their own lane. A one-off's turn carries the watch id, an
 * occurrence's the id derived from it.
 */
export async function recentActedNumoWatchRequestIds(service: SupabaseClient,
  since: Date): Promise<string[]> {
  const { data, error } = await service.from("numo_watches").select("id, recurrence, fired_at")
    .in("status", ["fired", "active", "paused"]).eq("outcome", "acted").gte("fired_at", since.toISOString())
    .order("fired_at", { ascending: true }).limit(200);
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  return ((data ?? []) as Row[]).map((row) => row.recurrence
    ? numoWatchOccurrenceRequestId(row.id as string, row.fired_at as string)
    : row.id as string);
}

/** Record how a fired one-off watch went. */
export async function recordNumoWatchOutcome(service: SupabaseClient, id: string,
  outcome: NumoWatchOutcome): Promise<void> {
  const { error } = await service.from("numo_watches")
    .update({ outcome, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "fired");
  // A turn that later fails rewrites `acted` to `failed`: the same update.
  if (error) console.error("[numo-watches] outcome_failed", { code: error.code });
}

/** Cancel watches the clock can no longer serve (target gone, project left). */
export async function cancelClockWatches(service: SupabaseClient, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await service.from("numo_watches")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .in("id", ids as string[]).eq("status", "active");
  if (error) throw new NumoWatchError("database", "Unable to cancel the reminders");
}

/** Active one-off watches past their expiry become `expired`; a recurring one never expires. Returns how many. */
export async function expireNumoWatches(service: SupabaseClient, now = new Date()): Promise<number> {
  const { data, error } = await service.from("numo_watches")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("status", "active").is("recurrence", null).lte("expires_at", now.toISOString()).select("id");
  if (error) throw new NumoWatchError("database", "Unable to expire the reminders");
  return (data ?? []).length;
}

/**
 * Retention: fired, cancelled and expired watches older than `before` go. A
 * paused one is still the user's to resume, and stays.
 */
export async function purgeFinishedNumoWatches(service: SupabaseClient,
  before: string): Promise<number> {
  const { data, error } = await service.from("numo_watches").delete()
    .in("status", ["fired", "canceled", "expired"]).lt("updated_at", before).select("id");
  if (error) throw error;
  return (data ?? []).length;
}
