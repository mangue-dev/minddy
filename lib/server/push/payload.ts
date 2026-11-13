import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { feedbackPostStore } from "@/lib/server/feedback-post-store";
import { decodePullRequestContent } from "@/lib/server/agent/pull-request-content";
import "server-only";
import { decodeRoutineTitle } from "@/lib/server/routine-content";
import { decodePageProjection } from "@/lib/server/page-content";
import { readProjectNames } from "@/lib/server/project-content";
import { readNumoNotes, type NumoNoteContent } from "@/lib/server/numo-note-content";

import { createTranslator } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import de from "@/messages/de.json";
import ptBR from "@/messages/pt-BR.json";
import it from "@/messages/it.json";
import es from "@/messages/es.json";
import {
  intlLocaleByLocale,
  supportedLocaleForTag,
  type Locale,
} from "@/i18n/config";
import { displayName } from "@/lib/display-name";
import { notificationTargetPath } from "@/lib/notification-target";
import { notificationPlainText, type NotificationLabels } from "@/lib/notification-line";
import { markdownForReader } from "@/lib/server/mention-access";
import type { MyNotification } from "@/lib/types";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors, type ApiKeyActor,
} from "@/lib/server/api-key-actors";
import type { NotificationRow } from "@/lib/server/notifications";

/**
 * What a push notification (MIN-183) says — the SAME words as the inbox row
 * (lib/notification-line.ts): the actor as the banner's title, then the
 * sentence with its target's label and the optional context as its body. A
 * mention cannot be drawn in a system banner, so it prints its label.
 *
 * ## Why `createTranslator` and not `getTranslations`
 *
 * `getTranslations` requires a REQUEST context. Half of the producers of
 * notifications don't have one: a cascade of automations, an agent run that ends, a feedback cron. `createTranslator` on catalogs
 * statically imported works everywhere — that's already the recipe for tests
 * (lib/describe-event-smart-assign.test.ts).
 *
 * The language is not that of the triggering request. It is the recipient's
 * account-level interface preference, captured from `user_metadata.locale` at
 * the notification insertion point. That preference remains available to
 * background jobs and keeps every device aligned with the Minddy interface.
 *
 * ## Hydration in LOT
 *
 * `loadPushContext` does ONE read pass for everything the inserted batch ;
 * `buildPushPayload` is then pure. An insert is often multi-recipient
 * (a mention of three people in a comment) and each recipient
 * can have multiple devices in multiple languages: hydrate per line and
 * per language would be the same N+1, repeated.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** BCP 47 language tag for notification renderers. */
  lang: string;
  /** Relative path — the service worker resolves it to its origin. */
  url: string;
  /** Browser-side grouping: a burst on the same target REPLACES au
   * instead of stacking. Echo of `replaceUnread` on the inbox side. */
  tag: string;
}

export type PushLocale = Locale;

const CATALOGS: Record<PushLocale, typeof en> = { en, fr: fr as typeof en,
  de: de as typeof en,
  "pt-BR": ptBR as typeof en,
  it: it as typeof en,
  es: es as typeof en,
};

export function pushMessages(locale: PushLocale): typeof en {
  return CATALOGS[locale];
}

/** Normalizes a stored language (`"fr-FR"`, `"FR"`, `null`) to a catalog. */
export function toPushLocale(raw: string | null | undefined): PushLocale {
  return supportedLocaleForTag(raw) ?? "en";
}

export interface PushContext {
  issues: Map<string, { number: number; title: string }>;
  objectives: Map<string, string>;
  feedbackPosts: Map<string, { projectId: string; title: string }>;
  /** Title of a ROUTINE (MIN-185) — the banner only shows him. */
  routines: Map<string, string>;
  /** Number + title of a PULL REQUEST — the banner shows them as the
   * reference and title of a ticket. */
  pullRequests: Map<string, { number: number; title: string | null; provider: string | null }>;
  /** Title of a wiki PAGE (MIN-278) — the banner only shows it. */
  pages: Map<string, string>;
  /** A Numo note (MIN-914): its own title and body make the banner. */
  numoNotes: Map<string, NumoNoteContent>;
  projectKeys: Map<string, string>;
  /** Name of the project a backfill or feedback line points at. */
  projectNames: Map<string, string>;
  actorNames: Map<string, string>;
  apiKeyActors: Map<string, ApiKeyActor>;
}

/** Empty context — serves as seed and fallback. */
export function emptyPushContext(): PushContext {
  return {
    issues: new Map(),
    objectives: new Map(),
    feedbackPosts: new Map(),
    routines: new Map(),
    pullRequests: new Map(),
    pages: new Map(),
    numoNotes: new Map(),
    projectKeys: new Map(),
    projectNames: new Map(),
    actorNames: new Map(),
    apiKeyActors: new Map(),
  };
}

/**
 * A reading pass for the entire batch: target titles (discarding the trashed
 * — MIN-133: the notification survives the trashing of its target
 *), project keys, actor names.
 */
