import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";
import {
  collapsesInBurst,
  forgeActorValue,
  PR_EVENT_BURST_MS,
  type ForgeProvider,
  type PrActionEventType,
} from "@/lib/pr-events";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { findPullRequestByNumber } from "./pull-requests";
import { findRunsForPr } from "./runs";
import type { NotificationType } from "@/lib/types";
import type { AgentRun, SyncedPrRun } from "./runs";

/**
 * Window during which an identical gesture ALREADY drawn is echoed. The hook
 * arrives within a second of the forge call; two identical gestures
 * spaced more than that are two distinct facts, and both can be traced.
 */
const ECHO_WINDOW_MS = 2 * 60_000;

/** A member's forge count, as both tables store it. */
interface ForgeAccountRow {
  user_id?: string | null;
  provider_account_id: string | null;
  account_login: string | null;
}

/** The actor of a hook, such as the forge book. */
interface ForgeAccountRef {
  /** Account ID at the forge — the KEY: immutable when renamed. */
  accountId: string | null;
  /** Account login — a DISPLAY name, kept in seniority. */
  login: string | null;
}

/**
 * Does this line refer to this forge account (MIN-154)?
 *
 * The key is `provider_account_id`: the login is a display name, written once upon account login and never refreshed — a rename at GitHub
 * or GitLab was enough to make its bearer unknown to minddy.
 *
 * The login remains a fallback, but only where the id cannot decide:
 * seniority line whose id is null (the column is nullable on both sides),
 * or hook which don't deliver any. It NEVER wins against a different id — two
 * people can follow one another on the same name, and assigning the gesture to the wrong member is worse than assigning it to no one.
 */
export function forgeAccountMatches(
  row: ForgeAccountRow,
  actor: ForgeAccountRef,
): boolean {
  if (actor.accountId && row.provider_account_id) {
    return row.provider_account_id === actor.accountId;
  }
  return !!actor.login && row.account_login === actor.login;
}

/**
 * `,` `(` `)` `"` are the PostgREST filter syntax separators: a
 * value carrying one would break the `.or(...)` instead of restricting it. No
 * forge login contains any — the term is skipped rather than risked.
 */
