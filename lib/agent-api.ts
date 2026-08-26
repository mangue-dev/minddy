"use client";

import type { RepoProviderId } from "@/lib/repo-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { ReviewThreadState } from "@/lib/pr-review-threads";
import type {
  PrReviewRunSummary,
  PrReviewSession,
} from "@/lib/pr-review-session";
import type { PrTimelineEvent } from "@/lib/pr-timeline";
import type { CommitAuthor } from "@/lib/commit-authors";
import type {
  ReviewCommentReaction,
  ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import { trackEvent } from "./analytics";
import { lengthBucket } from "./analytics-sanitize";
import type { AssistantMention } from "./assistant-types";
import type { ResourceInput } from "./types";

/**
 * Code agent client fetchers (MIN-46): launch a run on an issue and
 * list your runs. (The live + events + stop details of a run arrive in Phase 7.)
 */

/**
 * API error which keeps the `code` business of the route (e.g. `lineNotInDiff`) in
 * more of the message: some callers must distinguish the case, not only
 * display it. One `Error` remains — callers who only read `.message` are
 * unchanged.
 */
export class ApiError extends Error {
  code?: string;
  /**
   * Structured detail that the raw message does not carry — today the
   * `modelLimit` of a refusal `modelAbovePlan` (model, multiplier, ceiling,
   * plan), which the screen needs to tell which one and how far.
   */
  details?: Record<string, unknown>;
  constructor(
    message: string,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const payload = data as {
      error?: string;
      code?: string;
      modelLimit?: Record<string, unknown>;
    } | null;
    const message = payload?.error || text.trim() || "Request failed";
    throw new ApiError(message, payload?.code, payload?.modelLimit);
  }
  return data as T;
}

export type AgentRunStatus =
  "queued" | "running" | "completed" | "failed" | "canceled";

export interface AgentRunSummary {
  id: string;
  status: AgentRunStatus;
  model: string | null;
  model_forced: boolean;
  /** Level of reasoning FROZEN at launch (MIN-122): the selector of a run
   * current displays it as read-only, such as model and branch. */
  reasoning_level: ReasoningLevel;
  key_mode: "platform" | "byok";
  triggered_by: "button" | "chat" | "mention";
  /** Prompt launch (“original” conversation bubble). */
  prompt: string | null;
  prompt_mentions?: AssistantMention[] | null;
  /** Non-zero = REREAD session (MIN-168): read only on the repository, therefore
   * neither branch nor pull request to open from the conversation. */
  pull_request_id: string | null;
  /** Branch COPIED at launch (chosen in composition, otherwise the repository default).
      Null until the first chunk stamps it on a run without inheritance. */
  base_branch: string | null;
  /** Working branch of the lineage (inheritance of cold runs is indexed to it). */
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  continuations: number;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  /**
   * PRECISE moment of the last end of agent (transition to `completed`), stamped
   * by DB trigger — insensitive to PR heartbeats / webhooks. `null` as long as the run
   * never finished. Controls the blue “read/unread” bubble (compared to the last
   * `last_read_at` of the session).
   */
  completed_at: string | null;
  /** The last round ended on an ask_user: the run WAITS for the response from
   * the user → YELLOW point (same reading rules as unread). */
  awaiting_input: boolean;
  /**
   * The conversation turns to the user's MACHINE (MIN-359), not
   * in a microVM. FROZEN at launch, such as the model, reasoning and
   * branch: the composer chip is locked on it and the wire says so.
   *
   * Optional because runs before MIN-355 do not carry one and because
   * light lists (Agents page) do not select it — absent is
   * “in the cloud”, which is what all the runs have been so far.
   */
  local_exec?: boolean;
  /** Local mode uses an isolated Git checkout for this conversation. */
  local_worktree?: boolean;
}

/**
 * Statuses of a WORKING run (queued/running). The possible ticket is not
 * than a context: several conversations can work in parallel on
 * des branches distinctes.
 */
export const ACTIVE_AGENT_STATUSES: AgentRunStatus[] = ["queued", "running"];

export function isAgentRunActive(status: AgentRunStatus): boolean {
  return ACTIVE_AGENT_STATUSES.includes(status);
}

/**
 * Is the agent WORKING? Controls the animated halo of the cards, the
 * polling of events, and the display of the “Interrupt” button in the conversation.
 * (Same as `isAgentRunActive` since the end of `needs_input` — kept for
 * the readability of call-sites: “works” vs “occupies the ticket”.)
 */
export function isAgentRunWorking(status: AgentRunStatus): boolean {
  return status === "queued" || status === "running";
}

/**
 * Can this specific run be resumed HOT (message in HIS conversation)? Yes
 * even when resting: your checkpoint and sandbox are preserved, you continue a round
 * moreover in the same context — it is the NORMAL gesture of a conversation. Alone
 * a boot error (`failed`: no repository/model) does not require recovery.
 * Reminder: only the LAST run of the outcome can be repeated (the runs share the
 * branch) — the server refuses the others (`supersededRun`).
 */
export function isAgentRunResumable(status: AgentRunStatus): boolean {
  return status !== "failed";
}

/**
 * The pull request for a ticket, as the cards and sign read it.
 *
 * It was read on Numo's runs — which made it invisible as soon as
 * no one had launched an agent (human PR, or PR attached to the hand), and as soon
 * that it was CLOSED. It now comes from `pull_requests`, all states
 * confused: “See the pull request” should lead to a closed PR as well as to a
 * other. The chip is silent on `closed` — this is the only state that does not call
 * plus rien.
 */
export interface IssuePr {
  /** Id minddy — `?pr=` opens the PR whatever its state (the page pins it). */
  prId: string;
  prNumber: number;
  state: "draft" | "open" | "merged" | "closed";
}

/** A PR still alive or delivered: everything but refused. */
export function isPrWorthShowing(pr: IssuePr | null): boolean {
  return !!pr && pr.state !== "closed";
}

export async function fetchIssueAgentRunsApi(
  issueId: string,
): Promise<{ runs: AgentRunSummary[]; pullRequest: IssuePr | null }> {
  return parseJson(await fetch(`/api/issues/${issueId}/agent`));
}

/** Status of the automation chain of a ticket (MIN-147), customer view.
    NEVER USD: `estimate.shareOfMonthlyBudget` is a part of the monthly budget
    of the plan. A channel no longer has its own cap — it does not interrupt on
    the expenditure, only the account quota limits (see lib/automations). */
export interface IssueChainState {
  id: string;
  status:
    | "pending"
    | "running"
    | "awaiting_human"
    | "stopped"
    | "completed"
    | "failed";
  preset: string | null;
  step: number;
  retries: number;
  stopReason: string | null;
  /** RESPONSE channel: the start time, for the countdown. */
  notBefore: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueAutomationState {
  enabled: boolean;
  chain: IssueChainState | null;
  /** The steps that the rules would play on this ticket, in order. */
  plannedModes: ("plan" | "implement" | "verify" | "custom")[];
  estimate: { shareOfMonthlyBudget: number; fromHistory: boolean } | null;
}

export async function fetchIssueAutomationApi(
  issueId: string,
): Promise<IssueAutomationState> {
  return parseJson(await fetch(`/api/issues/${issueId}/automation`));
}

/**
 * “I'll take this ticket in hand” — cancels the chain that was waiting for him IN REPRISED.
 *
 * To draw on manual gestures that do NOT move the ticket: copy the
 * prompt for plan, verification or a free instruction. The prompt
 * of IMPLEMENTATION, he already advances the ticket to “in progress” and cancels the
 * reprieved by this fact alone; LAUNCHS are covered on the server side.
 *
 * Silent from start to finish: no waiting, no errors reported. Copy one
 * prompt must remain instantaneous, and the failure of this signal is not worth a toast.
 */
export function handOffIssueApi(issueId: string): void {
  void fetch(`/api/issues/${issueId}/automation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "handoff" }),
  }).catch(() => {});
}

export async function postIssueAutomationApi(
  issueId: string,
  action: "resume" | "start" | "stop",
): Promise<{ ok: true; chain: IssueChainState | null }> {
  return parseJson(
    await fetch(`/api/issues/${issueId}/automation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }),
  );
}