export async function loadPushContext(
  service: SupabaseClient,
  rows: readonly NotificationRow[],
): Promise<PushContext> {
  const ctx = emptyPushContext();
  if (rows.length === 0) return ctx;

  const ids = (pick: (r: NotificationRow) => string | null | undefined,
  ): string[] => [
    ...new Set(rows.map(pick).filter((v): v is string => !!v))];
  const issueIds = ids((r) => r.issue_id);
  const objectiveIds = ids((r) => r.objective_id);
  const feedbackIds = ids((r) => r.feedback_post_id);
  const routineIds = ids((r) => r.routine_id);
  const prIds = ids((r) => r.pull_request_id);
  const pageIds = ids((r) => r.page_id);
  const projectIds = ids((r) => r.project_id);
  const actorIds = ids((r) => r.actor_id);
  const keyIds = ids((r) => r.api_key_id);

  const [
    issues,
    objectives,
    feedback,
    routines,
    pullRequests,
    pages,
    projects,
    actors,
    keyActors,
  ] =
    await Promise.all([
    issueIds.length && projectIds.length
      ? issueStore(service).select("id, number, title")
          .in("id", issueIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; number: number; title: string }[],
        }),
    objectiveIds.length
      ? objectiveStore(service)
          .select("id, name")
          .in("id", objectiveIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    feedbackIds.length
      ? feedbackPostStore(service)
          .select("id, project_id, title")
          .in("id", feedbackIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; project_id: string; title: string }[] }),
    // A ROUTINE (MIN-185): no basket, the line leaves with it.
    routineIds.length
      ? service.from("agent_routines")
          .select("id, project_id, title, encrypted_content, encryption_version")
          .in("id", routineIds).in("project_id", projectIds)
      : Promise.resolve({ data: [] as { id: string; project_id: string;
          title: string; encrypted_content?: string | null;
          encryption_version?: number }[] }),
    // A PULL REQUEST: no basket either, the line leaves with it.
    prIds.length
      ? service.from("pull_requests").select("id, number, title, provider").in("id", prIds)
      : Promise.resolve({
          data: [] as { id: string; number: number; title: string | null; provider: string | null }[],
        }),
    // A PAGE: trashed, it grows nothing — the line would lead to a
    // blank screen (same rule as tickets, MIN-133).
    pageIds.length
      ? service
          .from("pages")
          .select("id, project_id, title, encrypted_content, encryption_version")
          .in("id", pageIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    projectIds.length
      ? service.from("projects").select("id, key").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; key: string }[] }),
    fetchAuthUsersById(service, actorIds),
    keyIds.length
      ? resolveApiKeyActors(keyIds)
      : Promise.resolve(new Map<string, ApiKeyActor>()),
  ]);

  for (const i of issues.data ?? []) {
    ctx.issues.set(i.id, { number: i.number, title: i.title });
  }
  for (const o of objectives.data ?? []) ctx.objectives.set(o.id, o.name);
  for (const f of feedback.data ?? []) ctx.feedbackPosts.set(f.id, { projectId: f.project_id, title: f.title });
  for (const r of routines.data ?? []) {
    if (!rows.some((row) => row.routine_id === r.id &&
        row.project_id === r.project_id)) continue;
    ctx.routines.set(r.id, await decodeRoutineTitle(r));
  }
  for (const p of pullRequests.data ?? []) {
    ctx.pullRequests.set(p.id, { number: p.number, provider: p.provider ?? null,
      title: await decodePullRequestContent(p.id, "title", p.title) });
  }
  for (const p of pages.data ?? []) {
    const clear = await decodePageProjection(p);
    ctx.pages.set(p.id, clear.title);
  }
  for (const p of projects.data ?? []) ctx.projectKeys.set(p.id, p.key);
  for (const [id, user] of actors) {
    // EMPTY fallback rather than “User”: the fallback label is translated, and its
    // language is only known when constructing the payload, below.
    ctx.actorNames.set(id, displayName(toNamed(user), ""));
  }
  ctx.apiKeyActors = keyActors;
  ctx.projectNames = await readProjectNames(
    service,
    rows.filter((row) => row.type === "smart_assign_batch" || row.feedback_post_id)
      .map((row) => row.project_id),
  );
  // Each note is read for its own recipient, the only user it is sent to,
  // and its mentions carry the labels that recipient may see (MIN-975).
  for (const row of rows) {
    if (!row.numo_note_id) continue;
    const notes = await readNumoNotes(service, [row.numo_note_id], row.user_id);
    const note = notes?.get(row.numo_note_id);
    if (!note) continue;
    ctx.numoNotes.set(row.numo_note_id, {
      title: await markdownForReader(row.user_id, note.title, service),
      body: await markdownForReader(row.user_id, note.body, service),
    });
  }

  return ctx;
}

/**
 * The row as the inbox would read it, from the batch's context, or `null`
 * when its target is gone (trash) or unreadable: a banner then says nothing
 * rather than open a blank screen.
 */
