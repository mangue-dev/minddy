import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { insertNotifications } from "@/lib/server/notifications";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import { AGENT_ENGINE, type AgentEngine } from "@/lib/agent-engines";
// Type ONLY (therefore deleted during compilation): `launch.ts` imports this module, the
// dependency should not exist at runtime.
import type { AgentLaunchIntent } from "./launch";
import type { AgentChatMessage, AgentEventType } from "./agent-contract";
import { broadcastRunEvent } from "./live";
import { localRunScope } from "./local-exec-scope";
import { currentDeploymentScope } from "./deployment";
import { captureServerEvent } from "@/lib/server/posthog";
import { durationBucket } from "@/lib/analytics-sanitize";
import { notifyChainOfRunEnd } from "@/lib/server/automations/hooks";
import {
  notifyRoutineOfRunEnd,
  stampRoutineRunEnd,
} from "@/lib/server/routine-hooks";
import { afterOrNow } from "@/lib/server/after-safe";
import { getProjectAccess } from "@/lib/server/project-access";
import type { AssistantMention } from "@/lib/assistant-types";
import type { AgentUserMessage } from "@/lib/agent-mentions";

/**
 * Data access to code agent runs (MIN-46): creation, CAS claim,
 * terminal-guarded stamping, sweeping blocked runs, and adding events to the
 * live view. Customer service only (read-only RLS on the members side).
 */

/**
 * Statuses of a run (conversational model). `completed` = AT REST: the turn is
 * finished, the session waits for the next message in its conversation — it remains
 * can be resumed hot and no longer takes up the ticket. (`needs_input` no longer exists:
 * a question from the agent is an answer like any other.)
 */
export type AgentRunStatus =
  "queued" | "running" | "completed" | "failed" | "canceled";

/** Statuts dont on ne repart pas — ceux qui closent un run (analytics). */
const TERMINAL_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  "completed",
  "failed",
  "canceled",
]);

/**
 * Who started the run. `automation` (MIN-147) is the fourth: a rule of
 * project, not a gesture — this is what distinguishes, in analytics as in
 * the UI, a chain that unfolds with a click on “launch Numo”. `routine`
 * (MIN-185) is the fifth: a deadline, not even a rule — no one
 * was not in front of the screen, not even to change a status.
 */
export type AgentRunTrigger =
  "button" | "chat" | "mention" | "automation" | "routine";

/**
 * What the agent responded to tool `report_verdict` (MIN-147), used only for
 * steps for verifying a string. This is what the engine reads to decide
 * between “we continue”, “we start again” and “we give back”.
 */
export interface AgentRunVerdict {
  ok: boolean;
  summary: string;
  blockers: string[];
}

/** Serialized content of the checkpoint (resumed as is in the next chunk). */
export interface AgentCheckpoint {
  messages: AgentChatMessage[];
  /** Prochain index de ligne ai_usage (ordre d'affichage). */
  usageSeq?: number;
  /**
   * Sha git at the last event `files_changed` emitted — the “before” of the diff per turn
   * (MIN-46). Persisted in the checkpoint so that a round broke out on several chunks
   * (intermediate WIP) still differs from its REAL beginning, not from the last
   * chunk. Started at the HEAD of the first chunk (“nothing changed yet” for this run).
   */
  lastFilesSha?: string;
  /**
   * Repo instructions already served to the model (MIN-115): paths seen (root to
   * the boot, subfolders at the first edition in it) and bytes consumed on
   * the overall course. Persisted so that a round exploded on several chunks
   * never re-serves a `AGENTS.md` that the model has already read.
   */
  instructions?: { paths: string[]; bytes: number };
  /**
   * Line comments already posted by CE run on its pull request (MIN-168).
   * The ceiling is “5 per run”, not “5 per turn”: the counter must therefore
   * survive the chunking AND the next round, and the checkpoint is
   * only state of the run that crosses both.
   */
  prInlineComments?: number;
  /**
   * Files edited and not yet type-checked (MIN-210) — capped at
   * `CHECKPOINT_EDITED_PATHS_MAX` (execute.ts) so as not to weigh anything on
   * `MAX_CHECKPOINT_BYTES`. It's from TOWER state, like `lastFilesSha` and
   * `instructions`: without it, a turn that extends beyond a chunk ends with a
   * `Set` empty, and neither `tsc` nor auto-readback works on the work of the
   * previous chunk — the PR leaves without any verification having taken place.
   */
  editedPaths?: string[];
  /**
   * Turn Edited Repository (MIN-210) — the lock that unlocks auto-replay, there
   * where `editedPaths` empties at each type-check.
   *
   * These two fields are written by ALL quiesces except `completed`:
   * there, the tour is over (type-check and rereading have spoken, `lastFilesSha` has
   * advanced until the head is pushed), and make them leak on the next turn y
   * would trigger a self-reread which has nothing to re-read.
   */
  repoTouched?: boolean;
  /**
   * CONSECUTIVE re-queues granted to provider failure (MIN-219), bounded
   * by `MAX_PROVIDER_REQUEUES`. Written by the only output that awaits the
   * provider, therefore reset by itself as soon as a chunk advances: the
   * checkpoint is rebuilt anew each time it is quiesced, and no other
   * branche ne repose ce champ.
   *
   * Here and not in a column: it is a WAIT counter, it has no meaning
   * only attached to the state of the turn that he makes wait. `continuations` account
   * the chunks that worked, `attempts` the claims of a crash — a chunk
   * dead on his first model call is neither.
   */
  providerRetries?: number;
  /**
   * OPENCODE STATUS (MIN-286) — the event log that the supervisor
   * play again to find your session (see `OpencodeCheckpointState`).
   *
   * NEXT to `messages` and not in its place, and this is not a transition: it is
   * which makes a checkpoint readable without its context. A conversation led by
   * the home loop has `messages` and not this field; a conversation led by
   * opencode has this field and an empty `messages`. A tour resumed therefore knows, by reading
   * its only checkpoint, which engine wrote it — and that's what protects a run
   * whose LINE would say the opposite (see `effectiveEngine` in execute.ts).
   */
  opencode?: {
    sessionId: string;
    /**
     * The aggregate export slider — the argument for the next export.
     *
     * THE EVENTS ARE NO LONGER HERE (MIN-286, 2026-08-13). They live in
     * `agent_run_journal`, add it, for two measured reasons: the log
     * carries the COMPLETE output of each tool (22 KB for a reading of 260
     * lines, republished two to three times), so it exceeded the body ceiling
     * of the control plan in around fifteen readings — a 31-minute tour
     * lost all his conversation; and this line is reread on EVERY call
     * of the control plane, where the newspaper was paid hundreds of times per turn.
     */
    seq: Record<string, number>;
  };
}

