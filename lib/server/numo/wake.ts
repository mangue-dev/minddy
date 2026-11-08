import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTranslator } from "next-intl";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import {
  NUMO_WAKE_DAILY_LIMIT_KEY,
  parseNumoWakeDailyLimit,
  resolveNumoBackgroundEnabled,
} from "@/lib/numo-background";
import { getAppConfigValue } from "@/lib/server/app-config";
import { getServiceClient } from "@/lib/supabase-service";
import { encodeConversationTitle, shouldProtectConversationTitle } from "./conversation-title-content";
import { startNumoIntent } from "./start-intent";
import { executeNumoTurn, requestNumoRequestStop } from "./turns";
import { loadWakeInput } from "./wake-context";
import { WAKE_TITLE_CHARS } from "./wake-decision";
import { buildNumoWakeMessage, type WakeMessageEvent } from "./wake-prompt";
import type { NumoWake, NumoWakeRequest } from "./wake-triage";

/**
 * Background Numo wakes up (MIN-929, fourth brick of MIN-925). When the wake
 * decision keeps events of a batch, Numo runs ONE ordinary turn: the same
 * loop, tools, model and rules as a conversation, admitted through
 * `startNumoIntent`, in the user's interface language. The turn reads the
 * kept events and the user's memory, acts within the background guard
 * (`lib/server/assistant/proactive-guard.ts`), and reports in its journal.
 *
 * - Background Numo or its memory switched off: no wake, and a wake turn
 *   still queued when the switch goes off is stopped before it runs.
 * - At most `numo_wake_daily_limit` wakes per user in 24 hours (admin
 *   setting, 20 by default). Past it, the batch closes without a wake; its
 *   events stay in the routine journal.
 * - A batch wakes Numo once: `numo_wakes.batch_id` is unique.
 * - Each wake gets a conversation of its own, like a routine occurrence: a
 *   conversation runs one turn at a time, and a fresh one keeps earlier
 *   wakes out of the history. `numo_wakes.conversation_id` is what leaves
 *   these conversations out of the conversation list; the retention sweep
 *   deletes them with their wake.
 * - The usage budget is checked by `startNumoIntent`, as for any turn.
 * - The routines clock only admits the turn. It runs in the Numo turns
 *   clock (`drainNumoWakeTurns`), with a whole invocation to itself, rather
 *   than in whatever time the routines tick has left.
 *
 * The turn's writes are Numo's (`withEventActor` in `executeNumoTurn`), so
 * they never feed another batch.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type NumoWakeOutcome = "switched_off" | "capped" | "duplicate" | "empty" | "started";

export class NumoWakeError extends Error {
  constructor(readonly step: string) {
    super(`Background wake failed: ${step}`);
    this.name = "NumoWakeError";
  }
}

function fail(error: { message?: string } | null, step: string): void {
  if (error) throw new NumoWakeError(step);
}

/** The daily cap the admin set, or its default. */
export async function numoWakeDailyLimit(): Promise<number> {
  return parseNumoWakeDailyLimit(await getAppConfigValue(NUMO_WAKE_DAILY_LIMIT_KEY));
}

