import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTranslator } from "next-intl";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import type englishCatalog from "@/messages/en.json";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  NUMO_RECURRING_FAILURE_LIMIT,
  NUMO_RECURRING_GRACE_MS,
  type NumoWatchItem,
  type NumoWatchOutcome,
} from "@/lib/numo-watches";
import { commentStore } from "@/lib/server/comment-store";
import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { NUMO_NOTE_BODY_MAX, sendNumoNote, type NumoNoteLink } from "@/lib/server/numo-notes";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { encodeConversationTitle, shouldProtectConversationTitle } from "./conversation-title-content";
import { NumoIntentStartError, startNumoIntent } from "./start-intent";
import type { NumoTurn } from "./turns";
import {
  advanceRecurringNumoWatch,
  cancelClockWatches,
  claimNumoWatch,
  claimStrandedNumoWatches,
  expireNumoWatches,
  getNumoWatch,
  listClockWatches,
  numoWatchOccurrenceRequestId,
  recentActedNumoWatchRequestIds,
  recordNumoWatchOccurrence,
  recordNumoWatchOutcome,
  type ClockWatch,
} from "./watches";

/**
 * The reminders clock (MIN-923). The routines clock calls it every five
 * minutes. It walks every active watch, page by page, without reading any
 * instruction, compares each with the current state of its target, and fires
 * the ones whose condition holds, once each. No model call is made until a
 * watch fires.
 *
 * Firing:
 * - `notify`: a note in the user's inbox, linked to the target.
 * - `act`: the same note, saying Numo is on it, then a Numo turn that
 *   carries out the instruction in the conversation the watch came from (a
 *   new conversation, titled with what happened, when that one is gone or
 *   busy). The turn runs unattended (`intent.reminder`, see `turns.ts`):
 *   with the user's tools and rights at that moment, but no memory writes,
 *   no question, no reminder tools and no sensitive action. It runs in its
 *   own lane of the Numo turns clock (`drainNumoWatchTurns`). Out of usage,
 *   the watch falls back to a note that says so; a turn that later fails
 *   tells the user too (`notifyReminderOfNumoTurn`).
 *
 * A recurring reminder (MIN-953) comes back on its cadence. Each occurrence
 * is claimed by moving the watch to its next one, in the same update, before
 * anything is sent: a clock that dies afterwards loses no later occurrence.
 * An occurrence missed by more than `NUMO_RECURRING_GRACE_MS` is skipped, not
 * caught up. Each one runs in a conversation of its own, under the
 * background guard with the grants the user confirmed (`intent.reminder
 * .recurring`, see `turns.ts`), and sends no "on it" note. Three occurrences
 * in a row that do not finish pause the reminder, and the user is told.
 *
 * A watch is claimed (`active` → `fired`) before anything is sent, so two
 * clocks never fire it twice; a clock that dies after the claim leaves it
 * for one retry (`claimStrandedNumoWatches`). A watch whose user lost access
 * to the project, or whose target no longer exists, is cancelled; a target in
 * the trash only waits, since it may come back.
 */

/** Watches read per page. */
const PAGE_SIZE = 500;
/** Watches fired per tick; the rest fire on the next tick. */
const FIRES_PER_TICK = 50;
/** Recent comments read per watched issue. */
const COMMENTS_PER_ISSUE = 20;

export interface WatchTargetState {
  issues: Map<string, { project_id: string; status: string; number: number; trashed: boolean }>;
  objectives: Map<string, { project_id: string; status: string; trashed: boolean }>;
  /** Recent comments on watched issues, newest first. */
  comments: Map<string, Array<{ author_id: string | null; created_at: string }>>;
}

export type WatchVerdict = "fire" | "wait" | "gone";

/**
 * Whether the watch's condition holds now. Pure. A comment counts when it
 * was written after the watch by someone other than the user (Numo's
 * comments in the user's name included): the user does not need a reminder
 * of their own comment. A comment without an author (a forge or an
 * integration) counts. A target in the trash waits.
 */
