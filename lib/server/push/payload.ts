import "server-only";

import { createTranslator } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { displayName } from "@/lib/display-name";
import { mcpActorLabel } from "@/lib/mcp-agents";
import {
  notificationTargetPath,
  NOTIFICATION_LINE_KEYS,
} from "@/lib/notification-target";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors, type ApiKeyActor } from "@/lib/server/api-key-actors";
import type { NotificationRow } from "@/lib/server/notifications";

/**
 * What a push notification (MIN-183) says — the SAME words as the corresponding
 * inbox line.
 *
 * That's the point: two surfaces, one wording. Hence the
 * reuse of keys from the namespace `Inbox` via `NOTIFICATION_LINE_KEYS`, and
 * from the actor vocabulary of the timeline (named Smart Assign, a named MCP
 * agent, never “Someone” when we know who it is).
 *
 * ## Why `createTranslator` and not `getTranslations`
 *
 * `getTranslations` requires a REQUEST context. Half of the producers of
 * notifications don't have one: a cascade of automations, an agent run that ends, a feedback cron. `createTranslator` on catalogs
 * statically imported works everywhere — that's already the recipe for tests
 * (lib/describe-event-smart-assign.test.ts).
 *
 * And the language is not that of the request anyway: it's the one de
 * SUBSCRIPTION, captured by device when subscribing to it. Someone else's cookie
 * `NEXT_LOCALE` is unreadable from a background job.
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
  /** Relative path — the service worker resolves it to its origin. */
  url: string;
  /** Browser-side grouping: a burst on the same target REPLACES au
 * instead of stacking. Echo of `replaceUnread` on the inbox side. */
  tag: string;
}

export type PushLocale = "fr" | "en";

const CATALOGS: Record<PushLocale, typeof en> = { en, fr: fr as typeof en };

/** Normalizes a stored language (`"fr-FR"`, `"FR"`, `null`) to a catalog. */
export function toPushLocale(raw: string | null | undefined): PushLocale {
  return raw?.trim().toLowerCase().startsWith("fr") ? "fr" : "en";
}

export interface PushContext {
  issues: Map<string, { number: number; title: string }>;
  agentConversations: Map<string, string | null>;
  objectives: Map<string, string>;
  feedbackPosts: Map<string, string>;
  /** Title of a ROUTINE (MIN-185) — the banner only shows him. */
  routines: Map<string, string>;
  /** Number + title of a PULL REQUEST — the banner shows them as the
 * reference and title of a ticket. */
  pullRequests: Map<string, { number: number; title: string | null }>;
  /** Title of a wiki PAGE (MIN-278) — the banner only shows it. */
  pages: Map<string, string>;
  projectKeys: Map<string, string>;
  actorNames: Map<string, string>;
  apiKeyActors: Map<string, ApiKeyActor>;
}

