// PURE normalization of GitHub/GitLab issue events (without DB, without import
// server-only): testable in node/vitest, like plan-sync-core.ts. The part that
// written in base lives in issue-sync.ts, the one who writes at the forge in
// issue-push.ts.
//
// The two forges speak different vocabularies (`closed`/`close`,
// `number`/`iid`, `{name}`/`{title}`) — everything is reduced here to a neutral form
// `RemoteIssue` that the rest of the code consumes without knowing where the event comes from.
//
// The meaning of sync has CHANGED since MIN-97, which was strictly
// descending (“the repository pushes its issues into minddy, never the other way around”):
// • descending, the ticket is the REFLECTION of the outcome — title, body, labels,
// assigned and state follow it (`statusForRemoteReconcile`);
// • amount, a single field goes up, open/closed state
// (`remoteStateForStatus`), because whoever completes the work can
// very well say it from minddy.
// These are the only two status functions, and they read together:
// one is the reciprocal of the other, this is what closes the echo loop.

import type { IssueStatusValue } from "@/lib/issue-validation";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Arrival status of an imported issue. `triage` and not `backlog`: it's the
 * except that minddy already reserves for everything that comes from outside (API Feedback),
 * the /triage page exists for that, and it avoids triggering Smart Assign — therefore
 * of the AI expenditure — on each outcome of the repository.
 */
export const REMOTE_LANDING_STATUS: IssueStatusValue = "triage";

/** Standardized remote action → minddy status (null = nothing to change). */
export function statusForRemoteAction(action: string): IssueStatusValue | null {
  switch (action) {
    // GitHub `closed` / GitLab `close`.
    case "closed":
    case "close":
      return "done";
    // Reopening → `backlog`, never `triage`: the ticket has already been seen.
    case "reopened":
    case "reopen":
      return "backlog";
    default:
      return null;
  }
}

/**
 * The status that an ALREADY imported ticket should take, or `null` if it is not moving
 *. This is the function called by reconciliation, and it reasons about
 * the STATE carried by the payload rather than on the action — a `edited`, a
 * `labeled` or a `assigned` says nothing about a transition, but carries
 * all the same `state`, which in passing catches a closure whose webhook
 * was lost.
 *
 * **It compares states, not statuses**, and that's the whole point: minddy
 * has eight statuses, the forge has two. Three of the eight are “closed”. Translating
 * `closed` into `done` without looking at where the ticket is would switch to
 * "finished" a ticket deliberately set to "canceled" — each time the remote issue is edited, and without anyone understanding why. As long as both sides agree on open/closed, nothing is touched.
 */
export function statusForRemoteReconcile(
  remote: RemoteIssue,
  current: IssueStatusValue,
): IssueStatusValue | null {
  // No state in the load: we fall back on the transition, when there is one
  // a. It is subject to the same rule of agreement (a closure which finds a
  // ticket already closed does not reclassify it).
  const remoteOpen =
    remote.state != null
      ? remote.state === "open"
      : statusForRemoteAction(remote.action) === "backlog"
        ? true
        : statusForRemoteAction(remote.action) === "done"
          ? false
          : null;
  if (remoteOpen === null) return null;
  if (remoteStateForStatus(current).open === remoteOpen) return null;
  // Reopened → `backlog`, never `triage`: the ticket has already been seen. A way out
  // open that we have never imported goes through REMOTE_LANDING_STATUS.
  return remoteOpen ? "backlog" : "done";
}

/** The state of a remote issue, seen from minddy — the rising half of the
 * sync (`issue-push.ts`). */
export interface RemoteState {
  open: boolean;
  /** Closed “no action” rather than “done”. GitHub displays it
 * differently (`state_reason`); GitLab doesn't have the nuance. */
  notPlanned: boolean;
}

/**
 * minddy status → remote issue status. TOTAL table: each of the eight
 * statuses says something, and the completeness is checked at compilation —
 * a ninth status will not be able to slip in here by being worth `undefined`, therefore
 * by silently reopening issues.
 *
 * The three closed statuses of minddy close, but not in the same way:
 * `done` is work done, `canceled` and `duplicate` work that will not happen — which GitHub knows to say, and displays otherwise.
 */
const REMOTE_STATE_BY_STATUS: Record<IssueStatusValue, RemoteState> = {
  triage: { open: true, notPlanned: false },
  backlog: { open: true, notPlanned: false },
  todo: { open: true, notPlanned: false },
  in_progress: { open: true, notPlanned: false },
  in_review: { open: true, notPlanned: false },
  done: { open: false, notPlanned: false },
  canceled: { open: false, notPlanned: true },
  duplicate: { open: false, notPlanned: true },
};

export const remoteStateForStatus = (status: IssueStatusValue): RemoteState =>
  REMOTE_STATE_BY_STATUS[status];

/** Neutral form of a remote issue event, regardless of the provider. */
export interface RemoteIssue {
  provider: RepoProviderId;
  /** "owner/repo" (GitHub) or "group/sub/project" (GitLab) — fan-out key. */
  repoFullName: string;
  /** Numeric ID of the repository, as stored in `external_repo_id`. */
  repoId: string;
  /** `number` GitHub / `iid` GitLab — the number visible in the URL. */
  number: number;
  title: string;
  body: string | null;
  url: string | null;
  /** Action brute du provider (`opened`, `close`…), lue par statusForRemoteAction. */
  action: string;
  actorLogin: string | null;
  /** Current state carried by the payload, independent of the action. `null` when
 * the provider did not give it — we are not inventing it. */
  state: "open" | "closed" | null;
  /** Names of the issue labels, as the forge writes them. */
  labels: string[];
  /** Logins of the assigned, in the order of the forge (both accept
 * several, minddy only one — cf. `matchForgeAssignee`). */
  assigneeLogins: string[];
}