export function evaluateWatch(watch: ClockWatch, state: WatchTargetState, now: Date): WatchVerdict {
  const condition = watch.condition;
  if (watch.target_type === "date") {
    return watch.fire_at && Date.parse(watch.fire_at) <= now.getTime() ? "fire" : "wait";
  }
  if (!watch.target_id) return "gone";
  if (watch.target_type === "issue") {
    const issue = state.issues.get(watch.target_id);
    if (!issue || issue.project_id !== watch.project_id) return "gone";
    if (issue.trashed) return "wait";
    if (condition.kind === "status") return issue.status === condition.status ? "fire" : "wait";
    if (condition.kind === "comment") {
      const since = Date.parse(watch.created_at);
      const fresh = (state.comments.get(watch.target_id) ?? []).some((comment) =>
        comment.author_id !== watch.user_id && Date.parse(comment.created_at) > since);
      return fresh ? "fire" : "wait";
    }
    return "gone";
  }
  const objective = state.objectives.get(watch.target_id);
  if (!objective || objective.project_id !== watch.project_id) return "gone";
  if (objective.trashed) return "wait";
  return condition.kind === "status" && objective.status === condition.status ? "fire" : "wait";
}

async function loadTargetState(service: SupabaseClient, watches: ClockWatch[]): Promise<WatchTargetState> {
  const ids = (type: ClockWatch["target_type"], kind?: string) => [...new Set(watches
    .filter((watch) => watch.target_type === type && watch.target_id &&
      (!kind || watch.condition.kind === kind))
    .map((watch) => watch.target_id as string))];
  const state: WatchTargetState = { issues: new Map(), objectives: new Map(), comments: new Map() };
  const issueIds = ids("issue");
  for (let offset = 0; offset < issueIds.length; offset += 200) {
    // Trashed rows too: a trashed target waits instead of being cancelled.
    const { data, error } = await issueStore(service).select("id, project_id, status, number, deleted_at")
      .in("id", issueIds.slice(offset, offset + 200));
    if (error) throw new Error("Unable to read watched issues");
    for (const row of data ?? []) {
      state.issues.set(row.id as string, {
        project_id: row.project_id as string, status: row.status as string,
        number: row.number as number, trashed: row.deleted_at != null,
      });
    }
  }
  const objectiveIds = ids("objective");
  for (let offset = 0; offset < objectiveIds.length; offset += 200) {
    const { data, error } = await objectiveStore(service).select("id, project_id, status, deleted_at")
      .in("id", objectiveIds.slice(offset, offset + 200));
    if (error) throw new Error("Unable to read watched objectives");
    for (const row of data ?? []) {
      state.objectives.set(row.id as string, {
        project_id: row.project_id as string, status: row.status as string, trashed: row.deleted_at != null,
      });
    }
  }
  // One read per watched issue: a busy issue never crowds out a quiet one.
  for (const issueId of ids("issue", "comment")) {
    const { data, error } = await commentStore(service).select("issue_id, author_id, created_at")
      .eq("issue_id", issueId).order("created_at", { ascending: false }).limit(COMMENTS_PER_ISSUE);
    if (error) throw new Error("Unable to read watched comments");
    state.comments.set(issueId, ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      author_id: (row.author_id as string | null) ?? null, created_at: row.created_at as string,
    })));
  }
  return state;
}

/** The catalog, typed like the English one so placeholders are checked. */
async function catalog(locale: Locale): Promise<typeof englishCatalog> {
  return await loadMessages(locale) as unknown as typeof englishCatalog;
}

function localeOf(metadata: Record<string, unknown>): Locale {
  return locales.includes(metadata.locale as Locale) ? metadata.locale as Locale : defaultLocale;
}

/** How the target is named in the note and in Numo's message. */
async function subjectOf(service: SupabaseClient, watch: NumoWatchItem): Promise<string | null> {
  if (watch.target_type === "issue" && watch.target_id) {
    const [{ data: issue }, { data: project }] = await Promise.all([
      issueStore(service).select("number").eq("id", watch.target_id)
        .eq("project_id", watch.project_id).maybeSingle(),
      service.from("projects").select("key").eq("id", watch.project_id).maybeSingle(),
    ]);
    return issue && project ? issueIdentifier(project.key as string, issue.number as number) : null;
  }
  if (watch.target_type === "objective" && watch.target_id) {
    const { data } = await objectiveStore(service, watch.user_id).select("name")
      .eq("id", watch.target_id).eq("project_id", watch.project_id).maybeSingle();
    return typeof data?.name === "string" ? data.name : null;
  }
  return null;
}

/**
 * How each watch's target is named, for the settings list (at most 20 per
 * user). A project the user can no longer open names nothing: its watch is
 * cancelled at the next tick.
 */