/** Empty context — serves as seed and fallback. */
export function emptyPushContext(): PushContext {
  return {
    issues: new Map(),
    agentConversations: new Map(),
    objectives: new Map(),
    feedbackPosts: new Map(),
    routines: new Map(),
    pullRequests: new Map(),
    pages: new Map(),
    projectKeys: new Map(),
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
  rows: readonly NotificationRow[]
): Promise<PushContext> {
  const ctx = emptyPushContext();
  if (rows.length === 0) return ctx;

  const ids = (pick: (r: NotificationRow) => string | null | undefined): string[] => [
    ...new Set(rows.map(pick).filter((v): v is string => !!v)),
  ];
  const issueIds = ids((r) => r.issue_id);
  const conversationIds = ids((r) => r.agent_conversation_id);
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
    agentConversations,
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
    issueIds.length
      ? service
          .from("issues")
          .select("id, number, title")
          .in("id", issueIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; number: number; title: string }[] }),
    conversationIds.length
      ? service.from("agent_conversations").select("id, title").in("id", conversationIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    objectiveIds.length
      ? service
          .from("objectives")
          .select("id, name")
          .in("id", objectiveIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    feedbackIds.length
      ? service
          .from("feedback_posts")
          .select("id, title")
          .in("id", feedbackIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    // A ROUTINE (MIN-185): no basket, the line leaves with it.
    routineIds.length
      ? service.from("agent_routines").select("id, title").in("id", routineIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    // A PULL REQUEST: no basket either, the line leaves with it.
    prIds.length
      ? service.from("pull_requests").select("id, number, title").in("id", prIds)
      : Promise.resolve({
          data: [] as { id: string; number: number; title: string | null }[],
        }),
    // A PAGE: trashed, it grows nothing — the line would lead to a
    // blank screen (same rule as tickets, MIN-133).
    pageIds.length
      ? service
          .from("pages")
          .select("id, title")
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
  for (const c of agentConversations.data ?? []) ctx.agentConversations.set(c.id, c.title);
  for (const o of objectives.data ?? []) ctx.objectives.set(o.id, o.name);
  for (const f of feedback.data ?? []) ctx.feedbackPosts.set(f.id, f.title);
  for (const r of routines.data ?? []) ctx.routines.set(r.id, r.title);
  for (const p of pullRequests.data ?? []) {
    ctx.pullRequests.set(p.id, { number: p.number, title: p.title });
  }
  for (const p of pages.data ?? []) ctx.pages.set(p.id, p.title);
  for (const p of projects.data ?? []) ctx.projectKeys.set(p.id, p.key);
  for (const [id, user] of actors) {
    // EMPTY fallback rather than “User”: the fallback label is translated, and its
    // language is only known when constructing the payload, below.
    ctx.actorNames.set(id, displayName(toNamed(user), ""));
  }
  ctx.apiKeyActors = keyActors;

  return ctx;
}

/**
 * The payload of a line, in the language of a device — or `null` when
 * the target is no longer there (trash) or the line leads nowhere: better
 * is better than pushing nothing than opening a blank screen.
 */
export function buildPushPayload(
  ctx: PushContext,
  row: NotificationRow,
  locale: PushLocale
): PushPayload | null {
  const url = notificationTargetPath(row);
  if (!url) return null;

  const messages = CATALOGS[locale];
  const t = createTranslator({ locale, messages, namespace: "Inbox" });
  const tTimeline = createTranslator({ locale, messages, namespace: "Timeline" });

  // The title is WHAT we're talking about — the first line of the inbox. There
  // reference of the ticket in front: it is she who we recognize at a glance in
  // a system banner, where there is no room for anything else.
  let title: string;
  if (row.objective_id) {
    const name = ctx.objectives.get(row.objective_id);
    if (!name) return null;
    title = name;
  } else if (row.feedback_post_id) {
    const postTitle = ctx.feedbackPosts.get(row.feedback_post_id);
    if (!postTitle) return null;
    title = postTitle;
  } else if (row.routine_id) {
    const routineTitle = ctx.routines.get(row.routine_id);
    if (!routineTitle) return null;
    title = routineTitle;
  } else if (row.pull_request_id) {
    const pr = ctx.pullRequests.get(row.pull_request_id);
    if (!pr) return null;
    // `#12 · Réparer…` — the exact counterpart of `MIN-42 · …` for a ticket.
    title = pr.title ? `#${pr.number} · ${pr.title}` : `#${pr.number}`;
  } else if (row.page_id) {
    const pageTitle = ctx.pages.get(row.page_id);
    if (pageTitle === undefined) return null;
    // A page without a title does have a title: it is the empty string. The banner
    // system has nothing else to show, hence the explicit fallback — a title
    // empty would make an anonymous notification there.
    title = pageTitle || t("somePageFallback");
  } else if (row.issue_id) {
    const issue = ctx.issues.get(row.issue_id);
    if (!issue) return null;
    const key = row.project_id ? ctx.projectKeys.get(row.project_id) : null;
    title = key ? `${key}-${issue.number} · ${issue.title}` : issue.title;
  } else if (row.agent_conversation_id) {
    const conversationTitle = ctx.agentConversations.get(row.agent_conversation_id);
    if (conversationTitle === undefined) return null;
    title = conversationTitle || t("someAgentConversationFallback");
  } else {
    return null;
  }

  // The name of the actor, in the terms of the inbox and the timeline: Smart
  // Assign is named, an MCP agent is named, and “Someone” is only used when
  // on ne sait vraiment pas.
  let actor: string;
  if (row.via_smart_assign) {
    actor = "Smart Assign";
  } else if (row.via_mcp) {
    const keyActor = row.api_key_id ? ctx.apiKeyActors.get(row.api_key_id) : null;
    actor = mcpActorLabel(keyActor?.agent, keyActor?.name, tTimeline("mcpFallback"));
  } else if (row.via_assistant) {
    // Our agent outside MCP (MIN-278): the cat, the code agent. The same name as
    // the inbox gives it — otherwise the banner and the line would say two
    // different actors of the same gesture.
    actor = "Numo";
  } else {
    actor = ctx.actorNames.get(row.actor_id ?? "")?.trim() || t("someone");
  }

  return {
    title,
    body: t(NOTIFICATION_LINE_KEYS[row.type], { actor }),
    url,
    tag: url,
  };
}
