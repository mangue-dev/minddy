import { type NextRequest, NextResponse } from "next/server";
import { verifyGithubSignature } from "@/lib/server/git/github-app";
import { isManagedForgeEnabled } from "@/lib/managed-services";
import { enqueueRelayDeliveryForPayload } from "@/lib/server/forge-relay/fanout";
import {
  getProvisionedWebhookSecret,
  loadProvisionedRelayConfig,
} from "@/lib/server/forge-relay/provisioning";
import { syncPrState, findRunsForPr } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import {
  applyForgePrToIssue,
  isPrActionEcho,
  recordForgePrActionEvents,
  recordForgePrGesture,
  notifyForgePrAction,
} from "@/lib/server/agent/pr-activity";
import { notifyPullRequestOpened } from "@/lib/server/agent/pr-opened-notify";
import {
  githubPrState,
  githubPrStateForAction,
  isPullRequestComment,
  prActionForPullRequest,
  prActionForReview,
} from "@/lib/server/agent/pr-webhook-core";
import {
  normalizeGithubIssueCommentEvent,
  normalizeGithubIssueDependencyEvent,
  normalizeGithubIssueEvent,
} from "@/lib/server/git/issue-sync-core";
import {
  syncGithubIssueComment,
  syncGithubIssueDependency,
  syncRemoteIssueEvent,
} from "@/lib/server/git/issue-sync";
import { isReplayedForgeDelivery } from "@/lib/server/git/webhook-dedup";
import {
  findPullRequestByNumber,
  findPullRequestsByHeadSha,
  resolveIssueForPr,
  upsertPullRequest,
  type PullRequestRow,
} from "@/lib/server/agent/pull-requests";
import { handleForgeNumoMention } from "@/lib/server/agent/pr-mention";
import {
  broadcastPrChanged,
  broadcastPrChangedByNumber,
} from "@/lib/server/agent/pr-live";
import type { PrLivePart } from "@/lib/pr-live";
import type { PrActionEventType } from "@/lib/pr-events";

/**
 * POST /api/webhooks/github — webhook receiver from the GitHub App (MIN-47/MIN-46).
 *
 * We check the HMAC signature (`X-Hub-Signature-256`) then we synchronize the state
 * Pull Requests from the repository:
 * - `pull_request` → INGEST the PR in `pull_requests` (MIN-143: from Numo or
 * of a human, it's the same fact of the repository), updates `agent_runs.pr_state`
 * (the in-app review reflects the real state on the GitHub side) AND trace in the activity
 * of the related issue what was done DIRECTLY on GitHub: open (`opened`),
 *    push commits (`synchronize`), accept or reject (`closed`).
 * - `pull_request_review` → trace “approved the PR” / “requested changes”,
 * and “commented on the PR” when the review carries a message. Reviews
 * “dismissed” are ignored.
 * - `pull_request_review_comment` → trace “commented the PR code”. A
 * review of N remarks arrives in N events: they are grouped in one line
 *    (`collapsesInBurst`).
 * - `pull_request_review_thread` (resolved/unresolved) → writes NOTHING: the
 * resolution of a thread lives at the forge (MIN-139), not at minddy. The event
 * is only there for live — without it, resolving a thread on github.com would not work.
 * was seen in the open panel only when reloading.
 * - `check_suite` (completed) / `status` → same: nothing to write, the CI is not
 * in base. They push the direct so that the CI banner updates without
 * wait for the next poll round.
 * - `issue_comment` (on a PR) → traces “commented the PR”, and triggers the
 * rereading of Numo if the message MENTIONS it (MIN-162). Write `@numo`
 * from github.com therefore does the same thing as writing it from minddy — except
 * that the expense is borne by the project owner of the linked ticket, due to lack of
 * minddy account behind the author (see `lib/server/agent/pr-mention`).
 *  - `issues` (opened/closed/reopened) → one-way synchronization of
 * from the repository to the projects that activated it (MIN-97). One Way :
 * minddy never writes at GitHub.
 * Any other event (ping, push, etc.) is simply acknowledged.
 *
 * DIRECT (MIN-161): each path also pushes a `changed` on the topic of
 * the PR (`broadcastPrChanged*`), which NAMES the affected parts — the panel
 * open will reread at the forge, with the token of the one who looks. This
 * broadcast passes BEFORE the guards `isBot` / `isPrActionEcho`: these guards
 * protect ACTIVITY and notifications from duplicate, but the fact that PR
 * moved is true in all cases, including when the actor is the bot or
 * when it is the echo of our own writing. Cost assumed: a round trip of
 * too much forge for the author of the gesture, absorbed by customer coalescing.
 *
 * INSTALLATION PREREQUISITES — events the GitHub App subscribes to
 * (App settings page). None require permission beyond Pull
 * requests already granted; without them, the event is never delivered:
 * `issue_comment`, `pull_request_review_comment` — comments, otherwise
 * the corresponding activity lines do not appear;
 * `pull_request_review_thread` — the resolution of a live thread;
 * `check_suite`, `status` — the live CI.
 *
 * Anti-duplicate: minddy in-app actions (merge/close/request changes)
 * are already drawn on the road side with the precise HUMAN actor. Their webhook echo is
 * issued by the GitHub App BOT (`sender.type === "Bot"`) → we ignore it here.
 * Only actions done by a HUMAN on GitHub produce activity.
 *
 * Fail-closed: invalid signature → 401. Secret not deployed → 503 without anything
 * process (GitHub will re-deliver once the secret is in place), aligned with the
 * GitLab receiver. A delivery already seen (`X-GitHub-Delivery`) is acknowledged
 * without being replayed (MIN-333).
 *
 * The secret is that of the App — not that of a repository: unlike
 * GitLab, the endpoint is declared at the App level and its secret can only be read
 * in the App settings, never in those of an installed repository. It is
 * why only the GitLab side needed a secret per repository (MIN-333).
 */