/** Whether the user still has a background turn left in the last 24 hours. */
export async function hasNumoWakeLeft(userId: string, now = new Date(),
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  const limit = await numoWakeDailyLimit();
  if (limit === 0) return false;
  const { count, error } = await service.from("numo_wakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(now.getTime() - DAY_MS).toISOString());
  fail(error, "count_wakes");
  return (count ?? 0) < limit;
}

function localeOf(metadata: Record<string, unknown>): Locale {
  return locales.includes(metadata.locale as Locale) ? metadata.locale as Locale : defaultLocale;
}

async function createConversation(service: SupabaseClient, userId: string, id: string,
  locale: Locale): Promise<void> {
  // Outside any request (the routines clock): the catalog is loaded directly.
  const t = createTranslator({ locale, messages: await loadMessages(locale), namespace: "Account" });
  const title = t("numoBackgroundTitle");
  const stored = await shouldProtectConversationTitle(service)
    ? await encodeConversationTitle(userId, id, title)
    : title;
  const { error } = await service.from("conversations")
    .insert({ id, project_id: null, user_id: userId, title: stored });
  fail(error, "create_conversation");
}

/** The kept events, as the wake decision summarized them, with where each object lives. */
async function wakeEvents(service: SupabaseClient, userId: string,
  eventIds: number[]): Promise<WakeMessageEvent[]> {
  const input = await loadWakeInput(service, { user_id: userId, event_ids: eventIds });
  if (input.events.length === 0) return [];
  const { data, error } = await service.from("routine_events")
    .select("id, project_id, subject_type, subject_id").in("id", input.events.map((event) => event.id));
  fail(error, "read_events");
  const rows = new Map(((data ?? []) as Array<{ id: number; project_id: string; subject_type: string; subject_id: string }>)
    .map((row) => [row.id, row]));
  return input.events.flatMap((event) => {
    const row = rows.get(event.id);
    if (!row) return [];
    const title = event.object.title?.slice(0, WAKE_TITLE_CHARS) ?? null;
    return [{
      event: { ...event, object: { ...event.object, title } },
      projectId: row.project_id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
    }];
  });
}

/** Undo a wake whose turn did not start: it must not count against the cap. */
async function releaseWake(service: SupabaseClient, wakeId: string, userId: string,
  conversationId: string): Promise<void> {
  const [wake, conversation] = await Promise.all([
    service.from("numo_wakes").delete().eq("id", wakeId),
    service.from("conversations").delete().eq("id", conversationId).eq("user_id", userId),
  ]);
  if (wake.error || conversation.error) console.error("[numo-wake] release_failed");
}

/** Wake Numo for the events the triage kept: admit its turn. */
export async function wakeNumo(request: NumoWakeRequest): Promise<NumoWakeOutcome> {
  const service = getServiceClient();
  const { data: account, error } = await service.auth.admin.getUserById(request.userId);
  if (error) throw new NumoWakeError("read_account");
  const metadata = (account?.user?.user_metadata ?? {}) as Record<string, unknown>;
  if (!resolveNumoBackgroundEnabled(metadata)) return "switched_off";

  const { data: previous, error: previousError } = await service.from("numo_wakes")
    .select("id").eq("batch_id", request.batchId).maybeSingle();
  fail(previousError, "read_wake");
  if (previous) return "duplicate";
  if (!(await hasNumoWakeLeft(request.userId, new Date(), service))) {
    console.warn(`[numo-wake] batch=${request.batchId} capped`);
    return "capped";
  }

  const events = await wakeEvents(service, request.userId, request.eventIds);
  if (events.length === 0) return "empty";
  const locale = localeOf(metadata);

  // The wake row comes first: it claims the batch, and marks the
  // conversation as a background one before it exists.
  const wakeId = randomUUID();
  const conversationId = randomUUID();
  const { error: wakeError } = await service.from("numo_wakes").insert({
    id: wakeId, user_id: request.userId, batch_id: request.batchId, conversation_id: conversationId,
  });
  if (wakeError?.code === "23505") return "duplicate";
  fail(wakeError, "record_wake");

  let turnId: string;
  try {
    await createConversation(service, request.userId, conversationId, locale);
    const started = await startNumoIntent({
      supabase: service,
      userId: request.userId,
      userMetadata: metadata,
      projectId: null,
      prompt: buildNumoWakeMessage({ sentence: request.sentence, events }),
      locale,
      // Accounts keep no timezone: the clock block and the event times are UTC.
      timezone: "UTC",
      source: "background",
      action: "custom",
      conversationId,
      conversationUserId: request.userId,
      requestId: randomUUID(),
      executeInBackground: false,
      triggerSource: "chat",
      wake: { batchId: request.batchId },
    });
    turnId = started.turnId;
  } catch (startError) {
    await releaseWake(service, wakeId, request.userId, conversationId);
    throw startError;
  }
  const { error: bindError } = await service.from("numo_wakes").update({ turn_id: turnId }).eq("id", wakeId);
  if (bindError) console.error(`[numo-wake] batch=${request.batchId} bind_failed`);
  console.info(`[numo-wake] batch=${request.batchId} started events=${events.length} reason=${request.reason}`);
  return "started";
}

/** The wake the triage calls (`wake-triage.ts`). */
export const numoWake: NumoWake = (request) => wakeNumo(request);

/** Wake turns admitted in the last day that are waiting to run, oldest first. */
async function dueWakeTurns(service: SupabaseClient, limit: number) {
  const { data: wakes, error } = await service.from("numo_wakes")
    .select("turn_id").not("turn_id", "is", null)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString())
    .order("created_at", { ascending: true }).limit(200);
  fail(error, "read_wakes");
  const ids = (wakes ?? []).map((row) => row.turn_id as string);
  if (ids.length === 0) return [];
  const { data, error: turnsError } = await service.from("numo_assistant_turns")
    .select("id, status, user_id, conversation_id, request_id")
    .in("id", ids).in("status", ["queued", "retryable"])
    .lte("not_before", new Date().toISOString())
    .order("created_at", { ascending: true }).limit(limit);
  fail(turnsError, "read_wake_turns");
  return (data ?? []) as Array<{ id: string; status: string; user_id: string; conversation_id: string; request_id: string }>;
}

/**
 * Stop a wake turn whose user switched background Numo off before it ran.
 * True when the turn was stopped and must not run.
 */
export async function stopIfBackgroundOff(service: SupabaseClient, turn: {
  user_id: string; conversation_id: string; request_id: string;
}): Promise<boolean> {
  const { data, error } = await service.auth.admin.getUserById(turn.user_id);
  if (error) throw new NumoWakeError("read_account");
  if (resolveNumoBackgroundEnabled((data?.user?.user_metadata ?? {}) as Record<string, unknown>)) return false;
  await requestNumoRequestStop({
    conversationId: turn.conversation_id, userId: turn.user_id, requestId: turn.request_id,
  });
  return true;
}

/** Wake turns that are the turn ids given, among those still waiting to run. */
export async function wakeTurnIds(service: SupabaseClient, turnIds: string[]): Promise<Set<string>> {
  if (turnIds.length === 0) return new Set();
  const { data, error } = await service.from("numo_wakes").select("turn_id").in("turn_id", turnIds);
  fail(error, "read_wakes");
  return new Set((data ?? []).map((row) => row.turn_id as string));
}

/**
 * Run the waiting wake turns, a few at a time: the Numo turns clock calls it
 * every minute. A turn another worker claimed first is skipped by its claim.
 */
export async function drainNumoWakeTurns(options: { limit?: number } = {}): Promise<{ ran: number }> {
  const service = getServiceClient();
  const turns = await dueWakeTurns(service, options.limit ?? 4);
  const results = await Promise.all(turns.map(async (turn) => {
    try {
      if (await stopIfBackgroundOff(service, turn)) return false;
      const result = await executeNumoTurn({
        turnId: turn.id,
        readClient: service,
        ...(turn.status === "retryable" ? { allowRetryable: true } : {}),
      });
      return result.status !== "not_claimed";
    } catch {
      console.error(`[numo-wake] turn=${turn.id} run_failed`);
      return false;
    }
  }));
  return { ran: results.filter(Boolean).length };
}