export async function launchAgentRunApi(
  issueId: string,
  body: {
    prompt?: string;
    model?: string;
    baseBranch?: string;
    /** Level of reasoning chosen at launch (MIN-122). Absent = personal default. */
    reasoningLevel?: ReasoningLevel;
    /** `plan` (supervise), `verify` (check the work done) and `custom`
     * (free instructions from the user) leave the exit where it is: alone
     * `implement` the “in progress” pass on the server side. */
    intent?: "implement" | "plan" | "verify" | "custom";
    mentions?: AssistantMention[];
    attachments?: ResourceInput[];
    /** The conversation starts on the MACHINE (MIN-359): chosen first
     * message, then frozen. The server revalidates (`localExecRequested`). */
    localExec?: boolean;
    /** Creates an isolated worktree on the local machine. */
    localWorktree?: boolean;
    /** The signed-in user accepted the untrusted issue context for this local run. */
    localIssueContextConfirmed?: boolean;
  },
): Promise<{ run: AgentRunSummary }> {
  // The prompt is NEVER sent — only its presence and length.
  trackEvent("agent_launched", {
    model: body.model ?? "default",
    reasoning_level: body.reasoningLevel ?? "default",
    has_branch: !!body.baseBranch,
    provider: "unknown",
    scope: "issue_context",
    has_prompt: !!body.prompt,
    prompt_length_bucket: lengthBucket(body.prompt),
    // Where the tour leaves (MIN-359). The path NEVER leaves the post: it is
    // a Boolean, like the rest of what we measure here.
    local_exec: !!body.localExec,
  });
  return parseJson(
    await fetch(`/api/issues/${issueId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Branches from the repository linked to the issue project (basic branch picker in phase
 * compound). `defaultBranch` at the top of the list.
 */
export async function fetchIssueRepoBranchesApi(
  issueId: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  return parseJson(await fetch(`/api/issues/${issueId}/agent/branches`));
}

// ── Runs WITHOUT TICKET (MIN-84): free subject, anchored to a project ───────────────

/**
 * Launch a run WITHOUT TICKET: anchored to a project (the repository to be cloned) + a text
 * free as instruction. Each launch is a self-contained conversation.
 *
 * Called “notebook” everywhere on the server side: the notebook was the first
 * point of entry (MIN-84). Today they come from almost everywhere — the
 * blank conversation from the Agents page, the integration wizards — and the subject
 * is free: only the project is obligatory.
 */
export async function launchNotebookAgentApi(body: {
  projectId: string;
  prompt: string;
  mentions?: AssistantMention[];
  attachments?: ResourceInput[];
  model?: string;
  /** Level of reasoning chosen at launch (MIN-122). Absent = personal default. */
  reasoningLevel?: ReasoningLevel;
  baseBranch?: string;
  /** The conversation starts on the MACHINE (MIN-359): chosen first
   * message, then frozen. The server revalidates (`localExecRequested`). */
  localExec?: boolean;
  /** Creates an isolated worktree on the local machine. */
  localWorktree?: boolean;
}): Promise<{ run: AgentRunSummary }> {
  trackEvent("agent_launched", {
    model: body.model ?? "default",
    reasoning_level: body.reasoningLevel ?? "default",
    has_branch: !!body.baseBranch,
    provider: "unknown",
    scope: "general",
    has_prompt: !!body.prompt,
    prompt_length_bucket: lengthBucket(body.prompt),
    local_exec: !!body.localExec,
  });
  return parseJson(
    await fetch(`/api/agent-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Current domain name; the old export remains available for compatibility. */
export const launchGeneralAgentApi = launchNotebookAgentApi;

/** Branches of the repository linked to a PROJECT (composed of a run notebook). */
export async function fetchProjectRepoBranchesApi(
  projectId: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  return parseJson(await fetch(`/api/projects/${projectId}/agent/branches`));
}

/** Detail (client-safe) of a run — the conversation of a notebook session. */
export async function fetchAgentRunApi(
  runId: string,
): Promise<{ run: AgentRunSummary }> {
  return parseJson(await fetch(`/api/agent-runs/${runId}`));
}

/**
 * RENAME a conversation. Written `agent_runs.title`, that is to say the first
 * operation of the display cascade (`lib/agent-session-title.ts`): the name changes
 * everywhere at once. An empty title DELETES its own — the conversation then falls away
 * on the title of his ticket, and it's the way back from a renaming
 * malheureux.
 */
export async function renameAgentRunApi(
  runId: string,
  title: string,
): Promise<{ run: AgentRunSummary }> {
  return parseJson(
    await fetch(`/api/agent-runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
}

/** Pin or unpin the conversation for the current user. */
export async function setAgentConversationPinnedApi(
  runId: string,
  pinned: boolean,
): Promise<void> {
  await parseJson(
    await fetch(`/api/agent-runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    }),
  );
}

/**
 * DELETE a conversation, regardless of its status. The server first cuts the
 * microVM and revokes the run key: otherwise, a conversation deleted in full
 * work would continue to run and cost, without anything left to say
 * laquelle.
 */
export async function deleteAgentRunApi(runId: string): Promise<{ ok: true }> {
  return parseJson(
    await fetch(`/api/agent-runs/${runId}`, { method: "DELETE" }),
  );
}

// ── Run detail / events / stop / PR ───────────────────── ─────────────────────

export type AgentEventType =
  | "status"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "commit"
  | "pr_opened"
  | "error"
  | "summary"
  | "user_message"
  | "plan_update"
  | "files_changed"
  | "question"
  /** Monthly usage budget exhausted during the run: the wire returns the card which says
   * where the budget is and what we can do (make plans, wait, BYOK). */
  | "quota_exhausted";

export interface AgentRunEvent {
  id: string;
  seq: number;
  type: AgentEventType;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Nature d'un changement de fichier d'un tour (git name-status → 4 cas affichables). */
export type AgentFileChangeStatus =
  "added" | "modified" | "deleted" | "renamed";

/**
 * A file changed during an agent turn (MIN-46, note “diff per turn”).
 * Emitted in the `files_changed` event at the end of the round, calculated on the server side by a
 * `git diff --numstat --name-status <previousSha> <currentSha>` in the sandbox (source
 * of truth — tool-calls are not enough: `apply_edits` and `run_command`
 * change files outside of their payload). `previousPath` is only present
 * for a rename (BEFORE path — the one that addresses the base version).
 */
export interface AgentFileChange {
  path: string;
  status: AgentFileChangeStatus;
  additions: number;
  deletions: number;
  previousPath?: string;
}

/** Result parsed with an event `files_changed`. `truncated`: the list has been limited (big turn). */
export interface AgentFilesChangedPayload {
  files: AgentFileChange[];
  truncated: boolean;
}

/** Reads the payload of an event `files_changed` while tolerating partial forms. */
export function parseFilesChangedPayload(
  payload: Record<string, unknown> | null,
): AgentFilesChangedPayload {
  const rawFiles = Array.isArray(payload?.files)
    ? (payload!.files as unknown[])
    : [];
  const files: AgentFileChange[] = [];
  for (const raw of rawFiles) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const path = typeof r.path === "string" ? r.path : "";
    if (!path) continue;
    const status =
      r.status === "added" || r.status === "deleted" || r.status === "renamed"
        ? r.status
        : "modified";
    files.push({
      path,
      status,
      additions: typeof r.additions === "number" ? r.additions : 0,
      deletions: typeof r.deletions === "number" ? r.deletions : 0,
      ...(typeof r.previousPath === "string"
        ? { previousPath: r.previousPath }
        : {}),
    });
  }
  return { files, truncated: payload?.truncated === true };
}

export async function fetchAgentRunEventsApi(
  runId: string,
  after?: number,
): Promise<{ events: AgentRunEvent[] }> {
  const q = after != null ? `?after=${after}` : "";
  return parseJson(await fetch(`/api/agent-runs/${runId}/events${q}`));
}

/**
 * “Interrupt the current response”: asks the running chunk to suspend
 * cleanly the current LLM call and return to rest. DO NOT cancel the session,
 * does NOT clear the context, does NOT stop the sandbox — everything remains resumable.
 * (The endpoint remains /stop on the server side.)
 */
export async function interruptAgentRunApi(runId: string): Promise<void> {
  trackEvent("agent_stopped", {});
  await parseJson(
    await fetch(`/api/agent-runs/${runId}/stop`, { method: "POST" }),
  );
}

/**
 * Heartbeat: refreshes the run's inactivity clock as long as the conversation
 * is open, so that the sandbox is not cut off while the user
 * reads or writes. Best-effort (ignores network errors).
 */
export async function heartbeatAgentRunApi(runId: string): Promise<void> {
  try {
    await fetch(`/api/agent-runs/${runId}/heartbeat`, { method: "POST" });
  } catch {
    // best effort: the next heartbeat will catch up.
  }
}

/**
 * Message to a session (MIN-46): directs the agent directly if it is working, or
 * continues the conversation (new turn) if the session is at rest.
 */
export async function steerAgentRunApi(
  runId: string,
  message: string,
  mentions: AssistantMention[] = [],
  attachments: ResourceInput[] = [],
  messageId = crypto.randomUUID(),
): Promise<{ ok: true; status: AgentRunStatus; messageId: string }> {
  trackEvent("agent_steered", { length_bucket: lengthBucket(message) });
  return parseJson(
    await fetch(`/api/agent-runs/${runId}/steer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        messageId,
        ...(mentions.length ? { mentions } : {}),
        ...(attachments.length ? { attachments } : {}),
      }),
    }),
  );
}

export interface PullRequestRef {
  number: number;
  url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  title?: string;
  body?: string | null;
  head?: string;
  base?: string;
  /** Head SHA — the EXACT diff served. Compared to the SHA that was reread by the last
   * Numo review to see if relaunch would have anything new to read. */
  headSha?: string;
  /** How many commits the PR carries, according to the forge. GitHub itself counts it;
      GitLab does not serve it and leaves the field absent (the caller then falls back to
      the length of the commit list, as long as it is not truncated). */
  commitCount?: number;
  /** Author and opening date: `body` opens the conversation thread as a comment. */
  user?: { login: string; avatar_url: string | null } | null;
  createdAt?: string;
  /** `null`/absent = UNKNOWN fusionability (forges calculate it using
      asynchronous), never display as “blocked” — MIN-138. */
  mergeable?: boolean | null;
  /** `clean` · `blocked` (repository requires approvals/checks) · `dirty` (conflict)
      · `unstable` (checks not required in failure) · `unknown`. */
  mergeableState?: string | null;
}

/** Normalized status of a CI check (MIN-138) — mirror of `lib/server/agent/checks-core.ts`. */
export type CheckState = "pending" | "success" | "failure" | "neutral";

export interface PullRequestCheck {
  name: string;
  state: CheckState;
  url: string | null;
  /** The integration that produced the check (“GitHub Actions”, “Vercel”…),
      when the check name does not already have it. */
  appName: string | null;
  /** Its logo at the forge. `null` → the UI falls back to the forge icon. */
  appAvatarUrl: string | null;
  /** The result in one line, as the forge formulates it. */
  description: string | null;
  durationMs: number | null;
}

export interface ChecksSummary {
  checks: PullRequestCheck[];
  /** Aggregate: failure wins, then “in progress”. `null` = no check. */
  state: CheckState | null;
  /** Non-blocking checks (successful or neutral) — the `n` of “n/m passed”. */
  passing: number;
  total: number;
}

/** Merge methods offered by the forge of the linked repository. */
export type MergeMethod = "merge" | "squash" | "rebase";

export interface PullRequestReviewSummary {
  approvals: number;
  changesRequested: number;
}

/**
 * Response from the GET of the PR of a run. Two nuances of “no checks”:
 * `checks: null` = on n'a pas pu lire (`checksError` dit pourquoi — `forbidden`
 * = GitHub permission that the installation did not accept), `checks.total === 0`
 * = the repository has no CI. Same thing for `reviews: null`.
 */
/**
 * What the current user can do on this PR (MIN-144). On GitHub
 * like on GitLab, a human gesture starts from HIS Git account: without account
 * connected, or without rights to the deposit, minddy says it instead of offering a button
 * who would lie about the author.
 */
export interface PrViewer {
  provider: RepoProviderId;
  /** Does the provider have the means to authorize an account (self-host without env)? */
  configured: boolean;
  connected: boolean;
  /** An account is connected but the forge REFUSES its token: to be reauthorized.
      Absent on a tab that remained open since a version before this field. */
  expired?: boolean;
  login: string | null;
  /** `write` = merge/resolve, `read` = reviewer/comment, `none` = nothing. */
  capability: "write" | "read" | "none";
  /** The account under which Numo writes at the forge – enough to recognize SES
      messages in the thread (MIN-162). `null` on the GitLab side, where nothing
      distinguishes (MIN-146), and on a tab that has remained open since a version
      before this field. */
  numoLogin?: string | null;
}

export interface AgentRunPrResponse {
  pr: PullRequestRef | null;
  files: PullRequestFile[];
  provider?: RepoProviderId;
  checks?: ChecksSummary | null;
  checksError?: "forbidden" | "unknown" | null;
  reviews?: PullRequestReviewSummary | null;
  viewer?: PrViewer;
  mergeMethods?: MergeMethod[];
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  /** Path BEFORE the PR if the file has been renamed — it addresses the base version. */
  previous_filename?: string;
}

export async function fetchPullRequestApi(
  prId: string,
): Promise<AgentRunPrResponse> {
  return parseJson(await fetch(`/api/pull-requests/${prId}`));
}

/**
 * Diff ALIVE of a run — the diff view IN the conversation, without waiting for the PR.
 * Two sources depending on what the run does: during the round, `git diff` read in the
 * microVM (including work not yet pushed); at rest, RA when it
 * exists, otherwise compares base...branch.
 *
 * `live` says the response comes from the sandbox: this diff contains work
 * which is not yet on the forge, and it is said on the screen.
 * `url`: the PR or the comparison page of the provider (“see on…” links).
 *
 * `stat` requests the same files WITHOUT their patches — enough to display two
 * numbers in the header without passing the entire diff every
 * quelques secondes.
 */
export async function fetchAgentRunDiffApi(
  runId: string,
  opts?: { stat?: boolean },
): Promise<{
  files: PullRequestFile[];
  truncated?: boolean;
  provider?: RepoProviderId;
  url: string | null;
  live?: boolean;
}> {
  const query = opts?.stat ? "?stat=1" : "";
  return parseJson(await fetch(`/api/agent-runs/${runId}/diff${query}`));
}

/**
 * Basis of routes for a pull request (MIN-143). Two families serve the same
 * gestures: the one indexed by the PR — the Pull Requests page, which also shows the
 * Human PR — and the facade indexed by the run, that the view diff from the
 * agent conversation is the only one to use (it only has one run to give, its
 * session sometimes having no PR).
 */
export type PrEndpoint = string;

export function prEndpoint(prId: string): PrEndpoint {
  return `/api/pull-requests/${prId}`;
}

export function runPrEndpoint(runId: string): PrEndpoint {
  return `/api/agent-runs/${runId}/pr`;
}

/**
 * Base version of a PR file (plain text at merge base) — the source of the
 * context unfolding in diff view. `path` = base side path.
 */
export async function fetchPrFileSourceApi(
  endpoint: PrEndpoint,
  path: string,
): Promise<{ content: string }> {
  return parseJson(
    await fetch(`${endpoint}/file?path=${encodeURIComponent(path)}`),
  );
}

/**
 * Byte proxy URL of a diff file — the source of the view's `<img>`
 * side by side images (MIN-66). `path` = the path as the diff names it
 * (the server itself deduces the base version of a renamed file).
 */
export function prFileRawUrl(
  endpoint: PrEndpoint,
  path: string,
  side: "base" | "head",
): string {
  return `${endpoint}/file/raw?path=${encodeURIComponent(path)}&side=${side}`;
}

export async function actOnPullRequestApi(
  prId: string,
  action: "merge" | "close" | "reopen" | "ready_for_review",
  method?: MergeMethod,
): Promise<{ ok: true; pr_state: PullRequestListItem["pr_state"] }> {
  trackEvent("pr_review_submitted", { verdict: action });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, method }),
    }),
  );
}

/**
 * Attaches a ticket to a PR that does not have one (MIN-163). DEFINITIVE: the server
 * rejects an already attached PR, like a ticket that already has a living PR —
 * the caller therefore shows its `error` as is (it is translated on the server side).
 *
 * Makes the status that the ticket just took aligned with the status of the PR.
 */
export async function linkPullRequestIssueApi(
  prId: string,
  issueId: string,
  prState: string,
): Promise<{
  ok: true;
  issue: { id: string; number: number; title: string };
  status: string | null;
}> {
  trackEvent("pr_issue_linked", { pr_state: prState });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link_issue", issueId }),
    }),
  );
}

/** Verdict of a review submitted from minddy (MIN-138). */
export type ReviewVerdict = "approve" | "request_changes" | "comment";

/**
 * Submits a review on PR (MIN-138). `relaunch` (on `request_changes`
 * only) launches IN ADDITION a cold run of Numo which iterates on this same PR,
 * with its own model (MIN-68).
 *
 * `published: "comment"` in return = the forge refused to publish the verdict —
 * An App cannot approve its own pull request. The verdict is recorded
 * minddy side anyway; the caller must tell the user.
 */
export async function submitPullRequestReviewApi(
  prId: string,
  input: {
    verdict: ReviewVerdict;
    message: string;
    relaunch?: boolean;
    /** `false` = do not publish anything in the name of the person: the message is a
     * instruction for Numo, not a verdict (“correct comments” mode).
     * Default `true` — the historic gesture. */
    postVerdict?: boolean;
    model?: string;
    reasoningLevel?: ReasoningLevel;
    /** Request a launch on the local repository attached to this project. */
    localExec?: boolean;
    /** Isolate this local launch in its worktree. */
    localWorktree?: boolean;
    /** The signed-in user accepted untrusted issue and PR context for this local run. */
    localIssueContextConfirmed?: boolean;
  },
): Promise<{
  ok: true;
  /** `none` = no verdict was given (desired), `comment` = the forge has it
   * folded up due to not being able to carry it (self-review). */
  published: "review" | "comment" | "none";
  run?: { id: string };
}> {
  trackEvent("pr_review_submitted", { verdict: input.verdict });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", ...input }),
    }),
  );
}

/**
 * “Have it checked by Numo” (MIN-141): a review pass on the diff, which
 * files a summary and up to five line comments on the PR.
 *
 * Available on ANY pull request — proofreading requires nothing other than a diff,
 * unlike "relaunch Numo", which needs a branch to inherit.
 * Manual by construction: nothing triggers it when opening a PR.
 *
 * Returns the SESSION, not the result: the pass is played in the background and is
 * look in the review panel (`usePrReviewSession`). If a pass turns
 * already on this PR, it's his that comes back - we don't open two.
 *
 * `model`: the id chosen in the picker, `""` to return to the minddy default,
 * `undefined` to not change anything in the choice made.
 */
export async function requestPullRequestAiReviewApi(
  prId: string,
  model?: string,
  reasoningLevel?: ReasoningLevel,
): Promise<{ ok: true; review: PrReviewRunSummary }> {
  trackEvent("pr_ai_review_requested");
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ai_review",
        ...(model === undefined ? {} : { model }),
        ...(reasoningLevel === undefined ? {} : { reasoningLevel }),
      }),
    }),
  );
}

export type { PrReviewRunSummary, PrReviewSession };

export async function fetchPullRequestAiReviewApi(
  prId: string,
): Promise<PrReviewSession> {
  return parseJson(await fetch(`${prEndpoint(prId)}/ai-review`));
}

// ── Global Pull Requests page (MIN-66, expanded by MIN-143) ─────────────────

/** List filtering state — served by the SERVER (`?state=`). */
export type PullRequestStateFilter = "open" | "merged" | "closed" | "all";

export interface PullRequestListItem {
  /** The item IS the PR. The run is no longer the carrier, just a decoration. */
  prId: string;
  pr_number: number;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed";
  /** Linked Repository Provider — controls PR/MR vocabulary and links (MIN-69). */
  provider: RepoProviderId;
  title: string | null;
  /** Who opened it — what distinguishes a Numo PR from a human PR. */
  author: { login: string; avatar_url: string | null } | null;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
  /** PR canonical run, or null: a human PR has none. */
  runId: string | null;
  /** A run WORKS on this PR (queued/running) = “Numo is working again”. */
  activeRunId: string | null;
  /** Un run ACTIF occupe l'issue → « demander des changements » indisponible (MIN-68). */
  busyRunId: string | null;
  /** All runs carrying this PR — a deep-link `?run=` matches any. */
  runIds: string[];
}

export interface PullRequestComment {
  id: number;
  body: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

export interface PullRequestListResponse {
  pullRequests: PullRequestListItem[];
  /** There are more beyond `limit` — the “see more” button on the page. */
  hasMore: boolean;
  /** The pagination of a forge has been cut: the list is not exhaustive. */
  truncated: boolean;
  /** Linked deposits visible by this account, all projects combined. 0 = there is
   * nothing to show here until a repository is linked somewhere. */
  repoCount: number;
  /** Is there ONE pull request, all states combined? An empty list on the
   * “open” filter does not say the same thing as an account that does not have any
   * never had — only the second deserves a home screen. */
  anyPr: boolean;
}

/**
 * `pin` PIN a PR in the answer even if it falls off the page — a
 * deep-link to an old PR should not depend on the depth of the
 * scrolling. `{ pr }` for a direct link, `{ run }` for historical links
 * of the app (the issue sidebar and /agents speak in run).
 */
export async function fetchAllPullRequestsApi(input: {
  state: PullRequestStateFilter;
  limit: number;
  pin?: { pr?: string | null; run?: string | null };
}): Promise<PullRequestListResponse> {
  const params = new URLSearchParams({
    state: input.state,
    limit: String(input.limit),
  });
  if (input.pin?.pr) params.set("pr", input.pin.pr);
  if (input.pin?.run) params.set("run", input.pin.run);
  return parseJson(await fetch(`/api/pull-requests?${params}`));
}

/**
 * The conversation thread: messages, PR ACTIVITY (MIN-159) and reactions,
 * served together — it all goes into one thread ordered by date.
 *
 * `reactions` ALSO carries those of the body of the PR, under `PR_BODY_COMMENT_ID`:
 * the message that opens the thread is reacted like the others.
 *
 * `timeline` is best-effort on the server side: an empty list means “the forge
 * did not know how to give it” as much as “nothing happened”. The thread then makes
 * his messages, as before.
 */
export async function fetchPullRequestCommentsApi(prId: string): Promise<{
  comments: PullRequestComment[];
  timeline: PrTimelineEvent[];
  reactions: ReviewCommentReaction[];
}> {
  return parseJson(await fetch(`${prEndpoint(prId)}/comments`));
}

/**
 * A PR commit. TWO authors, and they do not say the same thing:
 * `author` is the ACCOUNT of the forge (avatar + login), when it was able to attach
 * the commit email; `authorName` is the name written IN the commit, which git has
 * always. On the GitLab side, whose API does not serve any account on this endpoint, it
 * There is only ever the second - hence the fallback of the rendering on it.
 */
export interface PullRequestCommit {
  sha: string;
  /** FULL message: first line = title, the rest = body. */
  message: string;
  author: { login: string; avatar_url: string | null } | null;
  authorName: string | null;
  /** Author email — the deduplication key with co-signers. */
  authorEmail: string | null;
  authoredAt: string | null;
  url: string | null;
  /** Signature verified. `null` = UNKNOWN (GitLab doesn't serve it), not "no". */
  verified: boolean | null;
  /** First parent — the "before" side of this commit's diff. */
  parentSha: string | null;
  /** Lines added/removed BY THIS COMMIT. `null` = the forge did not know the
      give (GraphQL failed, or MR too long on the GitLab side): the indicator
      +/− then disappears, but the commit diff remains open. */
  additions: number | null;
  deletions: number | null;
  /**
   * ALL its authors, principal at the head (MIN-159). A co-signed commit
   * (`Co-authored-by:`) has several — the common case as soon as an agent has held
   * the keyboard — and the screen stacks avatars, like the forge.
   *
   * OPTIONAL although the road always fills it: a tab remained open
   * during a deployment keeps in cache the response of the previous version, which
   * did not have this field. The guy says it, so that every reading keeps it —
   * otherwise the entire page falls on a `.length` of `undefined`.
   */
  authors?: CommitAuthor[];
}

/**
 * The commits that make up the PR, from oldest to newest on the forge side —
 * the Commits tab then displays them from newest to oldest.
 * `truncated`: PR has more than Minddy lists at once.
 */
export async function fetchPullRequestCommitsApi(
  prId: string,
): Promise<{ commits: PullRequestCommit[]; truncated: boolean }> {
  return parseJson(await fetch(`${prEndpoint(prId)}/commits`));
}

/** An account of the forge, as the commentary composer suggests. */
export interface RepoMember {
  login: string;
  avatar_url: string | null;
  name: string | null;
}

/**
 * The forge accounts mentionable on this PR (MIN-162). Never in
 * server side error: at worst an empty list, and the composer does not offer any
 * simply none.
 */
export async function fetchPullRequestMembersApi(
  endpoint: PrEndpoint,
): Promise<{ members: RepoMember[] }> {
  return parseJson(await fetch(`${endpoint}/members`));
}

/** Base of ONE commit routes: its diff, and — like a PR — its files. */
export function prCommitEndpoint(prId: string, sha: string): PrEndpoint {
  return `${prEndpoint(prId)}/commits/${sha}`;
}

export interface PrCommitDiff {
  files: PullRequestFile[];
  additions: number;
  deletions: number;
  url: string | null;
  parentSha: string | null;
  message: string;
  author: { login: string; avatar_url: string | null } | null;
  authorName: string | null;
  authoredAt: string | null;
  provider?: RepoProviderId;
}

/**
 * The diff of ONE PR commit, against its parent. Serves the view “what this
 * commit change” — same files/patches as the PR diff, so the same
 * rendering component, except that context unfolding resolves the problem there.
 * PARENT du commit (cf. `prCommitEndpoint`).
 */
export async function fetchPrCommitDiffApi(
  prId: string,
  sha: string,
): Promise<PrCommitDiff> {
  return parseJson(await fetch(prCommitEndpoint(prId, sha)));
}

/**
 * Post or remove a reaction on a message in the conversation thread, or on the
 * PR body (`commentId: PR_BODY_COMMENT_ID`). `on` has the DESIRED state, not
 * a switch — same contract as on the review side.
 */
export async function setPrCommentReactionApi(
  endpoint: PrEndpoint,
  input: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<{ ok: true; on: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/comments/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment_id: input.commentId,
        content: input.content,
        on: input.on,
      }),
    }),
  );
}

/**
 * Review comment: anchored to a line in the diff, unlike
 * `PullRequestComment` which lives in the flat thread of the conversation.
 *
 * `line` non-zero does NOT mean “the line is in the diff”: GitHub
 * keeps as long as he knows how to find the line in his head, even if the diff has
 * moved elsewhere. It is the resolution in the rendered hunks that decides
 * l'affichage inline — voir `pr-diff`.
 */
export interface PullRequestReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  side: "LEFT" | "RIGHT";
  /** First line of a MULTI-LINE remark (MIN-181) — `line` is then
      the last. `null` for a single-line remark, and always
      `null` on the GitLab side, where a note is anchored on a line. */
  start_line: number | null;
  start_side: "LEFT" | "RIGHT" | null;
  /** Root of the thread, or null if this comment IS the root. */
  in_reply_to_id: number | null;
  /** Review that carries this comment (MIN-159) — the conversation thread ranges
      the points of a review UNDER it. `null` on the GitLab side, without review purpose. */
  review_id: number | null;
  diff_hunk: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

/**
 * Review comments AND condition of their sons (MIN-139), served together: one
 * thread goes with both. `threads` can be empty while comments
 * exist — the forge was unable to tell the state, and the UI then does not offer
 * “Resolve” button rather than announcing “open” blindly.
 */
export async function fetchPrReviewCommentsApi(endpoint: PrEndpoint): Promise<{
  comments: PullRequestReviewComment[];
  threads: ReviewThreadState[];
  reactions: ReviewCommentReaction[];
}> {
  return parseJson(await fetch(`${endpoint}/review-comments`));
}

/**
 * Post or remove a reaction to a review comment. `on` carries the state
 * WANTED, not a switch: two competing clicks converge instead of
 * cancels itself, and a resend after network failure does not undo what had succeeded.
 */
export async function setPrReviewCommentReactionApi(
  endpoint: PrEndpoint,
  input: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<{ ok: true; on: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment_id: input.commentId,
        content: input.content,
        on: input.on,
      }),
    }),
  );
}

/** Resolves/reopens a review thread (`threadId` comes from `threads` above). */
export async function setPrReviewThreadResolvedApi(
  endpoint: PrEndpoint,
  input: { threadId: string; resolved: boolean },
): Promise<{ ok: true; resolved: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: input.threadId,
        resolved: input.resolved,
      }),
    }),
  );
}

/**
 * Post a comment on a line in the diff — or on a RANGE of lines, in
 * passing `startLine` (`line` is then the LAST line referred to, like GitHub
 * waiting for it). Share immediately on GitHub. Raise a code `ApiError`
 * `lineNotInDiff` if GitHub refuses to anchor the line.
 */
export async function postPrReviewCommentApi(
  endpoint: PrEndpoint,
  input: {
    body: string;
    path: string;
    line: number;
    side: "LEFT" | "RIGHT";
    startLine?: number;
    startSide?: "LEFT" | "RIGHT";
  },
): Promise<{ comment: PullRequestReviewComment }> {
  const { startLine, startSide, ...rest } = input;
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rest,
        ...(startLine != null
          ? { start_line: startLine, start_side: startSide }
          : {}),
      }),
    }),
  );
}

/** Reply in a review thread (`inReplyTo` = any thread id). */
export async function replyPrReviewCommentApi(
  endpoint: PrEndpoint,
  input: { body: string; inReplyTo: number },
): Promise<{ comment: PullRequestReviewComment }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: input.body, in_reply_to: input.inReplyTo }),
    }),
  );
}

// ── Page Agents (liste globale des sessions) ─────────────────────────────────

/**
 * A CONVERSATION of the agent = ONE run, ticket or not: the successive runs of a
 * same ticket are separate conversations, listed side by side (there is no
 * no more session which groups them together, nor selector to go from one to
 * the other). Their title comes from the titler, written at launch.
 */
export interface AgentSessionListItem {
  /** Durable identity of the conversation. */
  conversationId: string;
  /** Current execution, used by the control plan. */
  runId: string;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: "button" | "chat" | "mention";
  /** Title written at launch (PR title for proofreading). `null` when
   * it is missing — cf. `agentSessionTitle` for fallbacks. */
  title: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  created_at: string;
  updated_at: string;
  /** Null = conversation CARNET (MIN-84) ou de RELECTURE (MIN-168). */
  issue: { id: string; number: number; title: string } | null;
  /** The pull request that this conversation RELITS (MIN-168) — badge “Analysis of
   * PR.” Distinct from `pr_number`, which is the PR that a code run has OPENED. */
  pullRequest: {
    id: string;
    number: number;
    title: string | null;
    url: string | null;
  } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
  /** CE run TRAVAILLE (queued/running) → spinner « Numo travaille ». */
  working: boolean;
  /** This conversation is pinned by the current user. */
  pinned: boolean;
  /**
   * Agent end of this run, or `null` if it never finished. Compared to
   * `last_read_at` of the user → blue bubble “finished, unread”.
   */
  lastCompletedAt: string | null;
  /** This run is waiting for a response (ask_user) → YELLOW point. */
  awaitingInput: boolean;
}

export async function fetchAgentSessionsApi(): Promise<{
  sessions: AgentSessionListItem[];
}> {
  return parseJson(await fetch(`/api/agent-runs`));
}

// ── “Read” status of agent sessions (blue “completed, unread” bubble) ────────

/**
 * Map { conversationId → last_read_at } of viewed conversations. A
 * session is UNREAD when its last completed run (`lastCompletedAt`) is
 * later than this timestamp (or absent from the card = never consulted).
 */
export async function fetchAgentReadsApi(): Promise<{
  reads: Record<string, string>;
}> {
  return parseJson(await fetch(`/api/agent-reads`));
}

/** Mark a conversation as read NOW. */
export async function markAgentSessionReadApi(
  conversationId: string,
): Promise<void> {
  await parseJson(
    await fetch(`/api/agent-reads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    }),
  );
}

/**
 * A session is UNREAD when its last agent end (`lastCompletedAt`) is
 * after the last `last_read_at` of the user (or never consulted), AND
 * that no run WORKS: during work it is the halo/spinner which takes precedence, the
 * “Done” bubble only appears once the agent is at rest.
 */
export function isAgentSessionUnread(
  session: Pick<
    AgentSessionListItem,
    "conversationId" | "working" | "lastCompletedAt"
  >,
  reads: Record<string, string>,
): boolean {
  if (session.working || !session.lastCompletedAt) return false;
  const lastRead = reads[session.conversationId];
  // NUMERICAL comparison: `completed_at` (Postgres, `…+00:00`) and `last_read_at`
  // (client, `…Z`) do not have the same string format → a lexical `>` would be false.
  if (!lastRead) return true;
  return (
    new Date(session.lastCompletedAt).getTime() > new Date(lastRead).getTime()
  );
}

/**
 * A specific run is UNREAD: it finished (`completed_at`) after the last one
 * `last_read_at` of the session (or never consulted). Pilot the bubble in the
 * session selector (each run = “Session N”).
 */
export function isAgentRunUnread(
  run: Pick<AgentRunSummary, "completed_at">,
  lastReadAt: string | null | undefined,
): boolean {
  if (!run.completed_at) return false;
  // NUMERIC comparison (heterogeneous date formats — see isAgentSessionUnread).
  if (!lastReadAt) return true;
  return new Date(run.completed_at).getTime() > new Date(lastReadAt).getTime();
}

/**
 * The run is AT REST WAITING for a response from the user (round completed
 * on ask_user, MIN-86): the “unread” points turn YELLOW — the
 * conversation is blocked until the user responds.
 */
export function isAgentRunAwaitingInput(
  run: Pick<AgentRunSummary, "status" | "awaiting_input">,
): boolean {
  return run.status === "completed" && run.awaiting_input === true;
}

/**
 * Post a message in the PR thread.
 *
 * `review` accompanies the response when the message MENTIONED `@numo`
 * (MIN-162): the pass is already open on the server side when it returns, and
 * it is this field that allows the screen to show it RIGHT AWAY. Without him, he
 * would only discover it at the next fortuitous refresh.
 */
export async function postPullRequestCommentApi(
  prId: string,
  body: string,
): Promise<{
  comment: PullRequestComment;
  review?: PrReviewRunSummary | null;
}> {
  return parseJson(
    await fetch(`${prEndpoint(prId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),
  );
}