interface GithubActor {
  /** Account Id — the identity key, immutable upon renaming (MIN-154). */
  id?: number;
  login?: string;
  type?: string;
}

/** The actor's forge account ID as text (column `provider_account_id`). */
function actorAccountId(actor: GithubActor | undefined | null): string | null {
  return actor?.id != null ? String(actor.id) : null;
}

/** The actor is the GitHub App bot → the action comes from Numo (echo of an
    agent action already traced): we do not re-trace.

    No longer enough to recognize a HUMAN gesture made since minddy: since
    MIN-144 it starts from the person's git account, so the hook actor is the
    same as if she had clicked on github.com. It is `isPrActionEcho` which
    decides this case, on the event already traced by the road. */
function isBot(actor: GithubActor | undefined | null): boolean {
  return actor?.type === "Bot";
}

/** The PR such as GitHub delivers it in a `pull_request` event. */
interface PullRequestPayload {
  number?: number;
  merged?: boolean;
  merged_at?: string | null;
  html_url?: string;
  state?: string;
  draft?: boolean;
  title?: string;
  body?: string | null;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
  user?: { login?: string; avatar_url?: string } | null;
  created_at?: string;
  updated_at?: string;
}

interface PullRequestEvent {
  action?: string;
  number?: number;
  pull_request?: PullRequestPayload;
  repository?: { full_name?: string };
  sender?: GithubActor;
}

/**
 * Actions that describe a RA condition to be INGESTED (MIN-143). Wider than
 * `githubPrStateForAction`, which only controls the life cycle of runs and
 * ticket: here we keep the PR itself up to date — its title, its head, its status —
 * and a modified or postponed PR is a PR that has changed.
 */
const INGESTED_PR_ACTIONS = new Set([
  "opened",
  "edited",
  "closed",
  "reopened",
  "synchronize",
  "converted_to_draft",
  "ready_for_review",
]);

/**
 * Saves PR at minddy — from Numo or a human, it's the same fact from
 * depot (MIN-143). The connection to the ticket comes from what the PR says about it
 * (branch, title, closing line); if it yields nothing, we do not touch the
 * existing attachment: a run was able to pose him.
 */