/**
 * A forge label is an object — but the two don't name it the same:
 * GitHub writes `{name}`, GitLab `{title}`. A load can also give it as
 * bare string (the GitLab REST API does this on some endpoints).
 */
function readLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      if (entry.trim()) names.push(entry.trim());
      continue;
    }
    const row = entry as Record<string, unknown> | null;
    const name = typeof row?.name === "string" ? row.name : row?.title;
    if (typeof name === "string" && name.trim()) names.push(name.trim());
  }
  return names;
}

/** The logins of a list of assignees (`{login}` GitHub, `{username}` GitLab). */
function readLogins(raw: unknown, key: "login" | "username"): string[] {
  if (!Array.isArray(raw)) return [];
  const logins: string[] = [];
  for (const entry of raw) {
    const login = (entry as Record<string, unknown> | null)?.[key];
    if (typeof login === "string" && login.trim()) logins.push(login.trim());
  }
  return logins;
}

interface GithubIssuesEvent {
  action?: string;
  issue?: {
    number?: number;
    title?: string;
    body?: string | null;
    html_url?: string | null;
    state?: string;
    labels?: unknown;
    assignees?: unknown;
    assignee?: unknown;
    /** Present = this is a pull request disguised as an issue → to be ignored. */
    pull_request?: unknown;
  };
  repository?: { id?: number; full_name?: string };
  sender?: { login?: string };
}

/**
 * Payload `issues` of the GitHub App → neutral form, or null if unusable.
 * The GitHub issues API counts pull requests among the issues: an entry
 * carrying `pull_request` is discarded (it is already processed by the handler PR).
 */
export function normalizeGithubIssueEvent(payload: unknown): RemoteIssue | null {
  const event = (payload ?? {}) as GithubIssuesEvent;
  const issue = event.issue;
  if (!issue || issue.pull_request) return null;
  const number = issue.number;
  const repoFullName = event.repository?.full_name;
  const repoId = event.repository?.id;
  if (typeof number !== "number" || !repoFullName || repoId == null) return null;
  // `assignees` is the modern list, `assignee` the historical field that GitHub
  // continues to serve: the second is only the first of the first, so we
  // only uses it in default, never counting the same person twice.
  const assignees = readLogins(issue.assignees, "login");
  const legacy = readLogins([issue.assignee], "login");
  return {
    provider: "github",
    repoFullName,
    repoId: String(repoId),
    number,
    title: issue.title ?? "",
    body: issue.body ?? null,
    url: issue.html_url ?? null,
    action: event.action ?? "",
    actorLogin: event.sender?.login ?? null,
    state: issue.state === "open" || issue.state === "closed" ? issue.state : null,
    labels: readLabels(issue.labels),
    assigneeLogins: assignees.length > 0 ? assignees : legacy,
  };
}

interface GitlabIssueEvent {
  object_kind?: string;
  user?: { username?: string };
  project?: { id?: number; path_with_namespace?: string };
  object_attributes?: {
    iid?: number;
    title?: string;
    description?: string | null;
    url?: string | null;
    action?: string;
    state?: string;
    labels?: unknown;
  };
  /** GitLab carries labels and assigned to the ROOT of the hook, not in
 * `object_attributes` (which only copies the labels on certain versions). */
  labels?: unknown;
  assignees?: unknown;
}

/**
 * Payload `Issue Hook` from GitLab → neutral form, or null if unusable.
 * CONFIDENTIAL issues arrive with `object_kind: "confidential_issue"`
 * — we do not import them: their content is restricted on GitLab side, copy it
 * in a minddy project would make it visible to the whole team.
 */
export function normalizeGitlabIssueEvent(payload: unknown): RemoteIssue | null {
  const event = (payload ?? {}) as GitlabIssueEvent;
  if (event.object_kind !== "issue") return null;
  const attrs = event.object_attributes;
  const iid = attrs?.iid;
  const repoFullName = event.project?.path_with_namespace;
  const repoId = event.project?.id;
  if (typeof iid !== "number" || !repoFullName || repoId == null) return null;
  // GitLab says “opened”, GitHub “open”: the neutral form decides for the
  // second, otherwise `statusForRemoteReconcile` would have two vocabularies to know.
  const rawState = attrs?.state;
  const state =
    rawState === "closed" ? "closed" : rawState === "opened" ? "open" : null;
  // The root labels are authentic: `object_attributes.labels` is not
  // served by all versions, and when it is, it says the same thing.
  const labels = readLabels(event.labels);
  return {
    provider: "gitlab",
    repoFullName,
    repoId: String(repoId),
    number: iid,
    title: attrs?.title ?? "",
    body: attrs?.description ?? null,
    url: attrs?.url ?? null,
    action: attrs?.action ?? "",
    actorLogin: event.user?.username ?? null,
    state,
    labels: labels.length > 0 ? labels : readLabels(attrs?.labels),
    assigneeLogins: readLogins(event.assignees, "username"),
  };
}