function isFilterSafe(value: string): boolean {
  return !/[,()"]/.test(value);
}

/**
 * minddy members behind a forge account — the bridge enabled by MIN-144:
 * `git_user_identities` on GitHub (the authorized account), and the OAuth
 * connection on GitLab (which IS already the person's identity).
 *
 * Exported for `pr-opened-notify.ts`, which uses it in the opposite direction:
 * not “is this gesture an echo of ours?” but “who among us just opened this
 * PR?” — the only person not to notify.
 *
 * A single query on the webhook path: request the rows that either the ID or
 * login could identify, then let `forgeAccountMatches` decide in memory — the
 * `.or(...)` is a broad net; the in-memory rule is authoritative.
 *
 * Empty when nobody has connected this account: the person is then acting
 * outside minddy, and there is nothing to deduplicate.
 */
export async function minddyUsersForForgeAccount(opts: {
  provider: ForgeProvider;
  accountId: string | null;
  login: string | null;
}): Promise<string[]> {
  const terms: string[] = [];
  if (opts.accountId && isFilterSafe(opts.accountId)) {
    terms.push(`provider_account_id.eq.${opts.accountId}`);
  }
  if (opts.login && isFilterSafe(opts.login)) {
    terms.push(`account_login.eq."${opts.login}"`);
  }
  if (terms.length === 0) return [];

  const service = getServiceClient();
  const table = opts.provider === "github" ? "git_user_identities" : "git_connections";
  const { data } = await service
    .from(table)
    .select("user_id, provider_account_id, account_login")
    .eq("provider", opts.provider)
    .or(terms.join(","));
  return [
    ...new Set(
      ((data ?? []) as ForgeAccountRow[])
        .filter((row) => forgeAccountMatches(row, opts))
        .map((r) => r.user_id)
        .filter((id): id is string => !!id),
    ),
  ];
}

/**
 * Was this (ticket, gesture, PR) just recorded by the route, meaning it was
 * performed FROM minddy (MIN-144)?
 *
 * Until MIN-144, echo prevention could use the ACTOR: a merge from minddy came
 * from the GitHub App bot (or the account that linked the repository on GitLab),
 * so “actor = us” was sufficient. Now a human gesture comes from the PERSON'S
 * git account: the hook actor is the same whether they clicked in minddy or on
 * the forge, and identity alone no longer distinguishes the two — without this
 * guard, every merge from minddy produces TWO activity lines (one from the
 * route, then one from the hook), two integration webhook dispatches, and an
 * inbox notification to the run author for their own gesture.
 *
 * What we therefore seek is precise: an event of the SAME type, on the SAME PR,
 * written a few seconds ago BY THE MEMBER who owns this forge account. Another
 * member approving on the forge at the same second keeps their own line.
 *
 * This member is identified by their forge account ID, not their login
 * (MIN-154): the login is a display name that is never refreshed, and a rename
 * on GitHub or GitLab made this guard silently stop working forever. The result
 * was two identical activity lines on the ticket, two integration webhook
 * dispatches, and an inbox notification to the run author for their own gesture.
 *
 * Best effort, and the race is not always won: if the hook arrives before the
 * route writes its event, we fall back to the previous behavior (a duplicate) —
 * never a lost event.
 */
export async function isPrActionEcho(opts: {
  issueIds: (string | null | undefined)[];
  type: PrActionEventType;
  prNumber: number;
  provider: ForgeProvider;
  /** Forge account ID of the actor — the identity key (MIN-154). */
  accountId: string | null;
  /** Forge login of the actor: fallback when the ID is missing on one side. */
  login: string | null;
}): Promise<boolean> {
  const issueIds = [...new Set(opts.issueIds.filter((id): id is string => !!id))];
  if (issueIds.length === 0) return false;
  const actorIds = await minddyUsersForForgeAccount({
    provider: opts.provider,
    accountId: opts.accountId,
    login: opts.login,
  });
  if (actorIds.length === 0) return false;
  const { data } = await getServiceClient()
    .from("issue_events")
    .select("id")
    .in("issue_id", issueIds)
    .in("actor_id", actorIds)
    .eq("type", opts.type)
    .eq("to_value", String(opts.prNumber))
    .gte("created_at", new Date(Date.now() - ECHO_WINDOW_MS).toISOString())
    .limit(1);
  return !!data?.length;
}

/**
 * Does this (ticket, gesture, PR, actor) ALREADY have a line less than two
 * minutes old? This is the guard for repeatable gestures (`collapsesInBurst`).
 *
 * A GitHub review with eight line comments arrives as eight nearly simultaneous
 * `pull_request_review_comment` events: eight facts for the forge, but one
 * gesture for the ticket reader. Without this grouping, the log would repeat
 * the same sentence eight times.
 *
 * Best effort, for the same reason as echo prevention: the eight deliveries can
 * run in parallel, and one read can occur before its neighbor is written. We
 * may then end up with a few extra lines — never a lost line, and never one
 * attributed to the wrong actor.
 *
 * Two modes, depending on where the gesture came from: in-app (`actorId`, the
 * minddy member) or forge (`actor_id` null, with the actor encoded in
 * `from_value`).
 */
export async function hasRecentPrEvent(opts: {
  issueIds: string[];
  type: string;
  prNumber: number;
  actorId?: string | null;
  fromValue?: string | null;
}): Promise<boolean> {
  if (opts.issueIds.length === 0) return false;
  let query = getServiceClient()
    .from("issue_events")
    .select("id")
    .in("issue_id", opts.issueIds)
    .eq("type", opts.type)
    .eq("to_value", String(opts.prNumber))
    .gte("created_at", new Date(Date.now() - PR_EVENT_BURST_MS).toISOString())
    .limit(1);
  if (opts.actorId) {
    query = query.eq("actor_id", opts.actorId);
  } else {
    query = query.is("actor_id", null);
    query = opts.fromValue
      ? query.eq("from_value", opts.fromValue)
      : query.is("from_value", null);
  }
  const { data } = await query;
  return !!data?.length;
}

/** Tickets that do not already have the line (identity: gesture + PR + forge actor). */
async function withoutBurstDuplicates(opts: {
  issueIds: string[];
  type: PrActionEventType;
  prNumber: number;
  fromValue: string | null;
}): Promise<string[]> {
  if (!collapsesInBurst(opts.type)) return opts.issueIds;
  const kept: string[] = [];
  for (const issueId of opts.issueIds) {
    const recent = await hasRecentPrEvent({
      issueIds: [issueId],
      type: opts.type,
      prNumber: opts.prNumber,
      fromValue: opts.fromValue,
    });
    if (!recent) kept.push(issueId);
  }
  return kept;
}

/**
 * Activity emitter for PR/MR actions performed DIRECTLY on the provider
 * (GitHub AND GitLab webhooks — MIN-69, extracted from the GitHub webhook). One
 * event per issue (multiple runs can share the same PR). The actor is the
 * provider user, not a minddy user (`actor_id` null); their login is stored in
 * `from_value` (prefixed with `gitlab:` for GitLab — see `forgeActorValue`), and
 * the PR/MR number in `to_value`. In-app actions go through the routes with the
 * member as actor.
 */
export async function recordForgePrActionEvents(opts: {
  runs: SyncedPrRun[];
  type: PrActionEventType;
  prNumber: number;
  provider: ForgeProvider;
  login: string | null;
}): Promise<void> {
  // CARNET runs (MIN-84) have no issue, so there is nothing to record for them.
  const issueIds = [
    ...new Set(opts.runs.map((r) => r.issueId).filter((id): id is string => id != null)),
  ];
  if (issueIds.length === 0) return;
  const fromValue = forgeActorValue(opts.provider, opts.login);
  const targets = await withoutBurstDuplicates({
    issueIds,
    type: opts.type,
    prNumber: opts.prNumber,
    fromValue,
  });
  if (targets.length === 0) return;
  await insertEvents(
    getServiceClient(),
    targets.map((issueId) => ({
      issue_id: issueId,
      actor_id: null,
      type: opts.type,
      from_value: fromValue,
      to_value: String(opts.prNumber),
    })),
  );
}

/** Forge action → notification type (null = nothing to announce: rejecting a
    PR is already visible in the ticket when it returns to “to do”). */
function notificationTypeFor(type: PrActionEventType): NotificationType | null {
  if (type === "pr_accepted") return "pr_merged";
  if (type === "pr_approved" || type === "pr_changes_requested") return "pr_reviewed";
  return null;
}

/**
 * Inbox (MIN-138): notify the run AUTHOR when someone approves, requests
 * changes, or merges THEIR pull request directly on the forge. Otherwise they
 * only learn about it by opening the page.
 *
 * Called immediately after `recordForgePrActionEvents`, behind the SAME echo
 * guards (GitHub bot / GitLab service account): an action performed from minddy
 * is already known to the person who performed it.
 *
 * **Without `replaceUnread`**, unlike agent notifications: the sibling types
 * of `insertNotifications` cover only the agent family, and two successive
 * reviews are two distinct FACTS, not the state of a run being rewritten. Best
 * effort, like everything else in this module.
 */
export async function notifyForgePrAction(opts: {
  runs: SyncedPrRun[];
  type: PrActionEventType;
  actorLogin: string | null;
}): Promise<void> {
  const notificationType = notificationTypeFor(opts.type);
  if (!notificationType) return;
  // A CARNET run has no issue to notify, and an imported run has no author.
  // Deduplicated by (recipient, issue): multiple runs can share a PR.
  const seen = new Set<string>();
  const rows = opts.runs
    .filter((r) => r.createdBy && r.issueId)
    .filter((r) => {
      const key = `${r.createdBy}:${r.issueId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      user_id: r.createdBy as string,
      project_id: r.projectId,
      type: notificationType,
      issue_id: r.issueId,
      // The actor is a forge account, not a minddy user: the inbox falls back to
      // the type icon, as it does for a return from the public board.
      actor_id: null,
    }));
  if (rows.length === 0) return;
  try {
    await insertNotifications(getServiceClient(), rows);
  } catch (e) {
    console.error("[pr-activity] notify failed:", (e as Error).message);
  }
}

/**
 * The member on whose behalf to write to the ticket for a PR without a run
 * (MIN-143): the one who LINKED the repository to that ticket's project.
 *
 * `updateIssueFields` bypasses RLS but performs its own access check, so it
 * needs a real member. The person who created the link is the only one known to
 * belong to THIS project and to have intended this repository — they are already
 * the technical actor for issue sync (MIN-97). The forge itself is credited in
 * the UI by `forgeSync`.
 *
 * Null when the ticket has disappeared, when no link joins this repository to
 * its project, or when the link has no author: we do not guess an actor.
 */
async function repoWriteActor(opts: {
  provider: ForgeProvider;
  repoFullName: string;
  issueId: string;
}): Promise<string | null> {
  const service = getServiceClient();
  const { data: issue } = await service
    .from("issues")
    .select("project_id")
    .eq("id", opts.issueId)
    .is("deleted_at", null)
    .maybeSingle();
  const projectId = (issue as { project_id: string } | null)?.project_id;
  if (!projectId) return null;

  const { data: link } = await service
    .from("project_git_links")
    .select("created_by")
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName)
    .eq("project_id", projectId)
    .maybeSingle();
  return (link as { created_by: string | null } | null)?.created_by ?? null;
}

/**
 * “Ticket” effects of a forge event on a PR/MR with NO run (MIN-143): align the
 * status and record the action.
 *
 * Without this, the same gesture has two outcomes depending on where it is
 * performed: merging a human PR FROM minddy moves its ticket to done (the routes
 * read `pull_requests.issue_id`), while merging it on GitHub did nothing — the
 * entire webhook path started from runs, which a human PR does not have.
 *
 * Deliberately excluded: the NOTIFICATION. `notifyForgePrAction` notifies the
 * run author; a human PR has none, and determining which minddy member owns
 * which forge account is the identity work that MIN-143 defers.
 *
 * Best effort end to end, like the rest of this module.
 */
export async function applyForgePrToIssue(opts: {
  provider: ForgeProvider;
  repoFullName: string;
  prNumber: number;
  /** New PR state, or null if the event describes none. */
  prState: AgentRun["pr_state"] | null;
  /** Action to record, or null (unrecorded action, or an echo of an in-app gesture). */
  actionType: PrActionEventType | null;
  /** Forge account ID of the actor — used to recognize echoes (MIN-154). */
  accountId: string | null;
  /** Forge login of the actor — it serves as the actor in the timeline. */
  login: string | null;
}): Promise<void> {
  if (!opts.prState && !opts.actionType) return;

  const pr = await findPullRequestByNumber({
    provider: opts.provider,
    repoFullName: opts.repoFullName,
    number: opts.prNumber,
  });
  // No linked ticket: this is NORMAL for a human PR, not a failure.
  if (!pr?.issue_id) return;
  const issueId = pr.issue_id;

  if (opts.prState) {
    const actorId = await repoWriteActor({
      provider: opts.provider,
      repoFullName: opts.repoFullName,
      issueId,
    });
    if (actorId) {
      await syncIssueStatusFromPr({
        issueId,
        actorId,
        prState: opts.prState,
        forgeSync: opts.provider,
      });
    }
  }

  // Activity has never needed a minddy actor: `actor_id` is null and the forge
  // login travels in `from_value` (see `forgeActorValue`).
  // Except for echoes: since MIN-144, merging a human PR FROM minddy uses the
  // person's git account, and the caller can no longer distinguish it from a
  // merge performed on the forge — the route has already recorded it.
  if (
    opts.actionType &&
    !(await isPrActionEcho({
      issueIds: [issueId],
      type: opts.actionType,
      prNumber: opts.prNumber,
      provider: opts.provider,
      accountId: opts.accountId,
      login: opts.login,
    }))
  ) {
    const fromValue = forgeActorValue(opts.provider, opts.login);
    const targets = await withoutBurstDuplicates({
      issueIds: [issueId],
      type: opts.actionType,
      prNumber: opts.prNumber,
      fromValue,
    });
    if (targets.length === 0) return;
    await insertEvents(getServiceClient(), [
      {
        issue_id: issueId,
        actor_id: null,
        type: opts.actionType,
        from_value: fromValue,
        to_value: String(opts.prNumber),
      },
    ]);
  }
}

/**
 * Record a forge gesture with NO state effect on a PR's ticket(s) — a review,
 * thread comment, or line comment. This is the counterpart, for gestures that
 * do not change the PR itself, to what `handlePullRequest` does around
 * `syncPrState`.
 *
 * One rule to remember: Numo's PR goes through its RUNS (they carry the ticket,
 * and the run author deserves the notification), while a human PR goes through
 * the PR itself (MIN-143, `applyForgePrToIssue`). The `runs.length === 0` guard
 * was missing from the review path: approving a human PR on GitHub left no trace
 * on its ticket, while merging it did.
 *
 * Best effort end to end, like the rest of this module.
 */
export async function recordForgePrGesture(opts: {
  provider: ForgeProvider;
  repoFullName: string;
  prNumber: number;
  type: PrActionEventType;
  /** Forge account ID of the actor — the echo-prevention key (MIN-154). */
  accountId: string | null;
  /** Forge login of the actor — it serves as the actor in the timeline. */
  login: string | null;
}): Promise<void> {
  const runs = await findRunsForPr({
    repoFullName: opts.repoFullName,
    prNumber: opts.prNumber,
    provider: opts.provider,
  });
  if (runs.length === 0) {
    await applyForgePrToIssue({ ...opts, prState: null, actionType: opts.type });
    return;
  }
  const echo = await isPrActionEcho({
    issueIds: runs.map((r) => r.issueId),
    type: opts.type,
    prNumber: opts.prNumber,
    provider: opts.provider,
    accountId: opts.accountId,
    login: opts.login,
  });
  if (echo) return;
  await recordForgePrActionEvents({
    runs,
    type: opts.type,
    prNumber: opts.prNumber,
    provider: opts.provider,
    login: opts.login,
  });
  // Inbox: without an associated notification type (comments), this is a no-op.
  await notifyForgePrAction({ runs, type: opts.type, actorLogin: opts.login });
}