async function ingestPullRequest(
  repoFullName: string,
  number: number,
  pr: PullRequestPayload,
): Promise<PullRequestRow | null> {
  const issueId = await resolveIssueForPr({
    provider: "github",
    repoFullName,
    branch: pr.head?.ref,
    title: pr.title,
    body: pr.body,
  });
  return upsertPullRequest({
    provider: "github",
    repoFullName,
    number,
    state: githubPrState(pr),
    url: pr.html_url ?? null,
    title: pr.title ?? null,
    authorLogin: pr.user?.login ?? null,
    authorAvatarUrl: pr.user?.avatar_url ?? null,
    headBranch: pr.head?.ref ?? null,
    baseBranch: pr.base?.ref ?? null,
    headSha: pr.head?.sha ?? null,
    openedAt: pr.created_at ?? null,
    mergedAt: pr.merged_at ?? null,
    updatedAt: pr.updated_at,
    issueId: issueId ?? undefined,
  });
}

interface PullRequestReviewEvent {
  action?: string;
  /** `body` separates the review which CARRYS a message from the simple envelope of
      remarques de ligne (cf. `prActionForReview`). */
  review?: { state?: string; body?: string | null; user?: GithubActor };
  pull_request?: { number?: number };
  repository?: { full_name?: string };
  sender?: GithubActor;
}

/** Comment from FIL. GitHub serves issues and PRs on the same event —
    `issue.pull_request` is what distinguishes them (see `isPullRequestComment`). */
interface IssueCommentEvent {
  action?: string;
  issue?: { number?: number; pull_request?: unknown } | null;
  /** `body` serves the mention `@numo` (MIN-162): this is the only signal we have
      from a call to Numo written from github.com. */
  comment?: { body?: string | null; user?: GithubActor } | null;
  repository?: { full_name?: string };
  sender?: GithubActor;
}

/** LINE note (review comment anchored in the diff). */
interface PullRequestReviewCommentEvent {
  action?: string;
  comment?: { user?: GithubActor } | null;
  pull_request?: { number?: number };
  repository?: { full_name?: string };
  sender?: GithubActor;
}

