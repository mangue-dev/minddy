import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedRowCodec, type StoredRow } from "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import {
  NUMO_WATCH_DATE_GRACE_MS,
  NUMO_WATCH_EXPIRY_DAYS,
  NUMO_WATCH_INSTRUCTION_MAX,
  NUMO_WATCH_LIMIT,
  normalizeNumoWatchInstruction,
  type NumoWatchAction,
  type NumoWatchItem,
  type NumoWatchOutcome,
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
 */

type Row = Record<string, unknown>;

const COLUMNS = "id, user_id, project_id, target_type, target_id, condition, action, instruction, encrypted_content, encryption_version, conversation_id, timezone, status, fire_at, expires_at, fired_at, outcome, created_at, updated_at";

/** What the clock reads to evaluate a watch: never the instruction. */
const CLOCK_COLUMNS = "id, user_id, project_id, target_type, target_id, condition, fire_at, expires_at, created_at";

const DAY_MS = 24 * 60 * 60 * 1000;

const context = (userId: string) => ({
  table: "numo_watches" as const,
  scope: { kind: "user" as const, id: userId },
});

export class NumoWatchError extends Error {
  constructor(
    readonly code: "invalid_instruction" | "invalid_date" | "limit_reached" | "not_found" | "database",
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

/** The user's active watches, newest first. */
export async function listActiveNumoWatches(service: SupabaseClient,
  userId: string): Promise<NumoWatchItem[]> {
  const { data, error } = await service.from("numo_watches").select(COLUMNS)
    .eq("user_id", userId).eq("status", "active")
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

async function countActive(service: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await service.from("numo_watches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "active");
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  return count ?? 0;
}

/**
 * Check a watch before anything is written: the instruction, and for a date
 * watch its time. Returns what the row stores. `create_watch` calls it before
 * cancelling the watch a new one replaces, so a refused replacement loses
 * nothing.
 */
export function validateNumoWatchInput(input: {
  target: NumoWatchTarget;
  instruction: unknown;
  now?: Date;
}): { instruction: string; fireAt: string | null; expiresAt: string } {
  const instruction = normalizeNumoWatchInstruction(input.instruction);
  if (!instruction) {
    throw new NumoWatchError("invalid_instruction",
      `instruction is required: one non-empty text of ${NUMO_WATCH_INSTRUCTION_MAX} characters at most.`);
  }
  const now = (input.now ?? new Date()).getTime();
  let expiresAt = now + NUMO_WATCH_EXPIRY_DAYS * DAY_MS;
  let fireAt: string | null = null;
  if (input.target.type === "date") {
    const at = Date.parse(input.target.fireAt);
    if (!Number.isFinite(at) || at <= now || at >= expiresAt) {
      throw new NumoWatchError("invalid_date",
        `The date must be in the future and within ${NUMO_WATCH_EXPIRY_DAYS} days.`);
    }
    fireAt = new Date(at).toISOString();
    // A clock that missed the time still fires it within the grace period.
    expiresAt = Math.max(expiresAt, at + NUMO_WATCH_DATE_GRACE_MS);
  }
  return { instruction, fireAt, expiresAt: new Date(expiresAt).toISOString() };
}

export async function createNumoWatch(service: SupabaseClient, userId: string, input: {
  projectId: string;
  target: NumoWatchTarget;
  action: NumoWatchAction;
  instruction: unknown;
  conversationId: string | null;
  timezone?: string | null;
  now?: Date;
}): Promise<NumoWatchItem> {
  const now = input.now ?? new Date();
  const valid = validateNumoWatchInput({ target: input.target, instruction: input.instruction, now });
  if (await countActive(service, userId) >= NUMO_WATCH_LIMIT) {
    throw new NumoWatchError("limit_reached",
      `The user already keeps ${NUMO_WATCH_LIMIT} active reminders, the maximum.`);
  }
  const stamp = now.toISOString();
  const timezone = typeof input.timezone === "string" && input.timezone.length <= 64 ? input.timezone : null;
  const row = await encodeNumoWatchRow({
    id: randomUUID(),
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
    created_at: stamp,
    updated_at: stamp,
  }, userId);
  const { data, error } = await service.from("numo_watches").insert(row)
    .select(COLUMNS).single();
  if (error || !data) throw new NumoWatchError("database", "Unable to save the reminder");
  // The count above and the insert are two statements: two calls in the
  // same instant could both pass. Counted again, the one past the cap goes.
  if (await countActive(service, userId) > NUMO_WATCH_LIMIT) {
    await service.from("numo_watches").delete().eq("user_id", userId).eq("id", row.id as string);
    throw new NumoWatchError("limit_reached",
      `The user already keeps ${NUMO_WATCH_LIMIT} active reminders, the maximum.`);
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

/** Cancel one of the user's active watches. True when it was active and is now cancelled. */
export async function cancelNumoWatch(service: SupabaseClient, userId: string,
  id: string): Promise<boolean> {
  const { data, error } = await service.from("numo_watches")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("id", id).eq("status", "active").select("id");
  if (error) throw new NumoWatchError("database", "Unable to cancel the reminder");
  return (data ?? []).length > 0;
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
  return (data ?? []) as unknown as ClockWatch[];
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
 * Watches claimed by a clock that died before recording how the firing went
 * (`fired`, no outcome, claimed over ten minutes ago, within the last two
 * days). Each is re-claimed once: its outcome is set to `failed` first, so a
 * second crash leaves it failed rather than retrying forever.
 */
export async function claimStrandedNumoWatches(service: SupabaseClient, now = new Date(),
  limit = 20): Promise<NumoWatchItem[]> {
  const { data, error } = await service.from("numo_watches").select(COLUMNS)
    .eq("status", "fired").is("outcome", null)
    .lt("fired_at", new Date(now.getTime() - 10 * 60 * 1000).toISOString())
    .gt("fired_at", new Date(now.getTime() - 2 * DAY_MS).toISOString())
    .order("fired_at", { ascending: true }).limit(limit);
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  const claimed: NumoWatchItem[] = [];
  for (const row of (data ?? []) as Row[]) {
    const { data: won, error: claimError } = await service.from("numo_watches")
      .update({ outcome: "failed", updated_at: now.toISOString() })
      .eq("id", row.id as string).eq("status", "fired").is("outcome", null).select("id");
    if (claimError || (won ?? []).length === 0) continue;
    try {
      claimed.push(await decodeNumoWatchRow(row, row.user_id as string));
    } catch {
      console.error("[numo-watches] decode_failed");
    }
  }
  return claimed;
}

/** Ids of the `act` watches fired since `since`: their turns run in their own lane. */
export async function recentActedNumoWatchIds(service: SupabaseClient,
  since: Date): Promise<string[]> {
  const { data, error } = await service.from("numo_watches").select("id")
    .eq("status", "fired").eq("outcome", "acted").gte("fired_at", since.toISOString())
    .order("fired_at", { ascending: true }).limit(200);
  if (error) throw new NumoWatchError("database", "Unable to read the reminders");
  return (data ?? []).map((row) => row.id as string);
}

/** Record how a fired watch went. */
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

/** Active watches past their expiry become `expired`. Returns how many. */
export async function expireNumoWatches(service: SupabaseClient, now = new Date()): Promise<number> {
  const { data, error } = await service.from("numo_watches")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("status", "active").lte("expires_at", now.toISOString()).select("id");
  if (error) throw new NumoWatchError("database", "Unable to expire the reminders");
  return (data ?? []).length;
}

/** Retention: fired, cancelled and expired watches older than `before` go. */
export async function purgeFinishedNumoWatches(service: SupabaseClient,
  before: string): Promise<number> {
  const { data, error } = await service.from("numo_watches").delete()
    .neq("status", "active").lt("updated_at", before).select("id");
  if (error) throw error;
  return (data ?? []).length;
}
