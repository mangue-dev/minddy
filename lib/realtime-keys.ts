import type { QueryKey } from "@tanstack/react-query";

import { GLOBAL_BOARD_KEY, issueWrites, objectiveWrites } from "./optimistic/issue-writes";

/**
 * WHAT A BROADCAST EVENT REFRESHES — the realtime
 * bridge referral table (lib/realtime-provider.tsx).
 *
 * Separate from the provider, and pure, for the same reason as lib/realtime-topics.ts
 * and lib/realtime-catch-up.ts: vitest runs on bare node — no React, no
 * `next/navigation` — and this is the only thing that a type-check
 * cannot see. A table that broadcasts without having `case` does not raise anything, does not
 * log anything: it simply makes the screen silent in front of the writings of
 * other clients, and no one notices it before opening two
 * windows side by side. This is exactly what happened to `pages` (MIN-346) — the
 * table was born with MIN-266, its four satellites wired their broadcast
 * (activity, trackbacks, comments), and the table itself remained without.
 *
 * Hence the test that accompanies this module: it lists the tables distributed by
 * the triggers of `supabase/migrations` and requires that none arrive here without
 * response.
 */

/** Payload emitted by realtime.broadcast_changes(). */
export interface BroadcastChange {
  operation: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

export type RefetchMode = "active" | "none";

/** A cache to invalidate, and whether a mounted observer should refetch it. */
export interface Invalidation {
  key: QueryKey;
  refetch: RefetchMode;
}

// Caches that aggregate several projects. A project event has to reach them too
// or /home, /all, /statistics and the palette stay stale (MIN-89). Kept as
// literals like every other key in this file; the owning modules are named.
// (GLOBAL_BOARD_KEY comes from lib/optimistic/issue-writes.ts — this is the module
// who also knows if the event is the echo of our own writing.)
const HOME_SUMMARY_KEY: QueryKey = ["me", "summary"]; // lib/use-home-summary-query.ts
const SEARCH_INDEX_KEY: QueryKey = ["me", "search-index"]; // lib/use-search-index.ts
// Smart Assign incorrectly set: the sidebar bears the mark on all pages.
const SMART_ASSIGN_WARNINGS_KEY: QueryKey = ["me", "smart-assign-warnings"]; // lib/use-smart-assign-warnings-query.ts
// What is waiting to be sorted by project: the number of project lines in the
// sidebar, also read on all pages. lib/use-triage-counts-query.ts.
const TRIAGE_COUNTS_KEY: QueryKey = ["me", "triage-counts"];
const STATS_KEY: QueryKey = ["stats"]; // lib/use-stats-query.ts — ["stats", tz]
// GLOBAL lists of the code agent: the sidebar reads them on all
// pages, a run of any project moves them. lib/use-agent-runs.ts.
const ALL_AGENT_SESSIONS_KEY: QueryKey = ["agent-sessions", "all"];
const ALL_PULL_REQUESTS_KEY: QueryKey = ["pull-requests", "all"];
const OPEN_PULL_REQUEST_COUNT_KEY: QueryKey = ["pull-requests", "open-count"];
const AGENT_ACTIVITY_KEY: QueryKey = ["agent-active-issues"];

/**
 * Views DERIVED from a ticket: their list membership is calculated in SQL,
 * so nothing patches them locally — they need to be refreshed even on
 * echoing our own writing (MIN-156). The palette level is marked
 * stale but NOT refreshed: it is a 4,000-line snapshot loaded once
 * times per tab, which is already revalidates upon opening when it is stale
 * (lib/use-search-index.ts). The others only go back to the server if they
 * are mounted — `invalidateQueries` leaves stale requests without
 * observer, without request.
 */
const ISSUE_DERIVED_KEYS: Invalidation[] = [
  { key: HOME_SUMMARY_KEY, refetch: "active" },
  { key: STATS_KEY, refetch: "active" },
  { key: TRIAGE_COUNTS_KEY, refetch: "active" },
  { key: SEARCH_INDEX_KEY, refetch: "none" },
];

/** Everything that a ticket change changes, including the aggregated board. */
const ISSUE_AGGREGATE_KEYS: Invalidation[] = [
  { key: GLOBAL_BOARD_KEY, refetch: "active" },
  ...ISSUE_DERIVED_KEYS,
];

const active = (key: QueryKey): Invalidation => ({ key, refetch: "active" });

function issueIdOf(change: BroadcastChange): string | null {
  const issueId = (change.record ?? change.old_record)?.issue_id;
  return typeof issueId === "string" ? issueId : null;
}

/** The ROUTINE of a broadcast run (MIN-185), when he wears one. */
function routineIdOf(change: BroadcastChange): string | null {
  const routineId = (change.record ?? change.old_record)?.routine_id;
  return typeof routineId === "string" ? routineId : null;
}

function objectiveIdOf(change: BroadcastChange): string | null {
  const objectiveId = (change.record ?? change.old_record)?.objective_id;
  return typeof objectiveId === "string" ? objectiveId : null;
}

function feedbackPostIdOf(change: BroadcastChange): string | null {
  const postId = (change.record ?? change.old_record)?.feedback_post_id;
  return typeof postId === "string" ? postId : null;
}

/** The PAGE of an activity line (MIN-278) — the fourth parent of an event. */
function pageIdOf(change: BroadcastChange): string | null {
  const pageId = (change.record ?? change.old_record)?.page_id;
  return typeof pageId === "string" ? pageId : null;
}

/**
 * Code Agent Runs: “Numo is working” sidebar spinner,
 * Agents page list and PR counter. These caches only POLL if
 * a session is ALREADY working — without this event, a run launched outside the composer
 * (Numo assistant, @numo, other tab) only appeared on reload.
 *
 * TWO TOPICS since MIN-332, and it is the visibility of the run that decides : a
 * PERSONAL conversation arrives on `user:{id}` (its creator, sole subscriber),
 * a run of the PROJECT — routine, automation, PR rereading — on
 * `project:{id}`. The caches to be refreshed are the same on both sides:
 * hence this function, called by the two switchers.
 *
 * The trigger only broadcasts the visible transitions, and only pushes
 * the id, the ticket, the routine and the status (see the migration).
 */
function keysForAgentRun(change: BroadcastChange): Invalidation[] {
  const issueId = issueIdOf(change);
  const routineId = routineIdOf(change);
  // A passage from ROUTINE (MIN-185) is not a conversation: it comes out of
  // list of sessions (`.is("routine_id", null)` on the road side), so invalidate it
  // would not refresh anything — it is the list of EXECUTIONS of its routine which must
  // move, and the list of routines itself (its `last_run_at` and its alert
  // viennent de changer).
  if (routineId) {
    return [active(["routines", routineId, "runs"]), active(["routines"])];
  }
  return [
    active(AGENT_ACTIVITY_KEY),
    active(ALL_AGENT_SESSIONS_KEY),
    active(ALL_PULL_REQUESTS_KEY),
    ...(issueId ? [active(["agent-runs", "issue", issueId])] : []),
  ];
}

export function keysForUserEvent(change: BroadcastChange): Invalidation[] {
  switch (change.table) {
    case "notifications":
      return [active(["notifications"])];
    // My conversations with Numo (MIN-332): they only exist for me,
    // so their echo goes through MY topic and not through that of the project.
    case "agent_runs":
      return keysForAgentRun(change);
    // These two tables are exactly what the Smart warning depends on
    // Assign (project setting, list of members): the sidebar brand
    // and the welcome banner are erased as soon as the rules are
    // recorded, without waiting for navigation.
    // A project that goes to the trash (or comes back) also changes the
    // PERIMETER of the sidebar numbers: without that, the line would disappear
    // the list — ["projects"] refreshes — but its share of the “Home” badge
    // remained, not having asked for the table again.
    case "projects":
      return [
        active(["projects"]),
        active(SMART_ASSIGN_WARNINGS_KEY),
        active(TRIAGE_COUNTS_KEY),
      ];
    // My membership has changed (joined / withdrawn): it's not just
    // one line more or less in the sidebar is the PERIMETER
    // of all my aggregates — the cross-project board, the dashboard and
    // the index of the palette still bears the tickets of a project to which I
    // no longer have access (or not yet theirs).
    case "project_members":
      return [
        active(["projects"]),
        active(SMART_ASSIGN_WARNINGS_KEY),
        active(GLOBAL_BOARD_KEY),
        active(HOME_SUMMARY_KEY),
        active(TRIAGE_COUNTS_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
      ];
    case "project_invitations":
      return [active(["my-invitations"]), active(["projects"])];
    case "views": // global (project-less) views broadcast on the user topic
      return [active(["views", "global"])];
    case "cycles": // my cycle timeline moved (fill, capture, rollover — MIN-32)
      return [
        active(GLOBAL_BOARD_KEY),
        active(HOME_SUMMARY_KEY),
        active(["me", "cycle"]),
      ];
    case "user_scratchpad": // agent (MCP) or another tab edited my notes
      return [active(["me", "scratchpad"])];
    case "ai_usage": // an AI action has just been counted → header gauge (MIN-72)
      return [active(["billing", "usage"])];
    case "billing_accounts": // sync Stripe / override admin → plan effectif
      return [active(["billing", "status"]), active(["billing", "usage"])];
    default:
      return [];
  }
}

/**
 * Is this echo that of a write that we have just done (MIN-156)?
 *
 * It decides TWO things, which go together: not to refresh caches which
 * already carry the server line, and not to rewrite the distributed line
 * there. over a subsequent edition that has already left (adoptRemoteRow). Events
 * from other clients — Numo, the MCP, a teammate — do not match any local writes
 * and therefore go through both paths.
 */
export function isOwnEcho(change: BroadcastChange): boolean {
  const id = (change.record ?? change.old_record)?.id;
  switch (change.table) {
    case "issues":
      return issueWrites.wasJustWritten(id, change.record);
    // The TICKET line: it is `issue_id` on the link table.
    case "issue_categories":
      return issueWrites.wasJustWritten(issueIdOf(change), change.record);
    case "objectives":
      return objectiveWrites.wasJustWritten(id, change.record);
    default:
      return false;
  }
}

export function keysForProjectEvent(
  change: BroadcastChange,
  projectId: string
): Invalidation[] {
  switch (change.table) {
    // Issue-shaped changes also move every cross-project aggregate: the
    // dashboard counters, the /all board, the statistics page and the palette
    // index all derive from issues (MIN-89). Plan progress on the cards and in
    // the side panel rides the same ["issues", projectId] cache.
    case "issues":
    case "issue_categories": // issues are cached hydrated with category_ids
      // The echo of OUR own writing (MIN-156): the two ticket caches
      // already carry the server line, merged when the PATCH returns. THE
      // refresh could not learn anything — but would open the window
      // race that we have just closed. Events from other clients (Numo,
      // MCP, teammates) do not match any local writing and therefore pass
      // unchanged, like derived views that are not patched.
      return isOwnEcho(change)
        ? ISSUE_DERIVED_KEYS
        : [active(["issues", projectId]), ...ISSUE_AGGREGATE_KEYS];
    case "issue_relations":
      return [active(["issue-relations", projectId]), active(GLOBAL_BOARD_KEY)];
    // An objective is copied into TWO caches: that of its project and the
    // `objectives` slice of the cross-project board (card chips, facet
    // “Objective”, ticket panel selector). The echo of our own
    // writing has nothing to teach them — both already carry the line
    // server (MIN-156); that of another client (teammate, Numo, MCP), or
    // of a creation / deletion, must achieve both, otherwise `/all`
    // kept a renamed objective under its old name.
    case "objectives":
      return isOwnEcho(change)
        ? [{ key: SEARCH_INDEX_KEY, refetch: "none" }]
        : [
            active(["objectives", projectId]),
            active(GLOBAL_BOARD_KEY),
            { key: SEARCH_INDEX_KEY, refetch: "none" },
          ];
    // The PAGES of the project — the wiki (MIN-266), silent until MIN-346.
    //
    // The cache is UNIQUE and it is FLAT: `["pages", projectId]` carries all
    // the living pages of the project, without their body (lib/use-pages-query.ts).
    // It is he who reads the tree of the secondary bar, the Ariadne's thread, the
    // subpage block and the palette — so a single invalidation resets them all
    // plumb, create, rename, move, pin and trash
    // compris.
    //
    // No direct writing of the broadcast line (`adoptRemoteRow`) as for
    // a ticket: the list is a TREE sorted by `position` within a
    // siblings, and inserting a line by hand would do the work here
    // `buildPageTree` already done — to save the time of a GET on a single
    // indexed query, without body. The relationship is not the same as for
    // `/api/me/board`, which is what justified the adoption on the ticket side.
    //
    // The signal contains no body: its only job is to make the page currently
    // open elsewhere refetch its document. The project list still receives the
    // same event because it owns the visible fields.
    case "pages":
      {
        const pageId = (change.record ?? change.old_record)?.id;
        const openPage = typeof pageId === "string" ? [active(["page", pageId])] : [];
      return [
        active(["pages", projectId]),
        ...openPage,
        // The title of a page is in the palette index
        // (app/api/me/search-index/route.ts): stale, not reloaded — it's a
        // snapshot that revalidates itself when opened.
        { key: SEARCH_INDEX_KEY, refetch: "none" },
        // Recycle bin and restore via a `deleted_at` on
        // this same table: /trash must move in whoever looks at it
        // (lib/use-trash-query.ts). “active” only costs a request if the
        // recycle bin is open at this time.
        active(["me", "trash"]),
      ];
      }
    case "categories": // renames/deletes also affect chips on cached issues
      return [
        active(["categories", projectId]),
        active(["issues", projectId]),
        // A category is copied into the cross-project board, like a
        // objective: without that, the one that a teammate (or Numo, or the addition
        // quick from another tab) just created did not exist on `/all`.
        active(GLOBAL_BOARD_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
      ];
    case "views":
      return [active(["views", projectId])];
    // A membership that changes does not only move the Members tab: the list of
    // members is COPIED into two aggregate caches — the `members` map of the
    // cross-project board (filter and assignee selector, ticket panel,
    // mentionable people from Numo — lib/use-numo-mentionables.ts) and the index
    // from the palette. Without invalidating them here, someone who has just been removed
    // remained offered everywhere else until the next outdated edit, five
    // minutes later — and a reload didn't change anything, the cache being
    // rehydrated from disk (lib/query-provider.tsx).
    case "project_members":
      return [
        active(["members", projectId]),
        active(GLOBAL_BOARD_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
        // The team changes size → the Smart Assign warning too.
        active(SMART_ASSIGN_WARNINGS_KEY),
      ];
    // A pending invitation is not yet a member of anything: only the view
    // Members, who lists both, shows it.
    case "project_invitations":
      return [active(["members", projectId])];
    // Feedback (MIN-89): the team board, the open-feedback badge in the sidebar
    // and the home section all move when a post is created, voted or triaged.
    // The dashboard summary is in that list since MIN-104 — the home "to triage"
    // section reads its undecided posts from ["me","summary"], which until then
    // only moved on issue and cycle events.
    case "feedback_posts":
    case "feedback_votes":
    case "feedback_post_categories":
      return [
        active(["feedback", projectId]),
        active(["feedback-detail", projectId]),
        active(["feedback-count", projectId]),
        active(HOME_SUMMARY_KEY),
        // The number of the project lines in the sidebar counts the returns
        // opened with tickets in triage: feedback published, promoted or
        // merged moves it, just like the Feedback tab badge.
        active(TRIAGE_COUNTS_KEY),
      ];
    case "comments": {
      // A comment hangs off an issue OR an objective OR a feedback post — route
      // to the right cache. Feedback comment keys carry the project id.
      const issueId = issueIdOf(change);
      if (issueId) return [active(["comments", issueId])];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [active(["objective-comments", objectiveId])];
      const postId = feedbackPostIdOf(change);
      return postId ? [active(["feedback-comments", projectId, postId])] : [];
    }
    case "attachments": {
      // The table keeps its name; the NOTION is a resource (MIN-184). Those on
      // comments ride the comments cache; entity-level ones have their own query.
      //
      // A resource of type `page` (MIN-275) is also one of the two
      // halves of a trackback: attaching or removing it changes the “Cited by”
      // of the targeted page, who is reading it at the moment (MIN-279). She ADDED
      // to the branches below and is not one: a resource hangs
      // always have a ticket, an objective or a return
      // (`attachments_parent_ck`), so a branch placed after them would not
      // jamais atteinte.
      const backlinks = pageIdOf(change);
      const cited: Invalidation[] = backlinks
        ? [active(["page-backlinks", backlinks])]
        : [];
      const issueId = issueIdOf(change);
      if (issueId) {
        return [
          active(["comments", issueId]),
          active(["issue-resources", issueId]),
          ...cited,
        ];
      }
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) {
        return [
          active(["objective-comments", objectiveId]),
          active(["objective-resources", objectiveId]),
          ...cited,
        ];
      }
      const postId = feedbackPostIdOf(change);
      if (postId) {
        return [active(["feedback-comments", projectId, postId]), ...cited];
      }
      return cited;
    }
    // The thread of a PAGE (MIN-282). The table carries its `page_id` in plain text, so
    // nothing to look for: a teammate's comment appears under the
    // document without reloading, and the border of its block with it.
    case "page_comments": {
      const pageId = pageIdOf(change);
      return pageId ? [active(["page-comments", pageId])] : [];
    }
    // The other half of the trackback: the DERIVED table of mentions (MIN-279).
    // It is rewritten after the response, so the echo arrives a moment later
    // writing the ticket that cites — that's exactly what the bridge is for
    // catch up, and that's what makes the line appear without reloading.
    case "page_links": {
      const record = change.record ?? change.old_record;
      const pageId = typeof record?.page_id === "string" ? record.page_id : null;
      return pageId ? [active(["page-backlinks", pageId])] : [];
    }
    // Runs of the code agent — those of the PROJECT (routine, automation,
    // PR proofreading). Personal conversations happen on the
    // user topic: same treatment, other door (MIN-332).
    case "agent_runs":
      return keysForAgentRun(change);
    // Routine writes may come from Numo, MCP, another tab, or a teammate. The
    // broadcast deliberately carries identifiers only, so refetch the shared
    // list that feeds both the sidebar and the open routine detail.
    case "agent_routines":
      return [active(["routines"])];
    // Automation chains (MIN-147). This is the only surface of the product where
    // the expiration is CERTAIN: a chain advances on its own during
    // several minutes, without anyone touching anything — without this
    // event, its status bar is false from the second following its
    // opening. The trigger only broadcasts visible transitions (status,
    // step, expense, reason for stopping — see migration).
    case "agent_chains": {
      const issueId = issueIdOf(change);
      return issueId
        ? [active(["agent-chain", "issue", issueId]), active(["agent-runs", "issue", issueId])]
        : [];
    }
    // Pull requests (MIN-161). The trigger only broadcasts the VISIBLE columns
    // (state, title, url, head, ticket, merge — see migration): a scan
    // which restamps `synced_at` on an entire repository remains silent.
    //
    // Three caches, and they are not the same readers: the LIST (Pull page
    // Requests, sidebar counter), the HEADER of a panel whose
    // PR is not the one this reader is looking at — the topic `pull-request:{id}`
    // does not reach it, he is not subscribed to it —, and the TICKET panel, which
    // read its PR and its state in `["agent-runs","issue",id]`
    // (`useIssueAgentRunsQuery`).
    case "pull_requests": {
      const record = change.record ?? change.old_record;
      const prId = typeof record?.id === "string" ? record.id : null;
      const issueId = issueIdOf(change);
      return [
        active(AGENT_ACTIVITY_KEY),
        active(ALL_PULL_REQUESTS_KEY),
        active(OPEN_PULL_REQUEST_COUNT_KEY),
        ...(prId ? [active(["pull-request", prId])] : []),
        ...(issueId ? [active(["agent-runs", "issue", issueId])] : []),
      ];
    }
    case "issue_events": {
      const issueId = issueIdOf(change);
      if (issueId) return [active(["events", issueId])];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [active(["objective-events", objectiveId])];
      const postId = feedbackPostIdOf(change);
      if (postId) return [active(["feedback-events", projectId, postId])];
      // The activity of a PAGE (MIN-278): the open panel at a teammate's house
      // must see “X modified the page” arrive without closing it.
      const pageId = pageIdOf(change);
      return pageId ? [active(["page-events", pageId])] : [];
    }
    default:
      return [];
  }
}

// Everything a scope can feed, for the catch-up refetch after a dropped
// connection (events missed while offline). Prefix keys: ["comments"] matches
// every ["comments", issueId] query.
export const USER_SCOPE_KEYS: QueryKey[] = [
  ["notifications"],
  ["projects"],
  ["my-invitations"],
  ["views", "global"],
  ["me", "board"],
  ["me", "cycle"],
  ["me", "scratchpad"],
  ["me", "triage-counts"],
  ["billing"],
  // My conversations with Numo (MIN-332): their echo no longer passes through the topic
  // of the project, so their recovery after interruption can no longer go through the
  // his neither. As a prefix, as project side — `["agent-runs"]` covers
  // `["agent-runs","issue",id]`.
  ["agent-runs"],
  AGENT_ACTIVITY_KEY,
  ALL_AGENT_SESSIONS_KEY,
  ALL_PULL_REQUESTS_KEY,
  OPEN_PULL_REQUEST_COUNT_KEY,
];

export const projectScopeKeys = (projectId: string): QueryKey[] => [
  ["issues", projectId],
  ["issue-relations", projectId],
  ["objectives", projectId],
  ["categories", projectId],
  ["views", projectId],
  ["members", projectId],
  ["comments"],
  ["events"],
  ["issue-resources"],
  ["objective-comments"],
  ["objective-events"],
  ["objective-resources"],
  ["feedback", projectId],
  ["feedback-detail", projectId],
  ["feedback-count", projectId],
  ["feedback-comments", projectId],
  ["feedback-events", projectId],
  ["agent-runs"],
  AGENT_ACTIVITY_KEY,
  // Routines can be edited while this tab is asleep. Their project broadcast
  // is ephemeral, so the persisted list needs the same resume catch-up.
  ["routines"],
  // The automation chain of a ticket (MIN-147): in prefix, like the
  // runs — a tab that slept while a chain was running should
  // find your real stage, not the one before the cut.
  ["agent-chain"],
  // The panel of a PR, its four surfaces (MIN-161). As a prefix, and the
  // four: messages in the `pull-request:{id}` topic are EPHEMERAL — one
  // sleeping tab doesn't replay them, it just didn't get them. It is therefore
  // this catch-up which brings the thread, commits and comments up to date
  // return to the foreground, and nothing else. Only MOUNTED queries
  // repartent au serveur (cf. `catchUp`), soit un panneau au plus.
  ["pull-request"],
  ["pr-comments"],
  ["pr-commits"],
  ["pr-review-comments"],
  // THE TREE of pages (MIN-266). It is persisted on disk
  // (lib/query-provider.tsx) and its `staleTime` is five minutes: one
  // window remained open on the Pages tab during a shutdown does not ask again
  // NOTHING about herself. It is this catch-up that puts the tree back into phase.
  ["pages", projectId],
  // The activity of a page (MIN-278), prefixed like ticket events:
  // a panel left open during an outage must make up for the gestures it
  // n'a pas vus passer.
  ["page-events"],
  // One-page trackbacks (MIN-279), prefixed for the same reason: they
  // arise from writings made ELSEWHERE, therefore from events that a tab
  // asleep has not received.
  ["page-backlinks"],
  // The thread of a page (MIN-282), prefixed like the ticket comments:
  // a page left open during a cut must find the objections
  // written in the meantime, not those before.
  ["page-comments"],
  // The aggregates this project feeds — missed events while offline would
  // otherwise leave the dashboard and /all stale until their staleTime.
  GLOBAL_BOARD_KEY,
  HOME_SUMMARY_KEY,
  STATS_KEY,
  TRIAGE_COUNTS_KEY,
  ALL_AGENT_SESSIONS_KEY,
  ALL_PULL_REQUESTS_KEY,
  OPEN_PULL_REQUEST_COUNT_KEY,
];