export interface AgentRun {
  id: string;
  /** Durable identity of the conversation. A run is just an execution of
   *  celle-ci ; plusieurs runs pourront donc partager cet identifiant. */
  conversation_id: string;
  conversation?: {
    owner_id: string | null;
    visibility: "private" | "project";
  } | null;
  project_id: string;
  /** Null = “notebook” run (MIN-84) or PULL REQUEST run (MIN-168): anchored to
   * project + free instruction, without tickets. No lineage: every run of
   * this genre is its own conversation. */
  issue_id: string | null;
  /**
   * Pull request RELEASE by this run (MIN-168) — the third anchor, next to the
   * ticket and notebook. Not null ⇒ review session: read only on the
   * filing, writing only in PR comments.
   */
  pull_request_id: string | null;
  /**
   * The sha that this review has READ. It is he who responds to “relaunch would he have
   * something new to read? » — the running head lives in
   * `pull_requests.head_sha` and says nothing about what was reread.
   */
  pr_head_sha: string | null;
  repo_link_id: string | null;
  connection_id: string | null;
  /** Immutable repository identity selected when the run was created. */
  repo_provider: RepoProviderId | null;
  repo_external_id: string | null;
  status: AgentRunStatus;
  triggered_by: AgentRunTrigger;
  created_by: string | null;
  prompt: string | null;
  prompt_mentions: AssistantMention[] | null;
  /** Short summary of the note, for the CARNET sessions. Null = no summary
   * (issue run, whose title is that of the ticket; or failed generation). */
  title: string | null;
  model: string | null;
  model_forced: boolean;
  /** Level of reasoning FROZEN at launch (MIN-122), like the model: one run
   * taken up by another invocation must find the same one. */
  reasoning_level: ReasoningLevel;
  key_mode: "platform" | "byok";
  base_branch: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  /** Atomically reserved successful/in-flight inline PR comments for this run. */
  pr_inline_comments_used?: number;
  sandbox_id: string | null;
  checkpoint: AgentCheckpoint | null;
  continuations: number;
  attempts: number;
  not_before: string;
  started_at: string | null;
  run_id: string | null;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  /** The last round ended on an ask_user: the session is waiting for the response
   * of the user (yellow dot on surfaces). Set to false every time
   * other entry at rest. */
  awaiting_input: boolean;
  /** Idle clock: client heartbeat + steer + idle input. Pilot it
   * reaping sandbox idle. */
  last_activity_at: string;
  /** “Interrupt current response”: read by the active suspending chunk. */
  interrupt_requested: boolean;
  /** microVM cut by the reaper (null = alive/unknown). */
  sandbox_stopped_at: string | null;
  /** Deployment which has the right to drain this run (MIN-165). Null = queue
   * municipality (prod + local); otherwise the `VERCEL_URL` of a preview, only it
   *  reprendre — cf. `deployment.ts`. */
  deployment_url: string | null;
  /** Automation chain (MIN-147) of which this run is a step. Null = run
   * ordinary, hand-thrown. */
  chain_id: string | null;
  /**
   * ROUTINE (MIN-185) of which this run is a passage. Not zero ⇒ three deviations with
   * an ordinary run notebook, and they are ALL carried by this column: the
   * expense is counted under “Routines” (`routine_code`/`routine_compute`), the
   * toolset loses `ask_user` and `create_routine` (person in front of the screen;
   * no self-replication), and the conversation list excludes it — otherwise
   * a daily routine would drown the Agents column in a week.
   */
  routine_id: string | null;
  /** CE run spending limit, in USD. Null = only the quota and the ceiling
   * of the bound chain. */
  budget_usd: number | null;
  /** Managed-AI account budget reserved atomically when this run was created. */
  managed_budget_usd?: number | null;
  /** First accepted VM completion callback for the current running turn. */
  rest_claimed_at?: string | null;
  /** What we ASKED for this run. Persisted since MIN-147: without it, the chain
   * can't know what the run that just finished was doing. */
  intent: AgentLaunchIntent | null;
  /** Verdict of a verification step (see `AgentRunVerdict`). */
  verdict: AgentRunVerdict | null;
  /**
   * REVOCATION identifier of the LLM key issued for this run (MIN-223) — the
   * `hash` from OpenRouter, never the secret. He lives on the line and not in the
   * memory of the function which minted it, because it is not she who
   * revokes: it is the inactivity reaper, which only knows its line of the run.
   * Null = no key per run (BYOK, or provisioning not configured).
   */
  provider_key_id: string | null;
  /**
   * The loop of this run runs IN the microVM (MIN-224), not in the function.
   *
   * FROZEN AT LAUNCH from `app_config` (see `vm-flag.ts`), like `model` and
   * `reasoning_level`. Reading it every chunk would change a conversation
   * motor during its life: one revolution started before the switch and resumed after
   * would go back on a loop that never saw its checkpoint.
   */
  loop_in_vm: boolean;
  /**
   * The Vercel Sandbox command which CARRIES the loop, launched in `detached: true`
   * (MIN-224). Null until the loop starts.
   *
   * This is the observation of the life of the trick: the function returns the hand immediately, and
   * what remains to know if the process is still working is this id — that
   * `Sandbox.getCommand()` knows how to query. The watchdog uses it to
   * place of a presumption after twenty minutes of silence: an observation, and it
   * is correct.
   */
  loop_command_id: string | null;
  /**
   * THE HARNESS that plays this run (MIN-286): `loop`, the house loop, or
   * `opencode`, the headless server controlled by our supervisor.
   *
   * FROZEN AT LAUNCH from `app_config` (see `engine-flag.ts`), for the same
   * reason that `loop_in_vm`: she SAYS what played a role in this run, she no longer decides
   * Nothing. The home loop left in MIN-225; the lines which carry `loop`
   * remain readable, and that’s all we ask of them.
   */
  agent_engine: AgentEngine;
  /**
   * This run runs on the USER'S MACHINE (MIN-355), not in a
   * microVM.
   *
   * FROZEN AT LAUNCH, like `loop_in_vm` and `agent_engine`, and for some reason
   * more than them: what changes is not only where the loop turns, it is the
   * DEPOSIT she is working on. A trick played on a Mac then repeated in a
   * microVM would start from a clone which knows nothing of what the first has
   * writing.
   *
   * Two readers, and they are not alike: the control plane, which does not admit
   * a local token only on a line which says so, and the WATCHDOG, for which a
   * run local is the only case where "we don't know" is permanent (there is no
   * platform to query, cf. `reapDeadVmRuns`).
   */
  local_exec: boolean;
  /** The local run uses an isolated worktree rather than the attached checkout. */
  local_worktree: boolean;
  /** The local user explicitly accepted the untrusted issue context for this run. */
  local_issue_context_confirmed: boolean;
  /**
   * GENERATION of local execution lease (MIN-355) — the only revocation
   * possible d'un jeton auto-porteur.
   *
   * The harness token bears this number as a claim; `issueLocalExecToken`
   * ([local-exec.ts](local-exec.ts)) increments it on each emission, which kills
   * all the previous ones just now. One machine per run, by construction rather
   * que par convention.
   */
  local_exec_gen: number;
  /** Desktop profile that won the atomic queued local-run claim. */
  local_exec_device_id: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES: AgentRunStatus[] = ["queued", "running"];
export interface CreateRunInput {
  projectId: string;
  /** Null = run carnet (MIN-84) ou run de pull request (MIN-168), sans ticket. */
  issueId: string | null;
  /** Pull request reread by this run (MIN-168). Exclusive with `issueId`. */
  pullRequestId?: string | null;
  /** Sha from the head of this PR at launch — what the review will have read. */
  prHeadSha?: string | null;
  repoLinkId: string | null;
  connectionId: string | null;
  repoProvider: RepoProviderId | null;
  repoExternalId: string | null;
  createdBy: string;
  prompt?: string | null;
  promptMentions?: AssistantMention[] | null;
  /** Summary of the note (runs notebook) — cf. `AgentRun.title`. */
  title?: string | null;
  model: string;
  modelForced: boolean;
  /** Level of reasoning resolved at launch (see `resolveReasoningLevel`). */
  reasoningLevel: ReasoningLevel;
  keyMode: "platform" | "byok";
  triggeredBy: AgentRunTrigger;
  /** Step of an automation chain (MIN-147): its id and its ceiling. */
  chainId?: string | null;
  budgetUsd?: number | null;
  /** Passage of a ROUTINE (MIN-185) — cf. `AgentRun.routine_id`. */
  routineId?: string | null;
  /** What we ask of the run — persisted, unlike before MIN-147. */
  intent?: AgentLaunchIntent | null;
  /**
   * Branch to resume (instead of generating a new one): a cold run which
   * inherits the PR from the issue leaves from ITS branch → same updated PR (MIN-68).
   */
  baseBranch?: string | null;
  branchName?: string | null;
  /** Legacy PR, installed from creation (see `inheritableWorkForIssue`). */
  prNumber?: number | null;
  prUrl?: string | null;
  prState?: AgentRun["pr_state"];
  /**
   * This run starts on the USER'S MACHINE (MIN-355) — cf.
   * `AgentRun.local_exec`. This is the ONLY entry: the mode is fixed here, at
   * creation, and nothing switches it afterward. Absent = a microVM run, which
   * are all runs up to MIN-293.
   */
  localExec?: boolean;
  /** Isolates the local run in a worktree from the machine running it. */
  localWorktree?: boolean;
  /** Explicit acknowledgement required for issue-anchored local execution. */
  localIssueContextConfirmed?: boolean;
  /** Required for platform-funded runs; omitted for BYOK. */
  managedBudget?: {
    periodStart: string;
    accountCapUsd: number;
    requestedUsd: number;
  };
}

/**
 * Raised by `createRun` when a partial unique index refuses the insertion (a
 * routine, a chain or a pull request has won the launch race).
 */
export class ActiveRunExistsError extends Error {
  constructor() {
    super("An agent run is already active on this anchor");
    this.name = "ActiveRunExistsError";
  }
}

/** The atomic reservation found no uncommitted managed-AI budget. */
export class ManagedBudgetUnavailableError extends Error {
  constructor() {
    super("No managed-AI budget remains for this run");
    this.name = "ManagedBudgetUnavailableError";
  }
}

/**
 * Anchoring a run, as analytics calls it. Three values ​​since MIN-168:
 * a review session is neither a ticket run nor a notebook run, and the
 * confusing it would make the reviews read like coding sessions.
 */
function runScope(run: {
  issueId?: string | null;
  issue_id?: string | null;
  pullRequestId?: string | null;
  pull_request_id?: string | null;
}): "issue_context" | "general" | "pr_review" {
  if (run.issueId ?? run.issue_id) return "issue_context";
  if (run.pullRequestId ?? run.pull_request_id) return "pr_review";
  return "general";
}

/** Postgres code with a unique constraint violation. */
const PG_UNIQUE_VIOLATION = "23505";

/** Creates a run in `queued`, ready to be drained. */
export async function createRun(input: CreateRunInput): Promise<AgentRun> {
  const service = getServiceClient();
  /**
   * THE ENGINE AND THE MICROVM, INSTALLED WITHOUT ASKING ANYONE (MIN-286).
   *
   * There is no more flag: `opencode` is the harness, and it only runs in
   * microVM — there is no “in-function” version of its
   * supervisor, who controls a server living next to the depot. The two lists of
   * `app_config` projects (`agent_opencode_projects`, `agent_loop_in_vm_projects`)
   * therefore disappeared with what they were used to decide.
   *
   * Both values ​​remain WRITTEN on the line, and that's what matters: they
   * say which engine performed THIS run, and a run already in flight at the time of deployment
   * keep his. The two engines do not keep their memory in the same place
   * (`checkpoint.messages` against `checkpoint.opencode`), therefore a conversation which
   * changing the engine during its life would not lose a setting: it would lose
   * its history. The column is also read by the SWEEPERS
   * (`reapDeadVmRuns` wants it true) — a line that would say `false` when playing in
   * the VM would never be found dead.
   */
  const engine = AGENT_ENGINE;
  const loopInVm = true;
  const values = {
    project_id: input.projectId,
    issue_id: input.issueId,
    pull_request_id: input.pullRequestId ?? null,
    pr_head_sha: input.prHeadSha ?? null,
    repo_link_id: input.repoLinkId,
    connection_id: input.connectionId,
    repo_provider: input.repoProvider,
    repo_external_id: input.repoExternalId,
    status: "queued",
    triggered_by: input.triggeredBy,
    created_by: input.createdBy,
    prompt: input.prompt ?? null,
    prompt_mentions: input.promptMentions ?? null,
    title: input.title ?? null,
    model: input.model,
    model_forced: input.modelForced,
    reasoning_level: input.reasoningLevel,
    key_mode: input.keyMode,
    base_branch: input.baseBranch ?? null,
    branch_name: input.branchName ?? null,
    pr_number: input.prNumber ?? null,
    pr_url: input.prUrl ?? null,
    pr_state: input.prState ?? null,
    run_id: randomUUID(),
    chain_id: input.chainId ?? null,
    budget_usd: input.budgetUsd ?? null,
    routine_id: input.routineId ?? null,
    intent: input.intent ?? null,
    // Deployment affinity (MIN-165): set ONCE, at creation. All
    // the chunks of a run launched from a preview remain on this deployment.
    deployment_url: currentDeploymentScope(),
    loop_in_vm: loopInVm,
    agent_engine: engine,
    /**
     * THE EXECUTION ENVIRONMENT (MIN-355), placed here and never elsewhere — even
     * doctrine than the two lines above. The lease generation leaves
     * to zero: it only becomes something when the first token is issued.
     *
     * The third-party-content invariant is applied at the only writer of the
     * column. Automated sources remain excluded; an issue can run locally only
     * after the signed-in user acknowledges its untrusted context (MIN-439).
     */
    local_exec:
      input.localExec === true &&
      localRunScope({
        triggeredBy: input.triggeredBy,
        routineId: input.routineId,
        chainId: input.chainId,
        pullRequestId: input.pullRequestId,
        issueId: input.issueId,
        localIssueContextConfirmed: input.localIssueContextConfirmed,
      }).ok,
    local_issue_context_confirmed:
      input.issueId !== null && input.localIssueContextConfirmed === true,
    // This option only makes sense for a truly local run. The same
    // keeps `local_exec` closes automated/third-party entries.
    local_worktree:
      input.localWorktree === true &&
      input.localExec === true &&
      localRunScope({
        triggeredBy: input.triggeredBy,
        routineId: input.routineId,
        chainId: input.chainId,
        pullRequestId: input.pullRequestId,
        issueId: input.issueId,
        localIssueContextConfirmed: input.localIssueContextConfirmed,
      }).ok,
  };
  const result = input.managedBudget
    ? await service.rpc("create_agent_run_with_budget", {
        p_user_id: input.createdBy,
        p_usage_since: input.managedBudget.periodStart,
        p_budget_cap: input.managedBudget.accountCapUsd,
        p_requested_budget: input.managedBudget.requestedUsd,
        p_values: values,
      })
    : await service.from("agent_runs").insert(values).select("*").single();
  const error = result.error;
  const reserved = input.managedBudget
    ? ((result.data as { run?: AgentRun | null } | null)?.run ?? null)
    : (result.data as AgentRun | null);
  const data = reserved;
  if (error || !data) {
    if (error?.code === PG_UNIQUE_VIOLATION) throw new ActiveRunExistsError();
    if (!error && input.managedBudget)
      throw new ManagedBudgetUnavailableError();
    throw new Error(error?.message ?? "Failed to create agent run");
  }
  // Analytics (MIN-78): the launch is also tracked on the client side, but it
  // only does not see runs triggered by mention or restarted by drain.
  // The prompt is never sent.
  captureServerEvent({
    distinctId: input.createdBy ?? "agent:system",
    event: "agent_run_started",
    properties: {
      model: input.model ?? "default",
      model_forced: input.modelForced,
      reasoning_level: input.reasoningLevel,
      key_mode: input.keyMode,
      triggered_by: input.triggeredBy,
      // What the run REQUESTS (MIN-147): without that, an automation chain
      // only reads in analytics as a burst of launches.
      intent: input.intent ?? "implement",
      in_chain: !!input.chainId,
      // A ROUTINE passage (MIN-185): without this flag, analytics reads them
      // like notebook sessions, and “how many runs does he go on his own?” »
      // has no answer.
      in_routine: !!input.routineId,
      scope: runScope(input),
      has_base_branch: !!input.baseBranch,
      resumes_pr: input.prNumber != null,
      project_id: input.projectId,
    },
    groups: { project: input.projectId },
  });
  return data as AgentRun;
}

/** Atomic CAS claim (queued → running). Returns null when another worker won. */
export async function claimRun(runId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("claim_agent_run", {
    p_run_id: runId,
  });
  if (error) {
    console.error("[agent-runs] claim failed:", error.message);
    return null;
  }
  const rows = (data ?? []) as AgentRun[];
  const run = rows[0] ?? null;
  if (!run) return null;
  if (await runAuthorityIsCurrent(run)) return run;

  // The generic claim RPC only arbitrates queued workers. Authorization can
  // change after the run was queued, so close a stale claim before an executor
  // can read project or repository context.
  await stampRun(run.id, {
    status: "canceled",
    error_message: "Run authority was revoked before execution",
    ...(run.local_exec ? { local_exec_gen: run.local_exec_gen + 1 } : {}),
  });
  return null;
}

/**
 * Claims the one VM completion callback allowed to land the current turn.
 * Charging, repository landing, events, and the terminal stamp all happen only
 * after this compare-and-swap succeeds.
 */
export async function claimRunRest(runId: string): Promise<AgentRun | null> {
  const { data, error } = await getServiceClient().rpc("claim_agent_run_rest", {
    p_run_id: runId,
  });
  if (error) {
    console.error("[agent-runs] rest claim failed:", error.message);
    return null;
  }
  return ((data ?? []) as AgentRun[])[0] ?? null;
}

/**
 * Atomically assign a queued local run to its creator and one desktop profile.
 * The service-side RPC repeats every predicate in the transition so a stale
 * queue read cannot claim after membership, mode, user, or machine context has
 * changed.
 */
export async function claimLocalRun(input: {
  runId: string;
  userId: string;
  deviceId: string;
}): Promise<AgentRun | null> {
  const { data, error } = await getServiceClient().rpc(
    "claim_local_agent_run",
    {
      p_run_id: input.runId,
      p_user_id: input.userId,
      p_device_id: input.deviceId,
    },
  );
  if (error) {
    console.error("[agent-runs] local claim failed:", error.message);
    return null;
  }
  return ((data ?? []) as AgentRun[])[0] ?? null;
}

export async function getRun(runId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*, conversation:agent_conversations(owner_id, visibility)")
    .eq("id", runId)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/** True when no newer run exists on the anchor whose history this run shares. */
export async function runIsLatestOnAnchor(run: AgentRun): Promise<boolean> {
  const service = getServiceClient();
  let query = service
    .from("agent_runs")
    .select("id")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (run.issue_id) query = query.eq("issue_id", run.issue_id);
  else if (run.pull_request_id)
    query = query.eq("pull_request_id", run.pull_request_id);
  else if (run.routine_id) query = query.eq("routine_id", run.routine_id);
  else query = query.eq("conversation_id", run.conversation_id);
  const { data, error } = await query;
  if (error) {
    console.error("[agent-runs] latest-anchor check failed:", error.message);
    return false;
  }
  return ((data ?? [])[0] as { id?: string } | undefined)?.id === run.id;
}

export async function insertLatestRunMessage(
  runId: string,
  userId: string,
  content: string,
  mentions: AssistantMention[] | null,
  messageId: string,
): Promise<"inserted" | "already" | "superseded"> {
  const { data, error } = await getServiceClient().rpc(
    "insert_latest_agent_run_message",
    {
      p_run_id: runId,
      p_message_id: messageId,
      p_user_id: userId,
      p_content: stripUnstorable(content),
      p_mentions: mentions?.length ? stripUnstorable(mentions) : null,
    },
  );
  if (error) throw new Error(`agent_run_messages insert failed: ${error.message}`);
  if (data === "inserted" || data === "already" || data === "superseded") {
    return data;
  }
  throw new Error(`agent_run_messages insert refused: ${String(data)}`);
}

export async function reserveRunInlineComment(
  runId: string,
  limit: number,
): Promise<number | null> {
  const { data, error } = await getServiceClient().rpc(
    "reserve_agent_pr_inline_comment",
    {
      p_run_id: runId,
      p_limit: limit,
    },
  );
  if (error) {
    console.error(
      "[agent-runs] inline comment reservation failed:",
      error.message,
    );
    return null;
  }
  const value = Array.isArray(data) ? data[0] : data;
  return typeof value === "number" ? value : null;
}

export async function releaseRunInlineComment(
  runId: string,
): Promise<number | null> {
  const { data, error } = await getServiceClient().rpc(
    "release_agent_pr_inline_comment",
    {
      p_run_id: runId,
    },
  );
  if (error) {
    console.error("[agent-runs] inline comment release failed:", error.message);
    return null;
  }
  const value = Array.isArray(data) ? data[0] : data;
  return typeof value === "number" ? value : null;
}

export type RunRepoBinding = Pick<
  AgentRun,
  "repo_link_id" | "connection_id" | "repo_provider" | "repo_external_id"
>;

export interface CurrentRepoBinding {
  id: string;
  connection_id: string;
  provider: string;
  external_repo_id: string;
}

/** Pure comparison used at every privileged repository boundary. */
export function repoBindingMatchesRun(
  run: RunRepoBinding,
  current: CurrentRepoBinding | null,
): boolean {
  const launchedWithoutRepository =
    run.repo_link_id === null &&
    run.connection_id === null &&
    run.repo_provider === null &&
    run.repo_external_id === null;
  if (launchedWithoutRepository) return current === null;
  if (!current) return false;
  return (
    current.id === run.repo_link_id &&
    current.connection_id === run.connection_id &&
    current.provider === run.repo_provider &&
    current.external_repo_id === run.repo_external_id
  );
}

/**
 * Re-read the project's repository binding without minting a forge token.
 * Failure is closed: a control-plane request must not inherit authority while
 * the binding store is unavailable or being changed.
 */
export async function runRepoBindingIsCurrent(
  run: RunRepoBinding & { project_id: string },
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("project_git_links")
    .select("id, connection_id, provider, external_repo_id")
    .eq("project_id", run.project_id)
    .maybeSingle();
  if (error) return false;
  return repoBindingMatchesRun(
    run,
    (data as CurrentRepoBinding | null) ?? null,
  );
}

/** Revalidate both the member and repository identities frozen on a run. */
export async function runAuthorityIsCurrent(
  run: RunRepoBinding & { project_id: string; created_by: string | null },
): Promise<boolean> {
  if (!run.created_by) return false;
  const [access, repositoryMatches] = await Promise.all([
    getProjectAccess(run.created_by, run.project_id),
    runRepoBindingIsCurrent(run),
  ]);
  return access !== null && repositoryMatches;
}

/**
 * The next turn a connected shell can claim (MIN-371).
 *
 * The machine only transmits projects for which it has a
 * local attachment. `created_by` keeps runs on the account that got them
 * requested: being a member of the same project does not allow the run to be executed
 * from a colleague on his Mac.
 *
 * This reading claims nothing. The CASE of `claimRun`, in the road, tiebreaker
 * the shells which would have seen the same line between this reading and the claim.
 */
export async function findQueuedLocalRunForMachine(input: {
  userId: string;
  projectIds: readonly string[];
  /** The session client applies RLS; the default serves internal calls. */
  client?: SupabaseClient;
}): Promise<AgentRun | null> {
  if (input.projectIds.length === 0) return null;

  const client = input.client ?? getServiceClient();
  let query = client
    .from("agent_runs")
    .select("*")
    .eq("status", "queued")
    .eq("local_exec", true)
    .eq("created_by", input.userId)
    .in("project_id", [...input.projectIds])
    .lte("not_before", new Date().toISOString());
  const scope = currentDeploymentScope();
  query =
    scope === null
      ? query.is("deployment_url", null)
      : query.eq("deployment_url", scope);

  const { data, error } = await query
    .order("not_before", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[agent-runs] local queue lookup failed:", error.message);
    return null;
  }
  return (data as AgentRun | null) ?? null;
}

/**
 * Fold to the cloud a local tour that this deployment cannot support.
 *
 * Guarding is as important as writing: between run selection and
 * this transition, another shell may have claimed it. In this case she has
 * won and we certainly do not change the environment under an already prepared turn.
 */
export async function declineQueuedLocalRun(
  runId: string,
): Promise<AgentRun | null> {
  const { data, error } = await getServiceClient()
    .from("agent_runs")
    .update({ local_exec: false, local_worktree: false })
    .eq("id", runId)
    .eq("status", "queued")
    .eq("local_exec", true)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error(
      `[agent-runs] local fallback failed on ${runId}:`,
      error.message,
    );
    return null;
  }
  return (data as AgentRun | null) ?? null;
}

/**
 * HOW TO JUDGE THE NATURE OF A RUN (MIN-360) — the four columns which say from where
 * its context comes, and nothing else.
 *
 * Read by issuing the lease ([local-exec.ts](local-exec.ts)), which must be able to
 * refuse BEFORE revoking. `null` when the line has disappeared: the caller draws
 * what he wants, and the lease will fail a little further anyway.
 */
export async function runLocalExecScopeRow(runId: string): Promise<{
  project_id: string;
  repo_link_id: string | null;
  connection_id: string | null;
  repo_provider: RepoProviderId | null;
  repo_external_id: string | null;
  triggered_by: string | null;
  routine_id: string | null;
  chain_id: string | null;
  pull_request_id: string | null;
  issue_id: string | null;
  local_issue_context_confirmed: boolean;
  created_by: string | null;
  local_exec_device_id: string | null;
} | null> {
  const { data } = await getServiceClient()
    .from("agent_runs")
    .select(
      "project_id, repo_link_id, connection_id, repo_provider, repo_external_id, triggered_by, routine_id, chain_id, pull_request_id, issue_id, local_issue_context_confirmed, created_by, local_exec_device_id",
    )
    .eq("id", runId)
    .maybeSingle();
  return (data as Awaited<ReturnType<typeof runLocalExecScopeRow>>) ?? null;
}

/**
 * TAKES LOCAL EXECUTION LEASE (MIN-355): increment `local_exec_gen` and render
 * the new generation, the one that the token will carry.
 *
 * It is the gesture of revocation as much as that of emission, and this is intended: a
 * self-bearing token is not remembered, it EXPIRES. Emitting the following is therefore
 * the only way to kill the previous one — hence “one machine per run”, which becomes
 * a property of the column rather than a rule that someone should make
 * respecter.
 *
 * COMPARE-AND-SWAP rather than a `col = col + 1`: Postgrest does not know how to write a
 * increment, and a read followed by a bare write would leave two emissions
 * simultaneous rendering of the SAME generation — therefore two valid machines on a run
 * which only admits one. The guard `.eq("local_exec_gen", …)` makes the second
 * Don't write anything and start again.
 *
 * `null` = this run is not a local run (keeps `local_exec`), or the line has
 * disappeared. A microVM run has no lease to give, and giving it one would be
 * exactly the hot environment toggle that frozen mode prohibits.
 */
export async function bumpLocalExecGen(input: {
  runId: string;
  userId: string;
  deviceId: string;
}): Promise<number | null> {
  const service = getServiceClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current } = await service
      .from("agent_runs")
      .select("local_exec, local_exec_gen")
      .eq("id", input.runId)
      .maybeSingle();
    const row = current as {
      local_exec?: boolean;
      local_exec_gen?: number;
    } | null;
    if (!row?.local_exec) return null;
    const next = (row.local_exec_gen ?? 0) + 1;
    const { data } = await service
      .from("agent_runs")
      .update({ local_exec_gen: next })
      .eq("id", input.runId)
      .eq("local_exec", true)
      .eq("created_by", input.userId)
      .eq("local_exec_device_id", input.deviceId)
      .eq("local_exec_gen", row.local_exec_gen ?? 0)
      .select("local_exec_gen")
      .maybeSingle();
    const written = (data as { local_exec_gen?: number } | null)
      ?.local_exec_gen;
    if (typeof written === "number") return written;
  }
  console.error(`[agent-runs] local exec lease contention on ${input.runId}`);
  return null;
}