export async function watchSubjects(service: SupabaseClient, userId: string,
  watches: readonly NumoWatchItem[]): Promise<Map<string, { subject: string | null; accessible: boolean }>> {
  const access = new Map<string, Promise<boolean>>();
  const canOpen = (projectId: string) => {
    if (!access.has(projectId)) {
      access.set(projectId, getProjectAccess(userId, projectId).then((value) => !!value, () => false));
    }
    return access.get(projectId) as Promise<boolean>;
  };
  const named = await Promise.all(watches.map(async (watch) => {
    const accessible = await canOpen(watch.project_id);
    const subject = accessible ? await subjectOf(service, watch).catch(() => null) : null;
    return [watch.id, { subject, accessible }] as const;
  }));
  return new Map(named);
}

/** The note's title: what happened, in the user's language. */
export async function watchNoteTitle(watch: NumoWatchItem, subject: string | null,
  locale: Locale): Promise<string> {
  const messages = await catalog(locale);
  const t = createTranslator({ locale, messages, namespace: "Account" });
  const name = subject ?? t("numoWatchSubjectFallback");
  const condition = watch.condition;
  if (watch.target_type === "date") return t("numoWatchNoteDate");
  if (condition.kind === "comment") return t("numoWatchNoteComment", { subject: name });
  const status = condition.kind === "status" ? condition.status : "";
  const label = watch.target_type === "issue"
    ? createTranslator({ locale, messages, namespace: "Status" })(status as "done")
    : createTranslator({ locale, messages, namespace: "ObjectiveStatus" })(status as "done");
  return t("numoWatchNoteStatus", { subject: name, status: label });
}

function linkOf(watch: NumoWatchItem): NumoNoteLink | null {
  if (watch.target_type === "issue" && watch.target_id) return { type: "issue", id: watch.target_id };
  if (watch.target_type === "objective" && watch.target_id) return { type: "objective", id: watch.target_id };
  return null;
}

function isBudgetError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "usage_budget_exceeded" || (error as Error | null)?.message === "usage_budget_exceeded";
}

/** A conversation of the watch's own, titled with what happened. */
async function createWatchConversation(service: SupabaseClient, watch: NumoWatchItem,
  title: string): Promise<string> {
  const id = crypto.randomUUID();
  const stored = await shouldProtectConversationTitle(service)
    ? await encodeConversationTitle(watch.user_id, id, title)
    : title;
  const { error } = await service.from("conversations")
    .insert({ id, project_id: null, user_id: watch.user_id, title: stored });
  if (error) throw new Error("Unable to create the reminder conversation");
  return id;
}

/** The title of the conversation one occurrence runs in: the reminder and the day. */
function occurrenceTitle(watch: NumoWatchItem, locale: Locale, firedAt: string): string {
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", ...(watch.timezone ? { timeZone: watch.timezone } : {}),
  }).format(new Date(firedAt));
  const text = watch.instruction.length > 60 ? `${watch.instruction.slice(0, 59)}…` : watch.instruction;
  return `${text} · ${day}`;
}

/**
 * Start the `act` turn: in the watch's conversation when it can take one,
 * and for an occurrence of a recurring watch always in a conversation of
 * its own. Returns the conversation.
 */