async function handlePullRequest(payload: PullRequestEvent): Promise<void> {
  const action = payload.action ?? "";
  const number = payload.number ?? payload.pull_request?.number;
  const repoFullName = payload.repository?.full_name;
  if (number == null || !repoFullName) return;

  // Ingestion FIRST (MIN-143): RA exists in minddy, whether it comes from
  // Numo or a human. The guards who follow — the leading state, then the
  // runs — only talk about the agent's lifecycle, and a human PR doesn't have any
  // not. This is also what makes the connection to the ticket READABLE lower:
  // `applyForgePrToIssue` rereads the line just written.
  const ingested =
    payload.pull_request && INGESTED_PR_ACTIONS.has(action)
      ? await ingestPullRequest(repoFullName, number, payload.pull_request)
      : null;

  // Inbox: The project learns that a pull request is waiting for eyes. Here, right
  // after ingestion, and not lower with the other notifications: these
  // go to the author of a RUN, but a human PR does not have one - it is precisely
  // the one that no one knew about. The App bot is removed: when it
  // opens, it's Numo, and the ad has already gone out on the agent side.
  if (action === "opened" && !isBot(payload.sender)) {
    await notifyPullRequestOpened(ingested, {
      actor: {
        accountId: actorAccountId(payload.sender),
        login: payload.sender?.login ?? null,
      },
    });
  }

  // Direct: the header moved, and a `synchronize` pushed commits. Issued
  // HERE, before the lower lifecycle guards — a PR without a run, an actor
  // bot, an echo of our own gesture: in all these cases the PR moved to
  // TRUE. We reuse the line we just wrote rather than rereading it.
  //
  // The FIL is part of it, and not just the header: since MIN-159 the
  // conversation carries the ACTIVITY of the PR, read in the timeline of the forge
  // (`prCommentsResponse` → `listTimeline`). “pushed 3 commits”, “has
  // merged”, “renamed”, “reviewed”: each of these facts is born
  // of an event `pull_request` and goes INTO the thread. Without `conversation`, the
  // pushed commit appeared in the Commits tab but not in the
  // conversation until the next reload.
  const liveParts: PrLivePart[] =
    action === "synchronize"
      ? ["pr", "conversation", "commits"]
      : ["pr", "conversation"];
  if (ingested) {
    broadcastPrChanged(ingested.id, liveParts);
  } else {
    await broadcastPrChangedByNumber({
      provider: "github",
      repoFullName,
      number,
      parts: liveParts,
    });
  }

  const merged = !!payload.pull_request?.merged;
  // Status comes from PAYLOAD, not action alone (MIN-164): a reopened PR
  // may have remained messy, and `reopened` was “open” in hard copy.
  const prState = githubPrStateForAction(action, payload.pull_request ?? {});
  // Activity: open, push commits, accept (merge) or refuse (close)
  // from GitHub. The in-app gesture made by Numo goes through the App bot →
  // ignored (already drawn on the agent or route side).
  const actionType = prActionForPullRequest(action, merged);
  // Two independent axes (same shape as the GitLab receiver): `synchronize`
  // doesn't change ANY run state — it just tells. Take it out here, like
  // did it `if (!prState) return`, amounted to never tracing it.
  if (!prState && !actionType) return;

  const runs = prState
    ? await syncPrState({
        repoFullName,
        prNumber: number,
        prState,
        prUrl: payload.pull_request?.html_url ?? null,
        provider: "github",
      })
    : await findRunsForPr({ repoFullName, prNumber: number, provider: "github" });

  const byHuman = !isBot(payload.sender);

  // NO run behind this PR: it is a human PR (MIN-143). She can
  // ticket anyway — by branch name, title or line
  // closing. Merging it on GitHub should produce what merging it does
  // since minddy produces, otherwise the same gesture has two effects depending on the location.
  if (runs.length === 0) {
    await applyForgePrToIssue({
      provider: "github",
      repoFullName,
      prNumber: number,
      prState,
      actionType: byHuman ? actionType : null,
      accountId: actorAccountId(payload.sender),
      login: payload.sender?.login ?? null,
    });
    return;
  }

  // Aligns the status of the issues with the new PR state (MIN-46):
  // merged→done, closed→todo, ouverte→in_review, brouillon→in_progress.
  if (prState) {
    for (const run of runs) {
      // `issueId` null = run notebook (MIN-84): no issue to align.
      if (run.createdBy && run.issueId) {
        await syncIssueStatusFromPr({ issueId: run.issueId, actorId: run.createdBy, prState });
      }
    }
  }
  // `byHuman` no longer says “made on GitHub” since MIN-144: a merge/close
  // launched from minddy also has a human account. The echo is therefore read on
  // the event that the road has just written.
  const echo =
    !!actionType &&
    byHuman &&
    (await isPrActionEcho({
      issueIds: runs.map((r) => r.issueId),
      type: actionType,
      prNumber: number,
      provider: "github",
      accountId: actorAccountId(payload.sender),
      login: payload.sender?.login ?? null,
    }));
  if (actionType && byHuman && !echo) {
    await recordForgePrActionEvents({
      runs,
      type: actionType,
      prNumber: number,
      provider: "github",
      login: payload.sender?.login ?? null,
    });
    // Inbox: the author of the run learns that his PR has been merged (MIN-138).
    await notifyForgePrAction({ runs, type: actionType, actorLogin: payload.sender?.login ?? null });
  }
}

/**
 * Trace a forge gesture WITHOUT state effect — review, thread comment,
 * line remark. The App bot is excluded here: when it acts, it's Numo,
 * and Numo traces his own gestures with his own identity.
 *
 * `recordForgePrGesture` carries the rest (runs or human PR, anti-echo,
 * burst grouping) — it is shared with the GitLab receiver.
 */
async function recordGithubGesture(opts: {
  type: PrActionEventType | null;
  number: number | undefined;
  repoFullName: string | undefined;
  actor: GithubActor | undefined | null;
}): Promise<void> {
  if (!opts.type || opts.number == null || !opts.repoFullName || isBot(opts.actor)) return;
  await recordForgePrGesture({
    provider: "github",
    repoFullName: opts.repoFullName,
    prNumber: opts.number,
    type: opts.type,
    accountId: actorAccountId(opts.actor),
    login: opts.actor?.login ?? null,
  });
}

/**
 * Live from an event that only knows one number in a repository. Out so that
 * each handler pushes it in a line, BEFORE its own anti-echo guards.
 */