/**
 * Most recent ACTIVE run that cites the outcome, or null. This is NOT a lock:
 * multiple independent conversations can work on the same ticket.
 * Historical readers who only want to paint “Numo is working on
 * this ticket” use this light representative.
 */
export async function activeRunForIssue(
  issueId: string,
): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("issue_id", issueId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/** Run ACTIVE of an automation chain. The ticket is no longer a lock:
 * several conversations can cite it, while a chain must follow
 * and interrupt only the execution that belongs to it. */
export async function activeRunForChain(
  chainId: string,
): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("chain_id", chainId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/**
 * Run ACTIVE (queued/running) of the PULL REQUEST, or null (MIN-168). Same rule
 * than for a ticket, for the same reason: two review sessions on the same
 * diff is twice the expense for twice the same opinion — and two sets of
 * comments on PR. The unique partial index `idx_agent_runs_active_pr` in
 * guarantees at most one; sorting + `limit(1)` remains the safeguard (`maybeSingle`
 * would raise instead of answering if previous data carried two).
 */
export async function activeRunForPullRequest(
  pullRequestId: string,
): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("pull_request_id", pullRequestId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/**
 * Run ACTIVE (queued/running) of the ROUTINE, or null (MIN-185). A routine does not
 * do not walk on it: a passage that drags (quota, slow sandbox) must not
 * to be overtaken by the next deadline — two parallel passages on the
 * same instruction, it's twice the expense for twice the same work,
 * and potentially two pull requests. The unique partial index
 * `idx_agent_runs_active_routine` en garantit au plus un.
 */
export async function activeRunForRoutine(
  routineId: string,
): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("routine_id", routineId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/**
 * The “Previous Executions” of a routine (MIN-185), the most recent in
 * head. This is THE only place where the runs of a routine can be read: they are
 * excluded from `/api/agent-runs`, therefore from the conversations column.
 */
export async function runsForRoutine(
  routineId: string,
  limit = 50,
): Promise<AgentRun[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("routine_id", routineId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AgentRun[];
}

/**
 * The LAST review session for this pull request, regardless of its status —
 * this is what the thread map and the Review menu show. `viewerId` is not
 * requested: unlike the old pass, a PR run is visible to everyone
 * the members of the project (see the MIN-168 policy).
 */
export async function latestRunForPullRequest(
  pullRequestId: string,
): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("pull_request_id", pullRequestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/**
 * The sha reread by the last COMPLETED review of this PR. Compared to the head
 * current by the screen: as long as they are equal, restarting would pay for a run
 * integer for exactly the same code.
 */
export async function lastReviewedShaForPullRequest(
  pullRequestId: string,
): Promise<string | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("pr_head_sha")
    .eq("pull_request_id", pullRequestId)
    .eq("status", "completed")
    .not("pr_head_sha", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { pr_head_sha?: string | null } | null)?.pr_head_sha ?? null;
}

/** Existing workspace explicitly taken over via a pull request. */
export interface InheritableWork {
  branchName: string;
  baseBranch: string | null;
  /** PR of the lineage, if one has been opened (the creation of PR is optional). */
  prNumber: number | null;
  prUrl: string | null;
  prState: AgentRun["pr_state"];
}

/**
 * Explicitly takes over the workspace of an existing pull request.
 *
 * The lineage is here indexed on the PULL REQUEST — that is to say on the runs which
 * bear its number in this repository (`pr_number`, the column that says “this run has
 * OPEN this PR"). A REREADING run never carries it (see MIN-168), it
 * therefore cannot be taken for a working lineage.
 *
 * Same rules as for the ticket: the most recent run which carries a branch wins,
 * and a PR `merged` is not resumed (the work is delivered).
 */
export async function inheritableWorkForPr(opts: {
  repoFullName: string;
  prNumber: number;
  provider: RepoProviderId;
}): Promise<InheritableWork | null> {
  const service = getServiceClient();
  const linkIds = await repoLinkIds(service, opts.repoFullName, opts.provider);
  if (linkIds.length === 0) return null;
  const { data } = await service
    .from("agent_runs")
    .select("branch_name, base_branch, pr_number, pr_url, pr_state")
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds)
    .not("branch_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as {
    branch_name: string | null;
    base_branch: string | null;
    pr_number: number | null;
    pr_url: string | null;
    pr_state: AgentRun["pr_state"];
  } | null;
  if (!row?.branch_name) return null;
  if (row.pr_state === "merged") return null;
  return {
    branchName: row.branch_name,
    baseBranch: row.base_branch,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prState: row.pr_state,
  };
}

/**
 * Run ACTIVE (queued/running) carrying this PR, or null (MIN-292). This is the rule
 * “one agent at a time” written for a lineage WITHOUT a ticket: without it,
 * two relaunches on the same pull request would push on the same branch in
 * parallel. No single index guarantees it as a base (book runs do not have one).
 * not) — this reading is therefore the guard, not a safeguard.
 */
export async function activeRunForPrNumber(opts: {
  repoFullName: string;
  prNumber: number;
  provider: RepoProviderId;
}): Promise<AgentRun | null> {
  const service = getServiceClient();
  const linkIds = await repoLinkIds(service, opts.repoFullName, opts.provider);
  if (linkIds.length === 0) return null;
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? []) as AgentRun[])[0] ?? null;
}

/**
 * Has an OLDER run of the issue already worked this branch?
 * Distinguishes, at the start of a run without checkpoint, an INHERITANCE branch (it carries
 * the work of a previous session → inheritance message) of the NEW branch
 * a first chunk re-attempted after crash (generated then stamped by the dead chunk,
 * without any past — a message of heritage would be misleading).
 */
export async function branchHasPriorRun(
  issueId: string,
  branchName: string,
  beforeCreatedAt: string,
): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("id")
    .eq("issue_id", issueId)
    .eq("branch_name", branchName)
    .lt("created_at", beforeCreatedAt)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/**
 * Summary of the previous run of the outcome (its `outcome` = the LAST RESPONSE of
 * the agent, cape). Injected in the START prompt of a cold run: it does not inherit
 * of any checkpoint, this summary is its only link with what has been done before.
 * Excludes the current run. Restricted to `completed` runs with a `outcome`.
 */
export async function previousRunSummaryForIssue(
  issueId: string,
  excludeRunId: string,
): Promise<string | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("outcome")
    .eq("issue_id", issueId)
    .neq("id", excludeRunId)
    .eq("status", "completed")
    .not("outcome", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const outcome = (data as { outcome?: string | null } | null)?.outcome ?? null;
  return outcome?.trim() ? outcome.trim() : null;
}

/**
 * Summary of the previous run of a PULL REQUEST (MIN-292) — same role as
 * `previousRunSummaryForIssue`, for a lineage which does not have a ticket: without it,
 * a relaunch on a notebook PR would leave without the slightest link with what
 * the previous session did, and would tell the agent about it as a first day.
 */
export async function previousRunSummaryForPr(
  opts: {
    repoFullName: string;
    prNumber: number;
    provider: RepoProviderId;
  },
  excludeRunId: string,
): Promise<string | null> {
  const service = getServiceClient();
  const linkIds = await repoLinkIds(service, opts.repoFullName, opts.provider);
  if (linkIds.length === 0) return null;
  const { data } = await service
    .from("agent_runs")
    .select("outcome")
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds)
    .neq("id", excludeRunId)
    .eq("status", "completed")
    .not("outcome", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const outcome = (data as { outcome?: string | null } | null)?.outcome ?? null;
  return outcome?.trim() ? outcome.trim() : null;
}

/**
 * THE NULL BYTE, REMOVED BEFORE THE BASE (MIN-286) — and this is not hygiene,
 * it's a trick of an agent who dies.
 *
 * Postgres does not know how to store `\u0000` in a string, nor in `text` nor in a
 * `jsonb`: the entire write is refused, with `unsupported Unicode escape
 * sequence`. But what we write comes from a MODEL and its shell — the
 * output of a command that reads a binary, log file truncated in the middle
 * of a character, the opencode event log that carries them. Only one
 * of these bytes and it is the LINE which is no longer written: no more saving of
 * checkpoint, so no more heartbeat, and the end of turn report
 * refused him too. Lived in production on 2026-08-12 (runs `66023558`,
 * `a8051d06`): the trick froze, the thread remained “in progress”, and the dog
 * guard ended up putting the run away as “the process has stopped”.
 *
 * We REMOVE it rather than refusing the write: this byte has no value
 * for a human reader nor for the model, and losing it costs infinitely less
 * than lose the turn. Isolated surrogate substitutes fall with, for the
 * same reason — `JSON.parse` on the Postgres side refuses them just as much.
 */
const NUL_AND_LONE_SURROGATES =
  // oxlint-disable-next-line no-control-regex
  /[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripUnstorable<T>(value: T): T {
  if (typeof value === "string") {
    // `replace` resets `lastIndex` to zero, `test` NO: probing first would
    // skip every other character from one string to another.
    return value.replace(NUL_AND_LONE_SURROGATES, "") as T;
  }
  if (Array.isArray(value))
    return value.map((item) => stripUnstorable(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = stripUnstorable(item);
    }
    return out as T;
  }
  return value;
}

export interface StampFields {
  status?: AgentRunStatus;
  checkpoint?: AgentCheckpoint | null;
  continuations?: number;
  attempts?: number;
  not_before?: string;
  sandbox_id?: string | null;
  base_branch?: string | null;
  branch_name?: string | null;
  pr_number?: number | null;
  pr_url?: string | null;
  pr_state?: AgentRun["pr_state"];
  /** Sha reread by a proofreading session, failed on the forge at the beginning. */
  pr_head_sha?: string | null;
  cost_usd?: number;
  outcome?: string | null;
  error_message?: string | null;
  last_activity_at?: string;
  interrupt_requested?: boolean;
  sandbox_stopped_at?: string | null;
  awaiting_input?: boolean;
  /** Verdict of a string verification step (tool `report_verdict`). */
  verdict?: AgentRunVerdict | null;
  /** LLM key of the run to be revoked (MIN-223). */
  provider_key_id?: string | null;
  /** Command that carries the loop in the microVM (MIN-224). */
  loop_command_id?: string | null;
  /** Incremented when authority is revoked so every local token dies immediately. */
  local_exec_gen?: number;
}

/**
 * Updates a run while keeping the transition (`.in('status', guard)`, default
 * ['running']): a canceled/already finished run is never rewritten by a chunk in
 * delay. Returns the updated run, or null if the guard did not match.
 *
 * Null also covers failure (lost guard, duress, basic breakdown). We
 * trace au lieu de l'avaler en silence : un appelant
 * who ignores the null would believe the run to be restarted when it never will be.
 */
export async function stampRun(
  runId: string,
  fields: StampFields,
  opts?: {
    guard?: AgentRunStatus[];
    expected?: Partial<
      Record<
        "started_at" | "last_activity_at" | "loop_command_id" | "sandbox_id",
        string | null
      >
    >;
  },
): Promise<AgentRun | null> {
  return (await stampRunResult(runId, fields, opts)).run;
}

/**
 * THE SAME STAMP, BUT WHO SAYS WHY HE DIDN'T WRITE (MIN-286).
 *
 * `null` covers two things that nothing distinguishes, and which call for
 * opposing conducts: **the guard did not match** (someone concluded this run —
 * must stop) and **write failed** (basic failure, null byte, cut
 * network — you have to try again). The control plan returned 409 in both cases,
 * and the supervisor reads a 409 like “the run no longer exists”: a backup of
 * checkpoint refused by the base KILLED the current round, silently and without
 * that he has done nothing wrong. Lived in production on 2026-08-12.
 */
export async function stampRunResult(
  runId: string,
  fields: StampFields,
  opts?: {
    guard?: AgentRunStatus[];
    expected?: Partial<
      Record<
        "started_at" | "last_activity_at" | "loop_command_id" | "sandbox_id",
        string | null
      >
    >;
  },
): Promise<{ run: AgentRun | null; failed: boolean }> {
  const service = getServiceClient();
  const guard = opts?.guard ?? ["running"];
  let query = service
    .from("agent_runs")
    // What we write here comes from the model and its shell (checkpoint, summary,
    // error message): a null byte in it would cause the ENTIRE line to be refused.
    .update(stripUnstorable(fields))
    .eq("id", runId)
    .in("status", guard);
  for (const [column, expected] of Object.entries(opts?.expected ?? {})) {
    query =
      expected === null ? query.is(column, null) : query.eq(column, expected);
  }
  const { data, error } = await query.select("*").maybeSingle();
  if (error) {
    console.error(
      `[agent-runs] stampRun ${runId} → ${fields.status ?? "(fields)"} failed:`,
      error.message,
    );
  }

  // End of run (MIN-78). Tracked here and not in the execution loop: this is
  // the mandatory transition to a terminal status, and the `.in(status, guard)`
  // guarantees that only one update wins, even if several chunks try to finish.
  //
  // Check the requested status as well as the returned row. Some cleanup writes
  // deliberately target an already-terminal run (for example, clearing its
  // provider key). Treating those writes as fresh endings repeats analytics and
  // routine notifications.
  const run = (data as AgentRun | null) ?? null;
  const enteredTerminalStatus =
    fields.status != null && TERMINAL_RUN_STATUSES.has(fields.status);
  if (run && enteredTerminalStatus && TERMINAL_RUN_STATUSES.has(run.status)) {
    captureServerEvent({
      distinctId: run.created_by ?? "agent:system",
      event:
        run.status === "completed" ? "agent_run_completed" : "agent_run_failed",
      properties: {
        status: run.status,
        model: run.model ?? "default",
        key_mode: run.key_mode,
        triggered_by: run.triggered_by,
        scope: runScope(run),
        opened_pr: run.pr_number != null,
        duration_bucket: run.created_at
          ? durationBucket(Date.now() - Date.parse(run.created_at))
          : "unknown",
        project_id: run.project_id,
      },
      groups: { project: run.project_id },
    });
    // Automations (MIN-147): the same mandatory transition serves as the run-end
    // hook. Every completion path converges here, and the transition guard above
    // ensures that only one wins, so a chain advances only once. Steering back to
    // `queued` is non-terminal and therefore excluded.
    if (run.chain_id) notifyChainOfRunEnd(run);
    // The same mandatory transition handles routines (MIN-185): the owner learns
    // that a pull request is ready or that the run failed, and the routine retains
    // the outcome of its latest run.
    //
    // Use `afterOrNow`, not a detached promise: the HTTP response can finish before
    // these writes, and an unretained promise can die with the invocation (see
    // lib/server/after-safe.ts).
    if (run.routine_id) {
      afterOrNow(async () => {
        await notifyRoutineOfRunEnd(run);
        await stampRoutineRunEnd(run);
      });
    }
  }
  return { run, failed: !!error };
}

/**
 * Inbox (MIN-82): warns the LAUNCHER of the run — question asked, round completed,
 * failure. This is the only place where “notifying oneself” is desired: the actor
 * is the agent, not the user. `replaceUnread` keeps at most one
 * agent notification not read by ticket (a long session does not stack a
 * “finished” per turn). Best effort — never breaks the run.
 */
export async function notifyAgentRun(
  run: {
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
    conversation_id: string;
    routine_id?: string | null;
  },
  type: "agent_done" | "agent_question" | "agent_failed",
): Promise<void> {
  // Routine endings have their own target and preference category. Sending the
  // generic conversation notification as well creates a second inbox row and push.
  if (!run.created_by || run.routine_id) return;
  try {
    await insertNotifications(
      getServiceClient(),
      [
        {
          user_id: run.created_by,
          project_id: run.project_id,
          type,
          issue_id: run.issue_id,
          agent_conversation_id: run.conversation_id,
          actor_id: null,
        },
      ],
      { replaceUnread: true },
    );
  } catch (e) {
    console.error("[agent-runs] notify failed:", (e as Error).message);
  }
}

/** Run affected by a PR sync (to align the issue status on the calling side).
    `issueId` null = run notebook: no issue to align. */
export interface SyncedPrRun {
  id: string;
  issueId: string | null;
  createdBy: string | null;
  /** Supporting project — the inbox notification needs it to tidy up the line. */
  projectId: string;
  /** PR state copied atomically from the current pull_requests row. */
  prState: AgentRun["pr_state"];
}

/** Columns read by the two run resolutions of a PR (`findRunsForPr` and
    `syncPrState`) — to keep aligned with `SyncedPrRun`. */
const SYNCED_PR_RUN_COLUMNS =
  "id, issue_id, created_by, project_id, pr_state";

interface RawSyncedPrRun {
  id: string;
  issue_id: string | null;
  created_by: string | null;
  project_id: string;
  pr_state: AgentRun["pr_state"];
}

function toSyncedPrRun(r: RawSyncedPrRun): SyncedPrRun {
  return {
    id: r.id,
    issueId: r.issue_id,
    createdBy: r.created_by,
    projectId: r.project_id,
    prState: r.pr_state,
  };
}

/** Ids of project↔deposit links for `repoFullName` (a PR number is unique
    by deposit; several projects can link the same repository). Filtered by
    PROVIDER (MIN-69): `owner/name` is ONLY unique by forge — without this filter,
    a GitLab webhook for `acme/app` would buffer runs from a GitHub repository
    homonym (mirrors, migrated forks), and vice versa. */
async function repoLinkIds(
  service: ReturnType<typeof getServiceClient>,
  repoFullName: string,
  provider: RepoProviderId,
): Promise<string[]> {
  const { data: links } = await service
    .from("project_git_links")
    .select("id")
    .eq("repo_full_name", repoFullName)
    .eq("provider", provider);
  return ((links ?? []) as Array<{ id: string }>).map((l) => l.id);
}

/**
 * Runs having opened PR `prNumber` on repository `repoFullName` (read only,
 * without touching the PR state). Used by the GitHub reviews webhook, which should
 * find the linked outcome without modifying the draft/open/merged/closed cycle.
 */
export async function findRunsForPr(opts: {
  repoFullName: string;
  prNumber: number;
  provider: RepoProviderId;
}): Promise<SyncedPrRun[]> {
  const service = getServiceClient();
  const linkIds = await repoLinkIds(service, opts.repoFullName, opts.provider);
  if (linkIds.length === 0) return [];
  const { data: runs } = await service
    .from("agent_runs")
    .select(SYNCED_PR_RUN_COLUMNS)
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds);
  return ((runs ?? []) as RawSyncedPrRun[]).map(toSyncedPrRun);
}

/**
 * Synchronizes the PR state of runs that opened PR `prNumber` on the repository
 * `repoFullName` (called by the GitHub webhook). Best-effort. Return runs
 * touched for the caller to align the status of their issue (in_review / done /
 * canceled).
 */
export async function syncPrState(opts: {
  repoFullName: string;
  prNumber: number;
  prState: AgentRun["pr_state"];
  prUrl?: string | null;
  provider: RepoProviderId;
}): Promise<SyncedPrRun[]> {
  const service = getServiceClient();
  const linkIds = await repoLinkIds(service, opts.repoFullName, opts.provider);
  if (linkIds.length === 0) return [];
  // Read and copy the PR row inside one database transaction. A delayed caller
  // can never write the state it observed earlier over a newer webhook/action.
  const { error } = await service.rpc("sync_agent_runs_from_pull_request", {
    p_provider: opts.provider,
    p_repo_full_name: opts.repoFullName,
    p_number: opts.prNumber,
  });
  if (error) {
    console.error("[agent-runs] PR state sync failed:", error.message);
    return [];
  }
  const { data: runs } = await service
    .from("agent_runs")
    .select(SYNCED_PR_RUN_COLUMNS)
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds);
  return ((runs ?? []) as RawSyncedPrRun[]).map(toSyncedPrRun);
}

/**
 * Adds a user message to the steering queue of a run (drained by the
 * loop at the border of round). Customer service — the endpoint authenticates before.
 */
export async function insertRunMessage(
  runId: string,
  userId: string | null,
  content: string,
  mentions?: AssistantMention[] | null,
  messageId: string = randomUUID(),
): Promise<string> {
  const service = getServiceClient();
  const { error } = await service.from("agent_run_messages").upsert(
    {
      id: messageId,
      run_id: runId,
      created_by: userId,
      content: stripUnstorable(content),
      // The labels of mentions come from titles and names: they go through
      // the same filter as the text, otherwise a null byte in it would cause it to be refused
      // the jsonb insert — and the message with it.
      ...(mentions?.length ? { mentions: stripUnstorable(mentions) } : {}),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  // A refused insert (RLS, constraint, null byte) returns in `{ error }` without
  // raise: without this check, the route responded `ok` on a message that
  // NO ONE had lined up — accepted on screen, never played, disappeared at
  // reloading. The caller makes an HTTP error, so a bubble removed and
  // a pattern on the screen.
  if (error)
    throw new Error(`agent_run_messages insert failed: ${error.message}`);
  return messageId;
}

/**
 * Drains (atomically) the unconsumed steering messages from a run:
 * mark consumed and returns their content, chronological order. Called to the SUMMIT
 * of each round of the loop. A run has only ONE writer at a time (the claimer).
 */
export async function pullPendingMessages(
  runId: string,
): Promise<AgentUserMessage[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_run_messages")
    .update({ consumed_at: new Date().toISOString() })
    .eq("run_id", runId)
    .is("consumed_at", null)
    .select("id, content, mentions, created_at");
  /**
   * A DRAIN THAT FAILS IS SAYING. This `return []` means “no one has anything for you
   * written » to the calling turn: a missing column (migration not yet
   * thrust), EPIRB, failure — and user messages
   * disappear silently, while they are STILL in line, uneaten.
   * The symptom is the most confusing of the product: “it does not respond to me”, without
   * a line nowhere.
   */
  if (error) {
    console.error("[agent-runs] pullPendingMessages failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (
    data as Array<{
      id: string;
      content: string;
      mentions?: AssistantMention[] | null;
      created_at: string;
    }>
  )
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => ({
      id: r.id,
      text: r.content,
      ...(r.mentions?.length ? { mentions: r.mentions } : {}),
    }));
}

/** Restores a message drained by a supervisor that could not deliver it. */
export async function requeueRunMessage(
  runId: string,
  message: AgentUserMessage,
): Promise<void> {
  if (message.id) {
    const { data, error } = await getServiceClient()
      .from("agent_run_messages")
      .update({ consumed_at: null })
      .eq("id", message.id)
      .eq("run_id", runId)
      .select("id")
      .maybeSingle();
    if (error)
      throw new Error(`agent_run_messages requeue failed: ${error.message}`);
    if (data) return;
  }
  await insertRunMessage(
    runId,
    null,
    message.text,
    message.mentions,
    message.id,
  );
}

/**
 * Refreshes the run inactivity clock (client heartbeat, steer, input to
 * rest). Best-effort. Prevents the reaper from cutting the sandbox while in use.
 *
 * NEVER ON A RUN THAT WORKS, and that’s the whole point of this line.
 * `last_activity_at` is used for TWO readers, on two disjoint populations
 * ([drain.ts](drain.ts)): the inactivity reaper, which only looks at AU runs
 * REST, and the microVM watchdog, which only watches `running` runs.
 * A bump while the run is working therefore brings nothing to the first - and it
 * BLIND the second: the conversation opened in a tab beats every 45 s,
 * the watchdog only probes after three minutes of silence, and a turn of which
 * the process died remained `running` forever as long as someone
 * looked. That is to say exactly when we looked at him the most — impossible to
 * stop, unguideable, and deleted by hand in production.
 *
 * On a `running` run, this field therefore has only one writer: the loop
 * itself (its periodic checkpoint backup, cf. `control-plane.ts`).
 */
export async function bumpRunActivity(runId: string): Promise<void> {
  try {
    const service = getServiceClient();
    await service
      .from("agent_runs")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", runId)
      .neq("status", "running");
  } catch (err) {
    console.error(
      "[agent-runs] bumpRunActivity failed:",
      (err as Error).message,
    );
  }
}

/**
 * DID ANYONE OTHER THAN ITS CREATOR SPEAK TO THIS RUN? (MIN-326)
 *
 * Any member of the project can resume a hot run
 * ([steer](../../../app/api/agent-runs/[runId]/steer/route.ts)): the tour starts again
 * then on the instructions of a third party, but with the identity of the CREATOR - whose
 * notebook is personal. This is the question that the control plan asks
 * before opening the notebook.
 *
 * It concerns the LIFE OF THE RUN and not the current round: an instruction remains
 * in the conversation history and also governs subsequent turns.
 *
 * A failed read responds `true` — the notebook closes rather than opening
 * on a doubt. This is the only sure meaning: the worst case is a tool which refuses, not
 * someone's private note rewritten by a colleague's agent.
 */
export async function runSteeredByOther(
  runId: string,
  ownerId: string,
): Promise<boolean> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_run_messages")
    .select("id")
    .eq("run_id", runId)
    .not("created_by", "is", null)
    .neq("created_by", ownerId)
    .limit(1);
  if (error) {
    console.error("[agent-runs] runSteeredByOther failed:", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

/**
 * Requests the interruption of the current response (“Stop”). Only place the flag
 * on a WORKING run (queued/running) — the active chunk reads it and suspends
 * proprement au repos. N'annule rien, ne touche ni checkpoint ni sandbox.
 */
export async function requestInterrupt(runId: string): Promise<void> {
  const service = getServiceClient();
  await service
    .from("agent_runs")
    .update({ interrupt_requested: true })
    .eq("id", runId)
    .in("status", ["queued", "running"]);
}

/** Reads the interrupt flag (poll via loop: round boundary + stream). */
export async function readInterruptFlag(runId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("interrupt_requested")
    .eq("id", runId)
    .maybeSingle();
  return Boolean(
    (data as { interrupt_requested?: boolean } | null)?.interrupt_requested,
  );
}

/** Resets the interrupt flag (once consumed by the executor). */
export async function clearInterrupt(runId: string): Promise<void> {
  const service = getServiceClient();
  await service
    .from("agent_runs")
    .update({ interrupt_requested: false })
    .eq("id", runId);
}

/**
 * Are there any UNconsumed steering messages remaining? Used to decide, at the end of
 * turn, if it is necessary to RE-QUEUE (a message arrived during the finalization phase,
 * after the last round boundary, would otherwise only be processed in action
 * next user).
 */
export async function hasPendingRunMessages(runId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_run_messages")
    .select("id")
    .eq("run_id", runId)
    .is("consumed_at", null)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Postgres uniqueness violation — here, `idx_agent_run_events_run_seq`. */
const UNIQUE_VIOLATION = "23505";
/**
 * Recalculations of `seq` on collision. Two senders (the parent and a subagent,
 * MIN-112) can read the same max(seq) and try the same number: the loser
 * recalculates. Three covers largely cover the real parallelism (at most
 * a few subagents), and the counter can only UP — each loop of the loop
 * rereads a maximum already advanced by the winner.
 */
const APPEND_EVENT_MAX_ATTEMPTS = 4;

/**
 * Adds an event to the live view stream (monotonic seq per run). Best effort:
 * followed should never cause the run to fail.
 *
 * `seq` is calculated by READING the max then inserting, and `idx_agent_run_events_run_seq`
 * is UNIQUE. It was safe as long as the loop transmitted serially; since the
 * subagents (MIN-112), a daughter transmits AT THE SAME TIME as her parent — even max read,
 * even `seq` attempted, insert refused, event SWALLOWED (the code logged and returned control).
 * Hence the recovery on uniqueness violation. The second safeguard is with the appellant:
 * `execute.ts` serializes the emits of a chunk behind a chain of promises, to
 * que l'ORDRE du fil reste celui des faits — cette reprise-ci ne garantit que de ne
 * rien PERDRE, pas l'ordre.
 *
 * The inserted line is also BROADCAST on the run topic (lib/server/agent/live)
 * : the open thread displays it now rather than at the next poll. The `returning`
 * of the insert gives it without additional round trip.
 */
export async function appendEvent(
  runId: string,
  type: AgentEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const service = getServiceClient();
    for (let attempt = 0; attempt < APPEND_EVENT_MAX_ATTEMPTS; attempt++) {
      const { data } = await service
        .from("agent_run_events")
        .select("seq")
        .eq("run_id", runId)
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSeq = ((data as { seq: number } | null)?.seq ?? -1) + 1;
      // supabase-js does not RISK on a refused insert (CHECK constraint, RLS…) — it
      // returns { error }. Without this log, a type of event not declared in the CHECK
      // of agent_run_events disappears in total silence (experienced on `question`, MIN-86).
      const { data: row, error } = await service
        .from("agent_run_events")
        // Same guard as `stampRun`: the payload of a `tool_result` carries the
        // output of a model command, where a null byte slips in by itself.
        .insert({
          run_id: runId,
          seq: nextSeq,
          type,
          payload: stripUnstorable(payload),
        })
        .select("id, seq, type, payload, created_at")
        .single();
      if (error) {
        // `seq` already taken by another transmitter: we reread the max and try again.
        // Any other refusal (CHECK on `type`, RLS) is final — try again
        // identically would give the same error.
        if (
          (error as { code?: string }).code === UNIQUE_VIOLATION &&
          attempt < APPEND_EVENT_MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        console.error(
          `[agent-runs] appendEvent(${type}) rejected:`,
          error.message,
        );
        return;
      }
      if (row) {
        broadcastRunEvent(
          runId,
          row as Parameters<typeof broadcastRunEvent>[1],
        );
      }
      return;
    }
  } catch (err) {
    console.error("[agent-runs] appendEvent failed:", (err as Error).message);
  }
}

/**
 * THE LOG OF AN OPENCODE SESSION (MIN-286) — written in APPEND, never proofread
 * to be rewritten.
 *
 * One batch per incremental export. This is what makes the memory of a session
 * independent of the size of an HTTP body: the supervisor only sends what
 * is new, and the table keeps it.
 */
export async function appendRunJournal(
  runId: string,
  sessionId: string,
  events: Record<string, unknown>[],
): Promise<void> {
  if (!sessionId || events.length === 0) return;
  const service = getServiceClient();
  const { error } = await service.from("agent_run_journal").insert({
    run_id: runId,
    session_id: sessionId,
    events: stripUnstorable(events),
  });
  if (error)
    throw new Error(`agent_run_journal insert failed: ${error.message}`);
}

/**
 * The journal of a session, collected in writing order.
 *
 * Filtered on the SESSION: a session reset (resumption impossible) written
 * under a new id, and the lots from the old one must not be replayed by-
 * above. Retention will take them with the run.
 */
export async function loadRunJournal(
  runId: string,
  sessionId: string,
): Promise<Record<string, unknown>[]> {
  if (!sessionId) return [];
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_run_journal")
    .select("events")
    .eq("run_id", runId)
    .eq("session_id", sessionId)
    .order("id", { ascending: true });
  if (error) {
    // An illegible log costs RESTART, not the turn: the supervisor
    // will start with a new session, and he will say it over time.
    console.error("[agent-runs] loadRunJournal failed:", error.message);
    return [];
  }
  return ((data ?? []) as Array<{ events: Record<string, unknown>[] }>).flatMap(
    (row) => row.events ?? [],
  );
}