async function startWatchTurn(service: SupabaseClient, watch: NumoWatchItem, input: {
  prompt: string; title: string; metadata: Record<string, unknown>; locale: Locale; retry: boolean;
}): Promise<string> {
  const occurrence = watch.recurrence && watch.fired_at ? { firedAt: watch.fired_at } : null;
  // The request id makes admission idempotent within a conversation, and
  // lets the reminders lane find the turn.
  const requestId = occurrence ? numoWatchOccurrenceRequestId(watch.id, occurrence.firedAt) : watch.id;
  if (occurrence && input.retry) {
    // The clock died after the claim: the turn may have been admitted.
    const { data, error } = await service.from("numo_assistant_turns").select("conversation_id")
      .eq("request_id", requestId).eq("user_id", watch.user_id).limit(1);
    if (error) throw new Error("Unable to read reminder turns");
    const admitted = (data ?? [])[0]?.conversation_id;
    if (typeof admitted === "string") return admitted;
  }
  const start = (conversationId: string) => startNumoIntent({
    supabase: service,
    userId: watch.user_id,
    userMetadata: input.metadata,
    projectId: watch.project_id,
    prompt: input.prompt,
    locale: input.locale,
    timezone: watch.timezone ?? "UTC",
    source: "reminder",
    action: "custom",
    conversationId,
    conversationUserId: watch.user_id,
    requestId,
    // The reminders lane of the Numo turns clock runs it.
    executeInBackground: false,
    triggerSource: "chat",
    reminder: {
      watchId: watch.id, projectId: watch.project_id,
      targetType: watch.target_type, targetId: watch.target_id,
      ...(occurrence ? { recurring: { firedAt: occurrence.firedAt, grants: watch.grants } } : {}),
    },
  });
  if (watch.conversation_id && !occurrence) {
    try {
      await start(watch.conversation_id);
      return watch.conversation_id;
    } catch (error) {
      // The conversation was deleted, or holds a turn right now: a new one.
      const busy = (error as Error | null)?.message === "conversation_busy";
      const gone = error instanceof NumoIntentStartError && error.code === "context_unavailable";
      if (!busy && !gone) throw error;
    }
  }
  const conversationId = await createWatchConversation(service, watch,
    occurrence ? occurrenceTitle(watch, input.locale, occurrence.firedAt) : input.title);
  try {
    await start(conversationId);
  } catch (error) {
    await service.from("conversations").delete().eq("id", conversationId).eq("user_id", watch.user_id);
    throw error;
  }
  return conversationId;
}