async function broadcastGithubPr(
  repoFullName: string | undefined,
  number: number | undefined,
  parts: PrLivePart[],
): Promise<void> {
  if (!repoFullName || number == null) return;
  await broadcastPrChangedByNumber({ provider: "github", repoFullName, number, parts });
}

async function handlePullRequestReview(payload: PullRequestReviewEvent): Promise<void> {
  // A review moves THREE surfaces: its message goes in the thread, its remarks
  // in the diff, and its verdict changes the approval counter that
  // `prDetailResponse` is used with the header.
  //
  // The direct starts on the THREE actions (submitted/edited/dismissed), like
  // for line remarks, and BEFORE the guard below: REMOVE one
  // approval (`dismissed`) changes the header counter as much as the
  // ask, and puts a `review_dismissed` in the thread; `edited` rewrites it
  // body. The ACTIVITY only traces the submitted review — denouncing its
  // own review is not a gesture to be written on the ticket.
  await broadcastGithubPr(payload.repository?.full_name, payload.pull_request?.number, [
    "conversation",
    "reviewComments",
    "pr",
  ]);
  if (payload.action !== "submitted") return;
  await recordGithubGesture({
    type: prActionForReview(payload.review ?? {}),
    number: payload.pull_request?.number,
    repoFullName: payload.repository?.full_name,
    actor: payload.review?.user ?? payload.sender,
  });
}

async function handleIssueComment(payload: IssueCommentEvent): Promise<void> {
  const issueComment = normalizeGithubIssueCommentEvent(payload);
  if (issueComment) {
    await syncGithubIssueComment(issueComment);
    return;
  }
  if (!isPullRequestComment(payload)) return;
  const actor = payload.comment?.user ?? payload.sender;
  const number = payload.issue?.number;
  const repoFullName = payload.repository?.full_name;

  // Direct: posted, edited or deleted, thread has changed.
  await broadcastGithubPr(repoFullName, number, ["conversation"]);
  await recordGithubGesture({ type: "pr_commented", number, repoFullName, actor });

  // `@numo` written FROM github.com (MIN-162). Two guards before touching it:
  // · the App bot is Numo itself — letting it call itself would loop
  // the pass on its own synthesis;
  // · a comment posted from minddy comes back here by echo for a few seconds
  // later, and the road has already launched the pass. `isPrActionEcho` on
  // recognizes the event she has just written — the same guard as for
  // activity, on the same gesture.
  if (
    payload.action !== "created" ||
    number == null ||
    !repoFullName ||
    isBot(actor) ||
    !payload.comment?.body
  ) {
    return;
  }
  const pr = await findPullRequestByNumber({
    provider: "github",
    repoFullName,
    number,
  });
  if (!pr) return;
  const echo = await isPrActionEcho({
    issueIds: [pr.issue_id],
    type: "pr_commented",
    prNumber: number,
    provider: "github",
    accountId: actorAccountId(actor),
    login: actor?.login ?? null,
  });
  if (echo) return;

  await handleForgeNumoMention({
    provider: "github",
    repoFullName,
    prNumber: number,
    body: payload.comment.body,
    authorLogin: actor?.login ?? null,
  });
}

async function handleIssueDependency(payload: unknown): Promise<void> {
  const dependency = normalizeGithubIssueDependencyEvent(payload);
  if (dependency) await syncGithubIssueDependency(dependency);
}

async function handlePullRequestReviewComment(
  payload: PullRequestReviewCommentEvent,
): Promise<void> {
  // The direct starts on the THREE actions (created/edited/deleted): a note
  // modified or removed changes the diff as much as a comment made. The activity,
  // she only traces creation — modifying one's own message is not a
  // gesture to tell on the ticket.
  await broadcastGithubPr(
    payload.repository?.full_name,
    payload.pull_request?.number,
    ["reviewComments"],
  );
  if (payload.action !== "created") return;
  await recordGithubGesture({
    type: "pr_code_commented",
    number: payload.pull_request?.number,
    repoFullName: payload.repository?.full_name,
    actor: payload.comment?.user ?? payload.sender,
  });
}

/** Resolved or reopened thread on github.com (MIN-139) — direct ONLY:
    the resolution lives at the forge, minddy keeps nothing of it. */