function notificationOf(ctx: PushContext, row: NotificationRow): MyNotification | null {
  const issue = row.issue_id ? ctx.issues.get(row.issue_id) : undefined;
  const pr = row.pull_request_id ? ctx.pullRequests.get(row.pull_request_id) : undefined;
  const post = row.feedback_post_id ? ctx.feedbackPosts.get(row.feedback_post_id) : undefined;
  const note = row.numo_note_id ? ctx.numoNotes.get(row.numo_note_id) : undefined;
  const projectName = row.project_id ? ctx.projectNames.get(row.project_id) : undefined;
  if (row.type === "numo_message") {
    if (!note) return null;
  } else if (row.type === "smart_assign_batch") {
    if (!projectName || !row.issue_count) return null;
  } else if (row.objective_id) {
    if (!ctx.objectives.has(row.objective_id)) return null;
  } else if (row.feedback_post_id) {
    if (!post || post.projectId !== row.project_id) return null;
  } else if (row.routine_id) {
    if (!ctx.routines.has(row.routine_id)) return null;
  } else if (row.pull_request_id) {
    if (!pr) return null;
  } else if (row.page_id) {
    if (!ctx.pages.has(row.page_id)) return null;
  } else if (row.issue_id) {
    if (!issue) return null;
  } else if (row.type !== "instance_config_changed") {
    return null;
  }
  const keyActor = row.via_mcp && row.api_key_id ? ctx.apiKeyActors.get(row.api_key_id) : undefined;
  return {
    id: "",
    type: row.type,
    read_at: null,
    created_at: "",
    issue_id: row.issue_id,
    issue_number: issue?.number ?? null,
    issue_title: issue?.title ?? null,
    issue_status: null,
    objective_id: row.objective_id ?? null,
    objective_name: row.objective_id ? ctx.objectives.get(row.objective_id) ?? null : null,
    feedback_post_id: row.feedback_post_id ?? null,
    feedback_title: post?.title ?? null,
    routine_id: row.routine_id ?? null,
    routine_title: row.routine_id ? ctx.routines.get(row.routine_id) ?? null : null,
    pull_request_id: row.pull_request_id ?? null,
    pull_request_number: pr?.number ?? null,
    pull_request_title: pr?.title ?? null,
    pull_request_provider: pr?.provider ?? null,
    page_id: row.page_id ?? null,
    page_title: row.page_id ? ctx.pages.get(row.page_id) ?? null : null,
    block_id: row.block_id ?? null,
    project_id: row.project_id,
    project_key: row.project_id ? ctx.projectKeys.get(row.project_id) ?? null : null,
    actor_name: ctx.actorNames.get(row.actor_id ?? "")?.trim() || null,
    actor_avatar_seed: null,
    // Our agent outside MCP (MIN-278): the banner names Numo, as the inbox does.
    from_numo: !row.via_mcp && !!row.via_assistant,
    via_mcp: !!row.via_mcp,
    api_key_agent: keyActor?.agent ?? null,
    api_key_name: keyActor?.name ?? null,
    via_smart_assign: !!row.via_smart_assign,
    via_automation: !!row.via_automation,
    // A comment's excerpt is not pushed: the banner's body stays short.
    comment_excerpt: null,
    numo_note_title: note?.title ?? null,
    numo_note_body: note?.body ?? null,
    issue_count: row.issue_count ?? null,
    project_name: projectName ?? null,
  };
}

/**
 * The payload of a row, in the language of a device — or `null` when the
 * target is no longer there (trash) or the row leads nowhere.
 */
export function buildPushPayload(
  ctx: PushContext,
  row: NotificationRow,
  locale: PushLocale,
): PushPayload | null {
  const url = notificationTargetPath(row);
  if (!url) return null;
  const n = notificationOf(ctx, row);
  if (!n) return null;

  const messages = CATALOGS[locale];
  const t = createTranslator({ locale, messages, namespace: "Inbox" });
  const tTimeline = createTranslator({ locale, messages, namespace: "Timeline" });
  const tIssue = createTranslator({ locale, messages, namespace: "Issue" });
  const labels: NotificationLabels = {
    someone: t("someone"),
    mcpFallback: tTimeline("mcpFallback"),
    somePageFallback: t("somePageFallback"),
    someIssueFallback: t("someIssueFallback", { entity: tIssue("entity").toLowerCase() }),
    automation: t("actorAutomation"),
    feedbackBoard: t("actorFeedbackBoard"),
  };
  const text = notificationPlainText(n, labels, (key, values) => t(key, values));

  return {
    title: text.actor,
    body: text.context ? `${text.title}\n${text.context}` : text.title,
    lang: intlLocaleByLocale[locale],
    url,
    // Each note is its own banner; any other burst on one target replaces
    // the previous banner instead of stacking.
    tag: row.type === "numo_message" ? `numo-note:${row.numo_note_id}` : url,
  };
}