/** What the user reads about a reminder: the catalog and the note's title, in their language. */
async function watchVoice(service: SupabaseClient, watch: NumoWatchItem) {
  const { data: account, error } = await service.auth.admin.getUserById(watch.user_id);
  if (error) throw new Error("Unable to read the account");
  const metadata = (account?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const locale = localeOf(metadata);
  const subject = await subjectOf(service, watch).catch(() => null);
  const title = await watchNoteTitle(watch, subject, locale);
  const t = createTranslator({ locale, messages: await catalog(locale), namespace: "Account" });
  return { metadata, locale, title, t };
}

/**
 * Record how an occurrence of a recurring watch went and, when it did not
 * finish, tell the user once: that the reminder is now paused when this was
 * one failure too many, otherwise why Numo did not act.
 */
export async function settleNumoWatchOccurrence(watch: NumoWatchItem, result: {
  outcome?: NumoWatchOutcome; failed?: boolean; finished?: boolean;
}, service: SupabaseClient = getServiceClient()): Promise<void> {
  if (!watch.recurrence || !watch.fired_at) return;
  const { paused } = await recordNumoWatchOccurrence(service,
    { id: watch.id, firedAt: watch.fired_at }, result);
  if (!result.failed) return;
  const { title, t } = await watchVoice(service, watch);
  // The pause note says more around the instruction than the others: a
  // long instruction is cut so the note keeps its last words.
  const room = NUMO_NOTE_BODY_MAX -
    t("numoWatchNotePaused", { count: NUMO_RECURRING_FAILURE_LIMIT, instruction: "" }).length;
  const instruction = watch.instruction.length > room
    ? `${watch.instruction.slice(0, room - 1)}…`
    : watch.instruction;
  const body = paused
    ? t("numoWatchNotePaused", { count: NUMO_RECURRING_FAILURE_LIMIT, instruction })
    : result.outcome === "budget_fallback"
      ? t("numoWatchNoteNoBudget", { instruction: watch.instruction })
      : t("numoWatchNoteActFailed", { instruction: watch.instruction });
  await sendNumoNote({
    service, userId: watch.user_id, projectId: watch.project_id, title, body, link: linkOf(watch),
  });
}

/**
 * Send what a fired watch promised. Returns how it went. `retry` marks a
 * second attempt after a crash: the duplicate check then keeps a note that
 * already went out from going twice.
 */
export async function dispatchNumoWatch(watch: NumoWatchItem,
  service: SupabaseClient = getServiceClient(), options: { retry?: boolean } = {}): Promise<NumoWatchOutcome> {
  const { metadata, locale, title, t } = await watchVoice(service, watch);
  const note = async (body: string): Promise<NumoWatchOutcome | "sent"> => {
    const sent = await sendNumoNote({
      service, userId: watch.user_id, projectId: watch.project_id, title, body,
      link: linkOf(watch), dedupe: options.retry === true,
    });
    if (!sent.ok) return "failed";
    return sent.delivered || sent.reason === "duplicate" ? "sent" : "muted";
  };

  if (watch.action === "notify") {
    const sent = await note(watch.instruction);
    return sent === "sent" ? "notified" : sent;
  }
  if (watch.recurrence && watch.fired_at) {
    // An occurrence: the clock records how it went and tells the user when
    // it did not start (`settleNumoWatchOccurrence`), so no note is sent here.
    try {
      const conversationId = await startWatchTurn(service, watch, {
        prompt: t("numoWatchRecurringTurnMessage", { instruction: watch.instruction }),
        title, metadata, locale, retry: options.retry === true,
      });
      await recordNumoWatchOccurrence(service, { id: watch.id, firedAt: watch.fired_at }, { conversationId });
      return "acted";
    } catch (startError) {
      if (isBudgetError(startError)) return "budget_fallback";
      console.error(`[numo-watches] watch=${watch.id} turn_failed`);
      return "failed";
    }
  }
  try {
    await startWatchTurn(service, watch, {
      prompt: t("numoWatchTurnMessage", { condition: title, instruction: watch.instruction }),
      title, metadata, locale, retry: options.retry === true,
    });
  } catch (startError) {
    // The watch fires once: whatever stopped the turn, the user still gets
    // the reminder, with the reason Numo did not act.
    if (isBudgetError(startError)) {
      const sent = await note(t("numoWatchNoteNoBudget", { instruction: watch.instruction }));
      return sent === "sent" ? "budget_fallback" : sent;
    }
    console.error(`[numo-watches] watch=${watch.id} turn_failed`);
    await note(t("numoWatchNoteActFailed", { instruction: watch.instruction }));
    return "failed";
  }
  // The turn is admitted: it runs whether or not the note goes out.
  await note(t("numoWatchNoteActing", { instruction: watch.instruction }));
  return "acted";
}

/**
 * A reminder turn that did not finish (failed, stopped, or out of usage)
 * tells the user, and the watch records it. An occurrence of a recurring
 * watch that finished clears its failure count. Called by `executeNumoTurn`.
 */
export function notifyReminderOfNumoTurn(turn: NumoTurn, options: { usageExhausted?: boolean } = {}): void {
  const reminder = turn.intent.reminder;
  if (!reminder) return;
  const unfinished = turn.status === "failed" || turn.status === "stopped" ||
    turn.status === "waiting_input" || (turn.status === "completed" && options.usageExhausted === true);
  if (!unfinished && !(reminder.recurring && turn.status === "completed")) return;
  void (async () => {
    try {
      const service = getServiceClient();
      const watch = await getNumoWatch(service, turn.user_id, reminder.watchId);
      if (!watch) return;
      if (reminder.recurring) {
        // The occurrence this turn ran, whatever the watch moved on to since.
        await settleNumoWatchOccurrence({ ...watch, fired_at: reminder.recurring.firedAt },
          unfinished ? { outcome: "failed", failed: true } : { finished: true }, service);
        return;
      }
      if (watch.outcome !== "acted") return;
      await recordNumoWatchOutcome(service, watch.id, "failed");
      const { title, t } = await watchVoice(service, watch);
      await sendNumoNote({
        service, userId: watch.user_id, projectId: watch.project_id, title,
        body: t("numoWatchNoteActFailed", { instruction: watch.instruction }),
        link: linkOf(watch),
      });
    } catch {
      console.error(`[numo-watches] turn=${turn.id} failure_note_failed`);
    }
  })();
}

export interface NumoWatchClockResult {
  expired: number;
  fired: number;
  /** Occurrences of recurring watches missed by too long to run. */
  skipped: number;
  canceled: number;
  retried: number;
}

/** One tick of the reminders clock. */
export async function runNumoWatchClock(options: {
  now?: Date;
  /** Epoch ms after which no further page is read and no watch fired. */
  deadline?: number;
  dispatch?: (watch: NumoWatchItem, options?: { retry?: boolean }) => Promise<NumoWatchOutcome>;
} = {}): Promise<NumoWatchClockResult> {
  const service = getServiceClient();
  const now = options.now ?? new Date();
  const pastDeadline = () => options.deadline !== undefined && Date.now() >= options.deadline;
  const dispatch = options.dispatch ??
    ((watch: NumoWatchItem, dispatchOptions?: { retry?: boolean }) => dispatchNumoWatch(watch, service, dispatchOptions));
  const run = async (watch: NumoWatchItem, retry: boolean) => {
    let outcome: NumoWatchOutcome;
    try {
      outcome = await dispatch(watch, retry ? { retry } : undefined);
    } catch {
      console.error(`[numo-watches] watch=${watch.id} dispatch_failed`);
      outcome = "failed";
    }
    if (watch.recurrence) {
      await settleNumoWatchOccurrence(watch, { outcome, failed: outcome !== "acted" }, service)
        .catch(() => console.error(`[numo-watches] watch=${watch.id} settle_failed`));
      return;
    }
    await recordNumoWatchOutcome(service, watch.id, outcome);
  };

  // A clock that died after a claim left its watch without an outcome.
  const stranded = await claimStrandedNumoWatches(service, now);
  for (const watch of stranded) await run(watch, true);

  // Every (user, project) pair is checked once per tick.
  const access = new Map<string, boolean>();
  const canOpen = async (watch: ClockWatch) => {
    const key = `${watch.user_id}:${watch.project_id}`;
    if (!access.has(key)) access.set(key, !!(await getProjectAccess(watch.user_id, watch.project_id)));
    return access.get(key) as boolean;
  };

  let fired = 0;
  let skipped = 0;
  let canceled = 0;
  let afterId: string | null = null;
  while (!pastDeadline()) {
    const page = await listClockWatches(service, afterId, PAGE_SIZE);
    if (page.length === 0) break;
    afterId = page[page.length - 1].id;
    const state = await loadTargetState(service, page);
    const gone: string[] = [];
    for (const watch of page) {
      if (pastDeadline()) break;
      // One watch that throws must not hold the others.
      try {
        // The user's rights now, not when the watch was set.
        if (!(await canOpen(watch))) { gone.push(watch.id); continue; }
        const verdict = evaluateWatch(watch, state, now);
        if (verdict === "gone") { gone.push(watch.id); continue; }
        if (verdict === "wait" || fired >= FIRES_PER_TICK) continue;
        if (watch.recurrence) {
          // Claimed and moved to its next occurrence in one update. One the
          // clock missed by too long is only moved.
          const late = now.getTime() - Date.parse(watch.fire_at as string) > NUMO_RECURRING_GRACE_MS;
          const occurrence = await advanceRecurringNumoWatch(service, watch, { fire: !late, now });
          if (!occurrence) continue;
          if (late) { skipped++; continue; }
          fired++;
          await run(occurrence, false);
          continue;
        }
        const claimed = await claimNumoWatch(service, watch, now);
        if (!claimed) continue;
        fired++;
        await run(claimed, false);
      } catch {
        console.error(`[numo-watches] watch=${watch.id} evaluation_failed`);
      }
    }
    await cancelClockWatches(service, gone);
    canceled += gone.length;
    if (page.length < PAGE_SIZE) break;
  }
  // Last, so a condition met just before expiry still fired above.
  const expired = await expireNumoWatches(service, now);
  return { expired, fired, skipped, canceled, retried: stranded.length };
}

/**
 * The reminders lane of the Numo turns clock: the `act` turns admitted in the
 * last day that wait to run, a few at a time. Each keeps its conversation
 * busy until it runs, so it does not queue behind every other server turn.
 */
export async function drainNumoWatchTurns(options: { limit?: number } = {}): Promise<{ ran: number }> {
  const service = getServiceClient();
  const requestIds = await recentActedNumoWatchRequestIds(service, new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (requestIds.length === 0) return { ran: 0 };
  const { data, error } = await service.from("numo_assistant_turns")
    .select("id, status").in("request_id", requestIds).in("status", ["queued", "retryable"])
    .lte("not_before", new Date().toISOString())
    .order("created_at", { ascending: true }).limit(options.limit ?? 4);
  if (error) throw new Error("Unable to read reminder turns");
  const { executeNumoTurn } = await import("./turns");
  const results = await Promise.all(((data ?? []) as Array<{ id: string; status: string }>).map(async (turn) => {
    try {
      const result = await executeNumoTurn({
        turnId: turn.id,
        readClient: service,
        ...(turn.status === "retryable" ? { allowRetryable: true } : {}),
      });
      return result.status !== "not_claimed";
    } catch {
      console.error(`[numo-watches] turn=${turn.id} run_failed`);
      return false;
    }
  }));
  return { ran: results.filter(Boolean).length };
}