interface PullRequestReviewThreadEvent {
  action?: string;
  pull_request?: { number?: number };
  repository?: { full_name?: string };
}

async function handlePullRequestReviewThread(
  payload: PullRequestReviewThreadEvent,
): Promise<void> {
  if (payload.action !== "resolved" && payload.action !== "unresolved") return;
  await broadcastGithubPr(
    payload.repository?.full_name,
    payload.pull_request?.number,
    ["reviewComments"],
  );
}

/**
 * CI completed — `check_suite` (GitHub Actions and company) or `status` (the API
 * history, which many integrations still use).
 *
 * Direct ONLY, like the comments threads: the state of the CI is not in base,
 * it is read at the forge at each GET of the detail (`prDetailResponse`). THE
 * `CHECKS_POLL_MS` of 15 s remains in place — these events are not guaranteed, and
 * he is the net.
 *
 * The anchor is the SHA and not the PR number: `status` carries none, and
 * `check_suite.pull_requests` omits PRs resulting from a fork. The fallback covers the
 * deux.
 */
interface CheckSuiteEvent {
  action?: string;
  check_suite?: {
    head_sha?: string;
    pull_requests?: Array<{ number?: number }>;
  };
  repository?: { full_name?: string };
}

interface StatusEvent {
  sha?: string;
  state?: string;
  repository?: { full_name?: string };
}

async function broadcastChecksChanged(
  repoFullName: string | undefined,
  headSha: string | undefined,
  numbers: number[],
): Promise<void> {
  if (!repoFullName) return;
  if (numbers.length > 0) {
    for (const number of numbers) {
      await broadcastGithubPr(repoFullName, number, ["pr"]);
    }
    return;
  }
  if (!headSha) return;
  const prs = await findPullRequestsByHeadSha({
    provider: "github",
    repoFullName,
    headSha,
  });
  for (const pr of prs) broadcastPrChanged(pr.id, ["pr"]);
}

async function handleCheckSuite(payload: CheckSuiteEvent): Promise<void> {
  // Only the end of a sequence changes what the banner displays: `requested` and
  // `rerequested` only announces a job whose state is already “in progress”.
  if (payload.action !== "completed") return;
  await broadcastChecksChanged(
    payload.repository?.full_name,
    payload.check_suite?.head_sha,
    (payload.check_suite?.pull_requests ?? [])
      .map((p) => p.number)
      .filter((n): n is number => n != null),
  );
}

async function handleStatus(payload: StatusEvent): Promise<void> {
  // `pending` is the start of a check, not its result — but it passes the
  // banner to “in progress”, which the reader should also see.
  await broadcastChecksChanged(payload.repository?.full_name, payload.sha, []);
}

/**
 * `issues` actions synchronized. The minddy ticket now REFLECTS the outcome
 * remote: title and body edits, labels and assignments
 * therefore count as much as opening and closing - that's exactly what
 * that v1 of MIN-97 dropped.
 *
 * The list remains CLOSED, it has not become “whatever happens”: GitHub
 * also sends `pinned`, `locked`, `transferred`, `deleted`, `milestoned`,
 * `typed`… none of which changes what minddy copies. Let them pass
 * would make a complete reconciliation — therefore several requests — for a
 * pinning.
 */
const SYNCED_ISSUE_ACTIONS = new Set([
  "opened",
  "closed",
  "reopened",
  "edited",
  "labeled",
  "unlabeled",
  "assigned",
  "unassigned",
  "milestoned",
  "demilestoned",
  "locked",
  "unlocked",
  "typed",
]);

async function handleIssues(payload: unknown): Promise<void> {
  const remote = normalizeGithubIssueEvent(payload);
  if (!remote || !SYNCED_ISSUE_ACTIONS.has(remote.action)) return;
  await syncRemoteIssueEvent(remote);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Two accepted secrets (docs/managed-forge-relay-plan.md): a DIRECT GitHub
  // delivery verifies against GITHUB_WEBHOOK_SECRET exactly as always; a
  // RELAYED delivery (fan-out from the managed forge relay, marked by
  // X-Minddy-Relay) verifies against the instance-generated relay webhook
  // secret — explicit env first, then the automatically provisioned one.
  // Relay mode reads only relay material — never local app ones.
  const relayed = request.headers.get("x-minddy-relay") === "1";
  let secret: string | null | undefined = relayed
    ? process.env.MINDDY_FORGE_RELAY_WEBHOOK_SECRET
    : process.env.GITHUB_WEBHOOK_SECRET;
  if (relayed && !secret) {
    // After a restart the provisioned secret is not in memory yet: one
    // database read (never a registration — this path is unauthenticated).
    await loadProvisionedRelayConfig();
    secret = getProvisionedWebhookSecret();
  }

  // Full FAIL-CLOSED (MIN-118), aligned to GitLab receiver: without
  // secret deployed, NO events are processed — even those that only
  // reflect a state already decided on GitHub side. A forged `pr_state` triggers
  // still writes (sync of issue status, notifications); THE
  // historical partial fail-open left this door open. 503 rather than
  // 200: GitHub will re-deliver once the secret is deployed.
  if (!secret) {
    console.error(
      relayed
        ? "[webhooks/github] MINDDY_FORGE_RELAY_WEBHOOK_SECRET is not set — relayed event refused"
        : "[webhooks/github] GITHUB_WEBHOOK_SECRET is not set — event refused",
    );
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  }

  const ok = verifyGithubSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    secret,
  );
  if (!ok) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // MANAGED FORGE RELAY (Cloud side): a delivery for an installation claimed
  // by a relayed instance is fanned out to that instance and NOT processed
  // here — the installation belongs to the instance, no local row would ever
  // match. Unclaimed installations (Cloud's own) fall through to the local
  // handlers unchanged.
  //
  // This runs BEFORE the dedup insert on purpose: a failed enqueue must
  // answer 5xx while the delivery is still unmarked, so GitHub re-delivers
  // and nothing is lost. After a dedup mark, a 200 would drop the event and
  // even a manual re-delivery would be absorbed as a replay. Duplicate
  // enqueues of the same GUID are absorbed by the queue's unique constraint.
  if (isManagedForgeEnabled()) {
    try {
      const relayedInstance = await enqueueRelayDeliveryForPayload({
        provider: "github",
        event: request.headers.get("x-github-event"),
        deliveryGuid: request.headers.get("x-github-delivery"),
        rawBody,
      });
      if (relayedInstance) {
        return NextResponse.json({ ok: true, relayed: true });
      }
    } catch (err) {
      console.error(
        "[webhooks/github] relay fan-out enqueue failed:",
        (err as Error).message,
      );
      return NextResponse.json(
        { error: "relay fan-out unavailable" },
        { status: 503 },
      );
    }
  }

  // Replay: the same delivery, already processed (MIN-333). After verification —
  // marking a delivery without a valid signature would mean being able to
  // silence the real event which carries it.
  if (
    await isReplayedForgeDelivery("github", request.headers.get("x-github-delivery"))
  ) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const event = request.headers.get("x-github-event");
  try {
    if (event === "pull_request") {
      await handlePullRequest(JSON.parse(rawBody) as PullRequestEvent);
    } else if (event === "pull_request_review") {
      await handlePullRequestReview(JSON.parse(rawBody) as PullRequestReviewEvent);
    } else if (event === "pull_request_review_comment") {
      await handlePullRequestReviewComment(
        JSON.parse(rawBody) as PullRequestReviewCommentEvent,
      );
    } else if (event === "pull_request_review_thread") {
      await handlePullRequestReviewThread(
        JSON.parse(rawBody) as PullRequestReviewThreadEvent,
      );
    } else if (event === "issue_comment") {
      await handleIssueComment(JSON.parse(rawBody) as IssueCommentEvent);
    } else if (event === "issue_dependencies") {
      await handleIssueDependency(JSON.parse(rawBody));
    } else if (event === "check_suite") {
      await handleCheckSuite(JSON.parse(rawBody) as CheckSuiteEvent);
    } else if (event === "status") {
      await handleStatus(JSON.parse(rawBody) as StatusEvent);
    } else if (event === "issues") {
      await handleIssues(JSON.parse(rawBody));
    }
  } catch (err) {
    // Best effort: we still pay so that GitHub does not re-deliver.
    console.error(`[webhooks/github] ${event} handling failed:`, (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
