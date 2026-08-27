import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { joinedPage } from "@/lib/server/resource-select";
import { recordSandboxUsage } from "@/lib/server/usage";
import { spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";
import { resolveRepoCloneTarget, type RepoCloneTarget } from "./repo-access";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { getGithubBotCommitIdentity } from "@/lib/server/git/github-app";
import { getOrCreateAgentSandbox, sandboxHost, sandboxName, type Sandbox } from "./sandbox";
import { SelfHostedSandbox } from "./self-hosted-sandbox";
import { cloudLayout } from "./harness-layout";
import { cloneRepo, clonePullRequest, revParseHead, repoBackgroundRunner } from "./repo-host";
import { BackgroundJobs } from "./background";
import { scopeSubagentModels } from "./subagent-config";
import { getSubagentFavorites, maxParallelSubagents } from "./subagent-app-config";
import { getAgentModelsForUser } from "./models-catalog";
import { SecretRedactor } from "./redact";
import { readRepoInstructions, REPO_INSTRUCTION_FILES, type InstructionsState } from "./repo-instructions";
import type { AgentChatMessage, EmitAgentEvent } from "./agent-contract";
import { isWebSearchEnabled, MAX_WEB_SEARCHES_PER_TURN } from "@/lib/server/web-search";
import {
  buildAgentContextMessage,
  buildNotebookContextMessage,
  buildInheritedPrMessage,
  buildInheritedBranchMessage,
  buildPrReviewContextMessage,
  toPrLineThreads,
  type AgentAnchor,
  type AgentRepoContext,
  type AgentResourceContext,
} from "./prompt";
import { buildOpencodeAnchor } from "./opencode-anchor";
import { executionPolicyFor } from "./policy";
import { promptWithMentions } from "@/lib/agent-mentions";
import { loadPrReviewBoot, loadPrRunContext, pullRequestHeadRef, pullRequestLocalBranch } from "./pr-run";
import {
  resolveAgentApiKey,
  getModelContextWindow,
  getModelInputPrice,
  getModelPricing,
  supportsImageInput,
} from "./model";
import { agentSandboxName, buildAgentNetworkPolicy, AGENT_LLM_PLACEHOLDER_KEY } from "./network-policy";
import { startVmLoop } from "./vm-launch";
import {
  isCurrentRepoJob,
  VM_PROTOCOL_VERSION,
  type VmJob,
} from "./vm/protocol";
import { mintRunKey, revokeRunKey, runKeyCapUsd } from "./run-key";
import { agentControlOrigin } from "./origin";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { priorConversationLostNote } from "@/lib/server/runtime-locale-copy";
import { forgeFor, type Forge } from "./forge";
import { prStateFromRef } from "./pull-requests";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  resolveRunPrefs,
  prTerm,
  SANDBOX_USAGE_SEQ_BASE,
} from "./pr-landing";
import {
  stampRun,
  appendEvent,
  previousRunSummaryForIssue,
  previousRunSummaryForPr,
  branchHasPriorRun,
  clearInterrupt,
  hasPendingRunMessages,
  loadRunJournal,
  notifyAgentRun,
  runAuthorityIsCurrent,
  type AgentRun,
} from "./runs";
import { checkAgentQuota } from "./quota";
import { generatedAgentBranchName } from "./branch-name";
import { resolveServerExecSecret, signServerExecToken } from "./server-exec-token";
import { resolveAgentExecutionTarget } from "@/lib/agent-execution-target";

function repoTargetMatchesRun(run: AgentRun, target: RepoCloneTarget): boolean {
  return (
    target.linkId === run.repo_link_id &&
    target.connectionId === run.connection_id &&
    target.provider === run.repo_provider &&
    target.externalRepoId === run.repo_external_id
  );
}

function runWasLaunchedWithoutRepository(run: AgentRun): boolean {
  return (
    run.repo_link_id === null &&
    run.connection_id === null &&
    run.repo_provider === null &&
    run.repo_external_id === null
  );
}

/** The tightest of the provided ceilings (omitted values impose no limit). */
function minDefined(...values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => v != null && Number.isFinite(v));
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

/**
 * Executes ONE chunk of an agent RUN (MIN-46 + MIN-68, CONVERSATIONAL model).
 * Wakes up (persistent snapshot) or clones the Sandbox, rehydrates the checkpoint,
 * runs the loop until the soft deadline, then:
 * - suspended → commit+push WIP, checkpoint persisted, run re-`queued` (continues
 * the round, in process or via auto-invoke);
 * - completed → end of a NATURAL round (the agent responded): commit+push of what
 * has changed. NO PR is created here — if the session already follows one, the
 * push has updated it (and we REOPEN it if it had been refused); creating one is
 * the decision of the agent (tool `create_pr`) or the user. Run → `completed` (idle).
 * - interrupted / LLM error → same idle `completed` (checkpoint kept,
 * error_message if applicable): the session simply waits for the next user message.
 * When idle, a session NO LONGER blocks the ticket: only queued/running count
 * as "an agent is working". It remains HOT and resumable from the conversation
 * composer (checkpoint + snapshot preserved).
 * Only a BOOT error (repo/model) → `failed`. The drain calls after claiming.
 */

/**
 * Git identity of agent commits, depending on the forge. On the GitHub side we commit under
 * the App bot (`<slug>[bot]`, attachable to a real GitHub account) — otherwise the
 * Vercel author control blocks the deployment. Elsewhere, generic identity.
 */
async function resolveCommitterIdentity(
  target: RepoCloneTarget,
): Promise<{ name: string; email: string }> {
  if (target.provider === "github") {
    return getGithubBotCommitIdentity(target.token);
  }
  return defaultCommitterIdentity();
}

function defaultCommitterIdentity(): { name: string; email: string } {
  return { name: `${SITE_NAME} agent`, email: CONTACT_EMAIL };
}

/** Terminal state of the “message waiting” re-queue on a mid-turn error (final catch):
 `attempts` (incremented at each claim) is not reset to zero on this path,
 so a persistent error stops after this many claims. */
const MAX_ERROR_REQUEUE_ATTEMPTS = 2;
/**
 * What an executor call did to the run.
 *
 * `detached` (MIN-224) is the fifth, and it is unlike any of the others:
 * the round is neither finished nor suspended; it RUNS — in the microVM, outside this
 * invocation. The run remains `running` and no one is waiting for it. The drain reads
 * this value, and it tells the drain to "go to the next one".
 */
export type ExecuteOutcome =
  | "completed"
  | "suspended"
  | "interrupted"
  | "failed"
  | "detached";

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/**
 * A CONVERSATION THAT NO ONE CAN READ AGAIN (MIN-286) — the only remnant of
 * the home loop after its deletion.
 *
 * The two engines did not keep their memory in the same place:
 * `checkpoint.messages` for the loop, `checkpoint.opencode` for the
 * event log. A run led by the loop, resumed today, therefore leaves opencode with an
 * EMPTY log. There is nothing to save there — the format has no translator, and writing
 * one for conversations closed since August 10 is not worth the code.
 *
 * What is not acceptable, however, is to keep it quiet: the model would believe it was
 * continuing an exchange it never read, and the user would see an agent with amnesia
 * without knowing why. So we SAY it in the turn prompt — that is exactly where the
 * harness voice is, and the model speaks about it for itself.
 */
function priorConversationLost(run: AgentRun): boolean {
  const saved = run.checkpoint;
  return !!saved?.messages?.length && !saved.opencode;
}

/** Localized sentence read by a resumed turn whose old history is unavailable. */
const PRIOR_CONVERSATION_LOST_NOTE = priorConversationLostNote;

/**
 * THE PROMPT OF AN OPENCODE TURN, taken from the primer (MIN-286).
 *
 * The initiation of a cold turn is CONVERSATIONAL: a system prompt, then
 * user messages — context of the ticket or pull request, work inherited
 * from a PR, repository instructions, and lastly the launcher request. Opencode
 * only accepts one message: we therefore return these pieces, in order, separated
 * as blocks.
 *
 * The SYSTEM message is deliberately left aside: its counterpart at opencode
 * is the anchor used in `instructions` (see `buildOpencodeAnchor`), and sending it
 * here as well would say it twice, once in the system and once in the user's mouth.
 */
function userPromptFromMessages(messages: AgentChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : // A primer only has text (the images arrive via the tools); this
          // fallback ensures that “[object Object]” is never rendered in a template.
          (m.content ?? [])
            .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
            .join(""),
    )
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");
}










interface IssueContext {
  identifier: string;
  title: string;
  description: string | null;
  plan: string | null;
  projectName: string | null;
  projectKey: string;
  /** Resources of the issue (and its comments) — announced in the primer
   * so the agent knows they exist and opens files or links via `read_resource`. */
  resources: AgentResourceContext[];
}

async function loadIssueContext(
  run: AgentRun,
  issueId: string,
  opts: { includePromptContext?: boolean } = {},
): Promise<IssueContext> {
  const service = getServiceClient();
  const includePromptContext = opts.includePromptContext !== false;
  const [{ data: issue }, { data: project }, { data: attachmentRows }] = await Promise.all([
    service
      .from("issues")
      // A resumed opencode session already has its start in its local database.
      // Rereading neither the long markdown nor the plan can influence your next one
      // prompt; it was transport and decoding before each first token.
      .select(includePromptContext ? "number, title, description, plan" : "number, title")
      .is("deleted_at", null)
      .eq("id", issueId)
      .maybeSingle(),
    service.from("projects").select("key, name").eq("id", run.project_id).maybeSingle(),
    includePromptContext
      ? service
          .from("attachments")
          .select(
            "id, kind, page_id, file_name, mime_type, size_bytes, page:pages(title)",
          )
          .eq("issue_id", issueId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const key = (project as { key?: string } | null)?.key ?? "ISSUE";
  const number = (issue as { number?: number } | null)?.number ?? 0;
  return {
    identifier: `${key}-${number}`,
    title: (issue as { title?: string } | null)?.title ?? "Untitled",
    description: (issue as { description?: string | null } | null)?.description ?? null,
    plan: (issue as { plan?: string | null } | null)?.plan ?? null,
    projectName: (project as { name?: string } | null)?.name ?? null,
    projectKey: key,
    resources: ((attachmentRows ?? []) as Array<{
      id: string;
      kind: string | null;
      page_id: string | null;
      file_name: string | null;
      mime_type: string | null;
      size_bytes: number | null;
      page: unknown;
    }>).map((a) =>
      a.kind === "link"
        ? {
            id: a.id,
            kind: "link" as const,
            name: a.file_name ?? "link",
          }
        : a.kind === "page"
        ? {
            id: a.id,
            kind: "page" as const,
            // The title is LIVE: the value above is a snapshot, whereas this one
            // is read at run time rather than when the attachment was added.
            name: joinedPage(a.page)?.title?.trim() || a.file_name || "page",
            pageId: a.page_id,
          }
        : {
            id: a.id,
            kind: "file" as const,
            name: a.file_name ?? "attachment",
            mimeType: a.mime_type ?? "application/octet-stream",
            sizeBytes: a.size_bytes ?? 0,
          }
    ),
  };
}

/** Project context of a NOTEBOOK run (MIN-84): no issue, just the project. */
async function loadProjectContext(
  projectId: string,
): Promise<{ key: string; name: string | null }> {
  const service = getServiceClient();
  const { data } = await service
    .from("projects")
    .select("key, name")
    .eq("id", projectId)
    .maybeSingle();
  return {
    key: (data as { key?: string } | null)?.key ?? "PROJECT",
    name: (data as { name?: string } | null)?.name ?? null,
  };
}

/**
 * Assembles the bootstrap message for a COLD run that inherits work from an issue
 * (MIN-68, indexed to the branch), or null if the run inherits nothing (first
 * run). Two forms:
 * • the lineage carries a PR → PR + review thread read LIVE from GitHub (not fixed
 * at launch: between the creation of the run and its execution, a reviewer may have
 * commented, and it is often THIS comment that motivates the restart);
 * • the lineage does not come from a PR → legacy branch message (the pushed work
 * continues; `create_pr` remains a decision).
 * The previous run's summary comes from the base (`outcome`).
 *
 * Best-effort: GitHub being unavailable should not make the run fail — we fall back
 * to minimal context (“you are iterating on this branch; go read it”).
 */
async function buildInheritedPrContext(
  run: AgentRun,
  opts: {
    forge: Forge;
    token: string;
    repoFullName: string;
    /** Repository provider — a PR number is ONLY unique per provider (see MIN-69). */
    provider: RepoProviderId;
    repo: AgentRepoContext;
  },
): Promise<string | null> {
  // A NOTEBOOK run inherits nothing BY DEFAULT (no lineage). The exception is
  // a run that RESUMES a pull request (MIN-292): its lineage is the PR, and the
  // rest of this function already knows this from `pr_number` — only the summary
  // of the previous session must be read elsewhere (by PR, not per issue). Without
  // a legacy PR, there is nothing to say: a new notebook run's branch has no past.
  if (!run.issue_id && run.pr_number == null) return null;
  const issueId = run.issue_id;
  if (run.pr_number == null) {
    if (!issueId) return null;
    // No PR: does the legacy branch carry work from a previous session?
    // (A new branch stamped by a first crashed chunk does not.)
    if (!run.branch_name) return null;
    const inherited = await branchHasPriorRun(
      issueId,
      run.branch_name,
      run.created_at,
    ).catch(() => false);
    if (!inherited) return null;
    const previousSummary = await previousRunSummaryForIssue(issueId, run.id).catch(
      () => null,
    );
    return buildInheritedBranchMessage({ repo: opts.repo, previousSummary });
  }
  const number = run.pr_number;

  const [pr, comments, reviewComments, reviewThreads, previousSummary] = await Promise.all([
    opts.forge
      .getPullRequest({ token: opts.token, repoFullName: opts.repoFullName, number })
      .catch(() => null),
    opts.forge
      .listPullRequestComments({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    // Comments anchored to the code: the agent must see what it is asked to do
    // LINE BY LINE, not just the conversation thread.
    opts.forge
      .listPullRequestReviewComments({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    // RESOLVED threads (MIN-139): without them the agent would reread an already
    // resolved point as an active request. Best-effort — missing state is “unknown”,
    // so the threads remain unmarked, as before.
    opts.forge
      .listReviewThreads({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    // The lineage thread: by issue when there is one, by pull request otherwise
    // (a resumed notebook PR — MIN-292).
    (issueId
      ? previousRunSummaryForIssue(issueId, run.id)
      : previousRunSummaryForPr(
          {
            repoFullName: opts.repoFullName,
            prNumber: number,
            provider: opts.provider,
          },
          run.id,
        )
    ).catch(() => null),
  ]);

  return buildInheritedPrMessage({
    repo: opts.repo,
    pr: {
      number,
      title: pr?.title ?? null,
      body: pr?.body ?? null,
      // Minddy vocabulary, not that of the provider (MIN-164): say `open`.
      // Calling a draft `open` would hide from the agent that this work was never
      // proposed. PR unreadable → we fall back to the state frozen at launch.
      state: pr ? prStateFromRef(pr) : run.pr_state,
      comments: comments.map((c) => ({ author: c.user?.login ?? null, body: c.body })),
      lineThreads: toPrLineThreads(reviewComments, reviewThreads),
      previousSummary,
    },
  });
}

/**
 * End of turn commit message: the first line of the agent's response
 * (cleaned of markdown, bounded), otherwise a generic. PRs are squash-merged
 * by default — the message doesn't need to be perfect, just readable.
 */
export function commitMessageFromReply(reply: string, identifier: string): string {
  const firstLine = reply.split("\n").find((l) => l.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/[#*_`>]+/g, "").trim();
  if (cleaned.length >= 8) return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69)}…`;
  return `wip(${identifier}): agent update`;
}

export async function executeAgentRun(
  run: AgentRun,
  opts: {
    deadlineMs: number;
    /**
     * THE TURN IS PREPARED, NOT STARTED (MIN-293) — called when `run.local_exec`,
     * just before the function returns `"detached"`.
     *
     * A callback rather than an expansion of `ExecuteOutcome`: the drain is the
     * other caller, it does not pass it, and it has nothing to reread. It never
     * drains a local run either (see `claimableRuns`, drain.ts) — so this callback
     * has only one caller, the trigger route.
     *
     * `layout` and `bootstrapMs` are omitted: they belong to the machine
     * (see [lib/desktop/local-turn.ts](../../desktop/local-turn.ts)).
     */
    onLocalAssignment?: (
      job: Omit<VmJob, "layout" | "bootstrapMs">,
      meta: { repoFullName: string | null },
    ) => void;
  },
): Promise<ExecuteOutcome> {
  // A claim is only a scheduling lock. Membership and repository attachment
  // may have changed since it won, so reject the run before emitting an event,
  // resolving issue context, minting credentials, or waking a sandbox.
  if (!(await runAuthorityIsCurrent(run))) {
    await stampRun(run.id, {
      status: "canceled",
      error_message: "Run authority was revoked before execution",
      ...(run.local_exec ? { local_exec_gen: run.local_exec_gen + 1 } : {}),
    });
    return "failed";
  }

  const callStart = Date.now();
  /**
   * Chunk events, SERIALIZED behind a promise chain (MIN-112).
   *
   * `appendEvent` computes `seq` by reading the maximum and then inserting, and
   * `idx_agent_run_events_run_seq` is UNIQUE: this was safe while a chunk had
   * only one emitter. Since subagents, a child can emit AT THE SAME TIME as its
   * parent. `appendEvent` now retries on collision — it no longer LOSES anything —
   * but the thread ORDER would still be determined by race timing. The chain restores
   * it: events are sent in the order they were produced, so `?after=<seq>` remains
   * an honest cursor and the replayed thread tells the story in order.
   *
   * The chain link swallows errors (`appendEvent` is already best-effort): a broken
   * chain would stop all subsequent events in the chunk.
   */
  let emitChain: Promise<void> = Promise.resolve();
  const emit: EmitAgentEvent = (type, payload) => {
    emitChain = emitChain
      .then(() => appendEvent(run.id, type, payload))
      .catch(() => {});
    return emitChain;
  };
  /**
   * Who pays for this run (MIN-131): its CREATOR, not the project owner — a member
   * who starts an agent in someone else's project consumes their own budget, and
   * their quota already authorized it (`checkAgentQuota(run.created_by)`).
   * Computed here, before the `try`, so the sandbox metering in `finally` can use
   * it too. A run without a creator cannot reach the sandbox (the turn throws),
   * but if it did, this line would make that explicit rather than finding a
   * default payer.
   */
  const runBillTo: AiUsageBillTo = run.created_by
    ? { userId: run.created_by }
    : { unattributed: `run ${run.id} without created_by` };
  /**
   * WHICH LINE bills this run (MIN-185). Technically it is the same run; for
   * billing, it is not: an agent run is an action we took, while a routine run is
   * a subscription we left running. Resolved HERE, once, before the `try` — the
   * microVM metering lives in `finally`, and storing either half somewhere other
   * than the other would make the separation partly wrong.
   */
  const usageFeature = run.routine_id ? "routine_code" : "agent_code";
  const sandboxUsageFeature = run.routine_id ? "routine_compute" : "sandbox_compute";
  let sandbox: Sandbox | null = null;
  /**
   * Credentials known to trusted bootstrap code (MIN-239). Declared before the
   * `try` so clone, provider, and relay failures are redacted before their error
   * messages reach the UI. Sandbox remotes themselves are credential-free after
   * MIN-421.
   */
  const secrets = new SecretRedactor();
  // Chunk background jobs (MIN-114), visible to `finally`: regardless of the
  // exit path (turn completion, error, interruption), nothing survives the chunk.
  let backgroundJobs: BackgroundJobs | null = null;
  /**
   * Was the loop REALLY started in the microVM (MIN-224)? This determines who
   * bills the compute for this pass, and there is no third answer: either the
   * loop is running and will submit the bill (including bootstrap), or it never
   * started and this function is the only one that knows a microVM was woken for
   * nothing. See `finally`.
   */
  let vmLoopLaunched = false;
  /** A local turn never starts a microVM. Computed before the first event so its
   *  write can overlap all job preparation. */
  const localTurn = run.local_exec === true;
  const executionTarget = resolveAgentExecutionTarget(
    { localExec: localTurn },
    process.env,
  );
  const selfHostedSandbox = executionTarget === "self-hosted";

  /**
   * CHUNK COMPUTE METERING, callable BEFORE suspension (MIN-224).
   *
   * It used to live only in `finally`, and therefore AFTER the stamps — which made
   * the meaning of `agent_runs.cost_usd` diverge between the two engines. The new
   * form bills compute and then rereads the ledger ([vm-rest.ts](vm-rest.ts)), so
   * the column equals the ledger total, including compute; here the column held
   * only model usage, AND lost some of it — a dead chunk that never stamped never
   * recorded its share.
   *
   * IDEMPOTENT, as it must be: `finally` remains the safety net for anything that
   * does not pass through suspension (a throw, a failed bootstrap). Two writes
   * would share the seq range (`SANDBOX_USAGE_SEQ_BASE + continuations`) and
   * overwrite each other.
   *
   * `Date.now() - callStart` AT CALL TIME: billed from suspension rather than from
   * `finally`, it loses the few hundred milliseconds spent stamping — a lower
   * bound, in the safe direction of the error.
   */
  let sandboxComputeBilled = false;
  const billSandboxCompute = async (): Promise<void> => {
    if (sandboxComputeBilled || !sandbox || vmLoopLaunched) return;
    sandboxComputeBilled = true;
    await recordSandboxUsage({
      runId: run.run_id ?? run.id,
      seq: SANDBOX_USAGE_SEQ_BASE + run.continuations,
      billTo: runBillTo,
      // A routine's microVM minutes are grouped with the routine: otherwise,
      // the compute half of its spending would remain under “Agents”.
      feature: sandboxUsageFeature,
      projectId: run.project_id,
      durationMs: Date.now() - callStart,
    }).catch(() => {});
  };

  try {
    const runningEvent = emit("status", { status: "running", continuation: run.continuations });
    // Cloud must show the sandbox opening before waking it. Locally, the UI already
    // knows the status from the claim: let this write happen during context reads,
    // then await it before returning.
    if (!localTurn) await runningEvent;

    if (!run.created_by) throw new Error("Run has no owner");
    if (!run.model) throw new Error("Run has no model");

    // Interruption requested while the run was QUEUED (between turns): return it to
    // rest without even waking the sandbox.
    //
    // Unless an UNCONSUMED message remains: the composer always sends the steer
    // pair THEN interrupt when the agent is “working” (`queued` counts as such),
    // so the message may have arrived just before the flag. Resting here would
    // swallow it — no one drains a resting run, and the user would see the agent
    // die without reading the instruction. Re-queue it for processing.
    if (run.interrupt_requested) {
      await clearInterrupt(run.id);
      const pending = await hasPendingRunMessages(run.id);
      await stampRun(run.id, {
        status: pending ? "queued" : "completed",
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        continuations: 0,
        attempts: 0,
        last_activity_at: new Date().toISOString(),
        interrupt_requested: false,
      });
      return "interrupted";
    }

    // These reads are independent. Serializing them delayed the local job before
    // the Mac could even start opencode, although the first token depends only on
    // their final result. Keep target resolution first so its error and security
    // boundary remain unchanged.
    //
    // A run with NO repo link (local only, MIN-local-norepo) resolves to `null`
    // instead of throwing: the turn plays on the machine's attached folder and
    // needs no forge identity. A CLOUD run without a link still dies below —
    // there is nothing to clone.
    const targetPromise = run.repo_link_id
      ? resolveRepoCloneTarget(run.project_id)
      : Promise.resolve(null);
    const issuePromise = run.issue_id
      ? loadIssueContext(run, run.issue_id, {
          // On an opencode continuation, the prompt is intentionally empty: the
          // model rereads its SQLite database and steering arrives via the
          // supervisor. Rich context (description, plan, resources) is unnecessary.
          includePromptContext: !run.checkpoint?.opencode?.sessionId,
        })
      : Promise.resolve(null);
    const prRunPromise = run.pull_request_id
      ? loadPrRunContext(run.pull_request_id)
      : Promise.resolve(null);
    const prefsPromise = resolveRunPrefs(run);
    const aiSurface = run.chain_id || run.routine_id ? "automations" : "agent";
    const quotaAndLedgerPromise = Promise.all([
      checkAgentQuota(run.created_by ?? "", aiSurface).catch(() => null),
      spentFromLedger(run.run_id ?? run.id),
    ]);
    // A BYOK run is fixed to its own payer. If the configuration disappeared, or a
    // local endpoint was requested from the cloud, preparation fails explicitly:
    // it must never fall back to the platform key.
    const endpointPromise = resolveAgentApiKey(run.created_by, aiSurface, {
      allowLocal: localTurn,
      requireByok: run.key_mode === "byok",
    });

    // Clone target (fresh token for this chunk) + the provider's PR/MR client.
    // `null` target = no linked repository: only a local turn can be here, and
    // everything forge-shaped below degrades to a no-repo session.
    const target = await targetPromise;
    if (target ? !repoTargetMatchesRun(run, target) : !runWasLaunchedWithoutRepository(run)) {
      throw new Error("Run repository binding changed during execution preparation");
    }
    if (!target && !localTurn) throw new Error("No repository linked to this project");
    if (target) {
      secrets.addAuthUrl(target.authUrl);
      secrets.add(target.token);
    }
    const forge = target ? forgeFor(target.provider) : null;
    // This identity may need the forge on the process's first turn. It depends on
    // no other context, so starting it here overlaps quota, preferences, issue,
    // and prompt construction. Without a repository there is nothing to resolve:
    // the default identity travels, and no one will ever commit for the model
    // anyway (current-checkout mode commits nothing).
    const committerPromise = run.pull_request_id
      ? Promise.resolve(defaultCommitterIdentity())
      : target
        ? resolveCommitterIdentity(target)
        : Promise.resolve(defaultCommitterIdentity());

    // Run anchor, with THREE values: minddy issue, NOTEBOOK (MIN-84, the launcher's
    // note is the instruction), or PULL REQUEST (MIN-168 — a read-only review
    // session on the repository).
    const [issue, prRun, prefs, quotaAndLedger, endpoint] = await Promise.all([
      issuePromise,
      prRunPromise,
      prefsPromise,
      quotaAndLedgerPromise,
      endpointPromise,
    ]);
    // A run anchored to a PR whose row disappeared must NOT fall back to a notebook
    // run: it would believe it is allowed to create and push to a branch.
    if (run.pull_request_id && !prRun) {
      throw new Error("The pull request this review was anchored to no longer exists");
    }
    const anchor: AgentAnchor = issue ? "issue" : prRun ? "pr" : "notebook";
    const policy = executionPolicyFor({
      hasIssueContext: issue !== null,
      reviewingPullRequest: prRun !== null,
      unattended: run.routine_id !== null,
    });
    /**
     * The credential held by the execution transport (MIN-421, MIN-458).
     * `target` remains the full function token for forge API operations. This
     * second token is repository-scoped and read-only for reviews. Cloud runs
     * keep it in the firewall; local runs receive only this narrowed credential,
     * never the account-wide GitLab token.
     */
    const vmTarget = target
      ? await resolveRepoCloneTarget(
          run.project_id,
          policy.repository === "read" ? "repo-read" : "repo-write",
        )
      : null;
    if (target && (!vmTarget || !repoTargetMatchesRun(run, vmTarget))) {
      throw new Error("Run repository binding changed before credential issuance");
    }
    if (vmTarget) {
      secrets.addAuthUrl(vmTarget.authUrl);
      secrets.add(vmTarget.token);
    }
    /**
     * Does the harness write to the REPOSITORY for this session? False for a
     * review, and this is the harness half of the “no writes” guarantee — the other
     * half is the tool set, which has no editing capability. A prompt sentence
     * would guarantee neither.
     */
    const writesToRepo = policy.repository === "write";
    const project = issue
      ? { key: issue.projectKey, name: issue.projectName }
      : await loadProjectContext(run.project_id);
    // Readable run reference in commit messages (`wip(...)`).
    const commitRef = issue?.identifier ?? "agent";
    // Comment and agent-summary language comes from the launcher (owner by default),
    // and the landing status for issues created by the agent comes from its account setting.
    const { locale: commentLocale, numoDefaultStatus } = prefs;
    // Review session: the branches are those of the PR — its base is the diff
    // comparison point, and its head is what we review. Otherwise, use the base
    // selected at launch and the run's working branch. Without a linked
    // repository there is no default branch to fall back to: `""` means "no
    // base" for the only consumer that reads it on a local turn.
    const baseBranch = (prRun?.baseBranch || run.base_branch) ?? target?.defaultBranch ?? "";
    const workBranch = prRun
      ? pullRequestLocalBranch(prRun)
      : run.branch_name ??
        generatedAgentBranchName({
          runId: run.id,
          issueIdentifier: issue?.identifier,
          conversationTitle: run.title,
          prompt: run.prompt,
        });

    /**
     * REMAINING usage budget at chunk entry. Snapshotted once here: the loop compares
     * its accumulated cost with this remainder without rereading usage every round.
     * With BYOK the ACCOUNT is unlimited, but a local run has its own `budget_usd`,
     * chosen by the user.
     *
     * Two reads, one wait: the ledger total (see `runSpentUsd`) does not depend on
     * the quota and runs alongside it.
     *
     * READ BEFORE THE MICROVM since MIN-223, and not only for the loop: this
     * remainder caps the run's LLM key, and that key must exist before the network
     * policy, and therefore before the VM. One read serves both uses — the few
     * seconds of staleness this introduces in the loop have no effect (the cap has
     * a 1.5× margin, and the ledger is reread for every chunk).
     */
    const [quotaNow, ledgerSpentUsd] = quotaAndLedger;

    // Run endpoint (the user's BYOK endpoint or the OpenRouter platform key).
    // Resolved BEFORE history bootstrap: the system prompt describes only the
    // tools actually offered, and web_search depends on it. Also before the
    // microVM since MIN-223: this key (or the run key below) is what the firewall
    // injects — the network policy cannot be built without it.
    const { apiKey, baseUrl, provider, mode: keyMode } = endpoint;
    const serverControlToken = selfHostedSandbox
      ? (() => {
          const secret = resolveServerExecSecret();
          if (!secret) throw new Error("server execution secret is not configured");
          return signServerExecToken(run.id, secret);
        })()
      : null;

    /**
     * THE KEY THE FIREWALL WILL INJECT, which is not necessarily `apiKey`.
     *
     * In platform mode, we issue a key FOR THIS RUN with a hard cap enforced by
     * OpenRouter (`run-key.ts`): the network policy prevents the VM from READING
     * the key, not from USING it outside the loop — a `curl` against the credited
     * route spends without going through the ledger. The provider cap bounds that
     * spending, and it lives outside both the VM and our code.
     *
     * With BYOK, there is no minting: this is the user's key on their account, and
     * the provisioning API issues only on the account that owns it. It is as
     * non-exfiltrable as ours, but cannot be capped — that is stated on the BYOK
     * screen and is not fixed here.
     *
     * Minting fails silently (variable unset, API down) → fall back to `apiKey`. A
     * missing spending safeguard must not prevent a run from executing; it must be
     * visible in the logs.
     */
    let vmKeyHash: string | null = null;
    let vmKey = selfHostedSandbox ? AGENT_LLM_PLACEHOLDER_KEY : apiKey;
    // Locally, the key must never enter the job: the proxy requests it once from
    // `/llm-key`, which mints it and persists its hash. Minting it here as well
    // would create and revoke a key before the first token.
    if (keyMode === "platform" && !localTurn) {
      if (!selfHostedSandbox) {
        const minted = await mintRunKey({
          runId: run.id,
          capUsd: runKeyCapUsd({
            runBudgetUsd: run.budget_usd,
            runSpentUsd: Math.max(run.cost_usd, ledgerSpentUsd ?? 0),
            accountRemainingUsd:
              quotaNow && !quotaNow.unlimited ? Math.max(0, quotaNow.remaining ?? 0) : undefined,
            reservedBudgetUsd:
              run.managed_budget_usd == null
                ? null
                : Math.max(
                    0,
                    Number(run.managed_budget_usd) -
                      Math.max(run.cost_usd, ledgerSpentUsd ?? 0),
                  ),
          }),
        });
        if (minted) {
          vmKey = minted.key;
          vmKeyHash = minted.hash;
        }
      }
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────
     * DOES THE TURN RUN ON A MACHINE? (MIN-293)
     *
     * From here until launch, the function does exactly the same work in both cases
     * — it is the same turn, with the same context, model, and cap. **Only three
     * things disappear, each because it requires a DISK the server does not have:**
     *
     * 1. **the microVM** — none is woken, so nothing is cloned, no network policy
     *    is applied, and `billSandboxCompute` bills nothing (its existing
     *    `!sandbox` guard is sufficient);
     * 2. **the diff baseline** (`revParseHead`) — this is the HEAD of a machine the
     *    function has never seen. The job starts with `""`, and **the harness
     *    resolves it itself**: `job.filesFromSha || current?.parent`
     *    ([supervisor.ts](vm/supervisor.ts)), written for this exact case in MIN-358;
     * 3. **reading `AGENTS.md`** — the dedicated message injected into the model
     *    cannot be built here. This is NOT a loss of context:
     *    `instructions.paths` is a constant (`REPO_INSTRUCTION_FILES`), is passed
     *    as-is, and opencode loads these files **from disk** through its own
     *    `instructions` key ([opencode-config.ts](vm/opencode-config.ts)).
     *    The model still reads them; only the minddy wrapper is missing, and the
     *    byte count remains zero.
     *
     * Background jobs follow the same rule: `run_background` is not provided on a
     * machine (see `agentToolsFor`), and this function's registry has only ever
     * been used for a safety-net `stopAll` on the detached path.
     *
     * ⚠ **The function STARTS nothing in this case**: it prepares and returns the
     * assignment through `onLocalAssignment`. Presence, claiming, and routing
     * belong to MIN-294; here, the only caller is the development trigger route.
     */
    // Sandbox: wake the microVM (filesystem restored from the persistent snapshot
    // → fast continuation); otherwise `onCreate` clones the working branch.
    // Deterministic name → the same microVM/snapshot from one turn to the next.
    let sandboxRepoUrl = localTurn ? vmTarget?.authUrl : vmTarget?.remoteUrl;
    const configureSandboxRepo = async (fresh: Sandbox): Promise<string> => {
      if (!vmTarget) throw new Error("No repository linked to this project");
      if (fresh instanceof SelfHostedSandbox) {
        return fresh.configureGitRelay({
          authUrl: vmTarget.authUrl,
          repoFullName: vmTarget.repoFullName,
          controlToken: serverControlToken!,
        });
      }
      return vmTarget.remoteUrl;
    };
    const sandboxResult = localTurn ? { sandbox: null, created: false } : await getOrCreateAgentSandbox({
      name: agentSandboxName(run.id),
      // Both LLM and forge credentials stay in the trusted network layer. The VM
      // receives placeholder/request data and a credential-free Git remote only.
      networkPolicy: buildAgentNetworkPolicy({
        baseUrl,
        llmKey: vmKey,
        appOrigin: agentControlOrigin(),
        ...(vmTarget
          ? {
              forge: {
                provider: vmTarget.provider,
                repoFullName: vmTarget.repoFullName,
                token: vmTarget.token,
                origin: new URL(vmTarget.remoteUrl).origin,
              },
            }
          : {}),
      }),
      onCreate: async (fresh) => {
        sandboxRepoUrl = await configureSandboxRepo(fresh);
        if (prRun) {
          // A PR run always has its repository — the launch resolves the project
          // THROUGH the link — so `target`/`forge` are non-null here by
          // construction; the assertions only surface that invariant.
          // By the PR's SERVER REF, not the branch name: on a fork, the head branch
          // does not exist in the base repository (see `clonePullRequest`). No
          // committer identity needs resolving — nothing will be committed.
          //
          // The diff base is requested from the FORGE (MIN-258), not inferred from
          // the clone: `origin/<base>` is a moving tip, and diffing against it would
          // make every commit merged into the base since the PR opened look like a
          // deletion from the PR. Best-effort on both sides — an unreadable merge
          // base degrades the review but does not cancel it. The head is given by
          // its SHA: on a fork, its branch name does not exist here.
          const baseSha = await forge!
            .getMergeBaseSha({
              token: target!.token,
              repoFullName: target!.repoFullName,
              number: prRun.number,
              base: baseBranch,
              head: prRun.headSha ?? prRun.headBranch ?? "",
            })
            .catch((err: unknown) => {
              console.error(`[agent] merge base unreadable for PR #${prRun.number}:`, err);
              return null;
            });
          await clonePullRequest(sandboxHost(fresh, cloudLayout()), {
            authUrl: sandboxRepoUrl,
            baseBranch,
            headRef: pullRequestHeadRef(prRun.provider, prRun.number),
            headBranch: prRun.headBranch,
            localBranch: workBranch,
            baseSha,
          });
          return;
        }
        // The committer identity is no longer written into the clone (MIN-358): it
        // travels in the job and is supplied with `git -c`, on the only command
        // that commits. A value used in one place cannot leak into someone's repo.
        await cloneRepo(sandboxHost(fresh, cloudLayout()), {
          authUrl: sandboxRepoUrl,
          baseBranch,
          workBranch,
        });
      },
    });
    const { sandbox: sb, created: sandboxCreated } = sandboxResult;
    if (!localTurn && !sandboxCreated && sb) {
      sandboxRepoUrl = await configureSandboxRepo(sb);
    }
    const llmRelayUrl =
      selfHostedSandbox && sb instanceof SelfHostedSandbox
        ? await sb.configureLlmRelay({
            apiKey: apiKey || null,
            baseUrl,
            controlToken: serverControlToken!,
          })
        : null;
    sandbox = sb;
    /**
     * Hands on the repository, through RPC (MIN-224). In the old form this was the
     * only path; in the new form, the function keeps only bootstrap (reading
     * `AGENTS.md`, writing the bundle), and the loop in the microVM performs the
     * same operations on the local disk.
     *
     * `null` ON A LOCAL TURN (MIN-293): the repository is on a disk the function
     * cannot reach. Keep the three callers separate rather than using a fake host
     * — a host returning empty responses would turn “I cannot read” into “there is
     * nothing to read”, which is exactly the distinction that matters for `AGENTS.md`.
     */
    const host = sb ? sandboxHost(sb, cloudLayout()) : null;

    // Persist the Sandbox identity and base BEFORE the loop (resume after a crash).
    // sandbox_stopped_at:null → the microVM is alive again (the reaper ignores it).
    //
    // `branch_name` waits for the FIRST REAL PUSH (MIN-123, `noteBranchPushed`
    // below): until something is pushed, the branch exists only in the microVM,
    // and surfaces that read a branch (diff view, lineage inheritance, branch
    // cleanup) must not refer to one that is absent from the repository. The name
    // is deterministic, so a later chunk can recover it without rereading it from
    // the database.
    await stampRun(run.id, {
      // A local turn has no microVM to name, and writing one would be worse than
      // useless: `handleControlPlaneRequest` compares `sandbox_id` with the
      // caller's signed name, and the watchdog queries the platform by that name.
      // An invented value would make both of them lie.
      ...(sandbox ? { sandbox_id: sandboxName(sandbox), sandbox_stopped_at: null } : {}),
      base_branch: baseBranch,
      // MIN-223: what is needed to revoke the run key when the VM is suspended.
      // Written EVEN when minting failed (null) — otherwise we would retain the
      // hash of a key that is no longer the one injected by the firewall, and the
      // reaper would revoke nothing while believing it had closed the tap.
      provider_key_id: vmKeyHash,
    });

    // No one can use the PREVIOUS chunk's key anymore: the policy just installed
    // injects the new one. Revoke it immediately rather than waiting for expiry —
    // this is one call per chunk, on a chunk that lasts minutes, and forgetting it
    // would leave as many live keys as continuations.
    if (run.provider_key_id && run.provider_key_id !== vmKeyHash) {
      await revokeRunKey(run.provider_key_id);
    }


    // The machine is ready. This is the only thing the thread could not infer:
    // between `status: running` at the top of this chunk and the agent's first
    // step, several seconds pass while the microVM wakes and the repo is cloned —
    // the thread showed “working” while nobody was working yet. This event closes
    // that gap: before it, “sandbox opening”; after it, work (see `sandboxReady`
    // in components/agent/agent-event-feed.tsx).
    if (sandbox) await emit("status", { phase: "sandbox_ready" });

    // “Diff per turn” baseline (MIN-46, `files_changed` event): HEAD at chunk
    // entry. `filesFromSha` is the point from which turn completion computes the
    // diff — the last emitted SHA (persisted in the checkpoint and surviving WIP
    // chunks), or this baseline on the run's first chunk (“nothing changed yet”).
    //
    // ⚠ ON A LOCAL TURN (MIN-293), this is the HEAD of a machine the function has
    // never seen: the job starts with `""`, and the harness resolves it itself
    // (`job.filesFromSha || current?.parent`, supervisor.ts, written for this exact
    // case in MIN-358).
    const baselineHead = host ? await revParseHead(host) : "";
    const filesFromSha = run.checkpoint?.lastFilesSha ?? baselineHead;

    // Web search: reserved for runs that use OpenRouter (minddy quota or OpenRouter
    // BYOK — search then uses the SAME key as the run and therefore the same bill).
    // The tool is not offered elsewhere (see agentToolsFor). Per-chunk cap, and one
    // `web_search` ledger row per search.
    const webSearchAllowed = provider === "openrouter" && (await isWebSearchEnabled());

    // CAN the run's model SEE images (MIN-111)? Resolve this here, before bootstrap,
    // for the same reason as web_search: the prompt must describe only what the
    // run can actually do. This also lets `read_resource` return a mockup instead
    // of its metadata.
    const imageInput = await supportsImageInput(run.model, provider, apiKey).catch(() => false);

    // Subagents (MIN-112): resolve settings HERE, before bootstrap, for the same
    // reason as `web_search` and images — the system prompt must describe only
    // what the run can actually do.
    //
    // A subagent's MODEL selection follows the same all-or-nothing rule as
    // `web_search`: an Anthropic BYOK run cannot run `deepseek/…`, so outside
    // OpenRouter the `model` field disappears from the schema and the child
    // inherits the parent's model. Load the catalog only in that case (it is cached
    // for an hour and never throws): it validates an ID and FILTERS for tool
    // calling — a subagent that cannot call tools cannot do anything.
    const subagentModels = provider === "openrouter";
    const [rawFavorites, subagentMaxParallel, subagentCatalog] = await Promise.all([
      getSubagentFavorites().catch(() => []),
      maxParallelSubagents().catch(() => 2),
      subagentModels && run.created_by
        ? getAgentModelsForUser(run.created_by).catch(() => null)
        : Promise.resolve(null),
    ]);
    // The plan's model cap also applies to children: the catalog served here has
    // already been filtered, and favorites above the cap are removed from the
    // prompt. Without this, `spawn_agent` would reopen from below what the picker
    // closes from above — against the minddy quota, and decided by a model.
    const subagentScope = scopeSubagentModels({
      favorites: rawFavorites,
      catalog: subagentCatalog ?? { models: [], maxMultiplier: null },
    });
    const subagentFavorites = subagentScope.favorites;
    /**
     * CHILD MODEL PRICES (MIN-286) — same index, same cache, and same reason as
     * `modelPricing` below: the opencode harness declares one model per offered
     * favorite, and a model without a price produces `cost: 0`. A child whose price
     * is unknown is not offered at all (`subagentModelChoices`) rather than being
     * offered for free in the ledger.
     */
    const subagentPricing = Object.fromEntries(
      (
        await Promise.all(
          subagentFavorites.map(
            async (f) =>
              [f.id, await getModelPricing(f.id, provider, apiKey).catch(() => null)] as const,
          ),
        )
      ).flatMap(([id, pricing]) => (pricing ? [[id, pricing] as const] : [])),
    );

    // Rehydrate or bootstrap history. Bootstrap is CONVERSATIONAL: context
    // (repository + issue), then the launcher's actual request as the LAST user
    // message — the agent answers that request; the issue is only its anchor.
    let messages: AgentChatMessage[];
    /** PR context loaded during bootstrap (null outside review or on a continued chunk). */
    let prBoot: Awaited<ReturnType<typeof loadPrReviewBoot>> | null = null;
    let usageSeqStart = run.checkpoint?.usageSeq ?? run.continuations * 1000;
    // Repository instructions already served: restored from the checkpoint on a
    // turn split across multiple chunks, otherwise empty — bootstrap fills them
    // just below (MIN-115).
    const instructions: InstructionsState = {
      paths: [...(run.checkpoint?.instructions?.paths ?? [])],
      bytes: run.checkpoint?.instructions?.bytes ?? 0,
    };
    if (run.checkpoint?.opencode?.sessionId) {
      /**
       * A CONTINUED OPENCODE TURN NEEDS NO BOOTSTRAP (MIN-286).
       *
       * Its memory is the event journal replayed by the supervisor: the issue
       * context, repository instructions, and launcher's request are already there,
       * stated once on the first turn. Replaying bootstrap here would post them ON
       * TOP OF the restored history — the agent would reread the initial instruction
       * as if it had just arrived and repeat work it just completed. This is exactly
       * what `VmJob.opencodeInput` promises (“`prompt` is empty on a CONTINUED turn:
       * the request arrives through steering”), and bootstrap would also cost six
       * forge calls.
       *
       * AND IT IS THE ONLY MEMORY WE CAN STILL READ. An old checkpoint from the
       * homegrown loop stores its conversation in `messages`; this branch does not
       * recognize it, so it falls back to COLD bootstrap — rebuilt issue context,
       * plus the `priorConversationLost` sentence telling the model what it cannot
       * see. Replaying it would be worse: it would become a prompt, and the agent
       * would reread an entire conversation as a newly arrived instruction.
       */
      messages = [];
    } else {
      // What a review cannot read in the sandbox: the issue, the discussion already
      // held on the PR, CI, and the file summary. Load it HERE only (cold bootstrap):
      // a continued chunk has all of this in its checkpoint, and paying for six
      // forge calls to rewrite it identically would waste network traffic.
      prBoot = prRun
        ? await loadPrReviewBoot({
            forge: forge!,
            call: {
              token: target!.token,
              repoFullName: target!.repoFullName,
              number: prRun.number,
            },
            pr: prRun,
          })
        : null;
      // The SHA ACTUALLY reviewed, as just returned by the forge: the one stored at
      // launch comes from `pull_requests.head_sha`, which dates from the last
      // webhook and may be stale (or missing). This is the SHA that “would rerunning
      // have anything new to read?” must compare.
      if (prBoot?.headSha && prBoot.headSha !== run.pr_head_sha) {
        await stampRun(run.id, { pr_head_sha: prBoot.headSha });
      }
      const contextMsg = prRun
        ? buildPrReviewContextMessage({
            repo: { fullName: target!.repoFullName },
            pr: {
              number: prRun.number,
              title: prRun.title,
              body: prBoot?.body ?? null,
              state: prRun.state,
              headBranch: prRun.headBranch,
              baseBranch,
              term: prTerm(target!.provider),
            },
            issue: prBoot?.issue ?? null,
            files: prBoot?.files ?? [],
            filesTruncated: prBoot?.filesTruncated,
            comments: prBoot?.comments,
            reviews: prBoot?.reviews,
            lineThreads: prBoot?.lineThreads,
            checks: prBoot?.checks ?? null,
            // The launcher's prompt IS the request for a review session (the
            // `@numo` mention or an instruction written on click): read it at the
            // head of the context, not as another message at the end.
            question: run.prompt,
          })
        : issue
          ? buildAgentContextMessage({
              issue: {
                identifier: issue.identifier,
                title: issue.title,
                description: issue.description,
                plan: issue.plan,
              },
              // No linked repository → no repo block: the context names the
              // attached folder instead (see the builder).
              repo: target
                ? { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch }
                : null,
              projectName: issue.projectName,
              resources: issue.resources,
              images: imageInput,
              numoDefaultStatus,
            })
          : buildNotebookContextMessage({
              repo: target
                ? { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch }
                : null,
              projectName: project.name,
              numoDefaultStatus,
            });
      /**
       * NO `system` MESSAGE (MIN-286, 2026-08-14): opencode has its own, and ours
       * — the minddy anchor — is passed through `instructions`, rebuilt on every
       * turn. Bootstrap therefore assembles only one USER message, from which
       * `userPromptFromMessages` extracts the turn prompt.
       */
      messages = [{ role: "user", content: contextMsg }];
      // COLD session inheriting from a PR (MIN-68): it has no checkpoint, but the
      // branch already contains work. Give it the only memory of that past — the
      // previous session summary, PR, and review thread — so it can iterate instead
      // of starting over. Not applicable to a review, which has neither lineage nor
      // prior work: its PR context is already the one above.
      // Without a linked repository there is no forge to read a previous PR
      // from: the inheritance block is skipped entirely.
      const inheritedPr =
        writesToRepo && target && forge
          ? await buildInheritedPrContext(run, {
              forge,
              token: target.token,
              repoFullName: target.repoFullName,
              provider: target.provider,
              repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
            })
          : null;
      if (inheritedPr) messages.push({ role: "user", content: inheritedPr });
      // Repository instructions (AGENTS.md / CLAUDE.md) — a dedicated message after
      // the context. The root is ALWAYS marked as seen, whether found or not: only
      // subdirectories are loaded below, on their first edit (MIN-115).
      //
      // THE ANCHOR DECIDES THE SOURCE (MIN-328): during a review, the clone is at
      // the pull request HEAD — the author's repository, not the project repository.
      // Instructions are then read at the base (`pr-base`), or not at all.
      // `prRun`, not `anchor`: the CLONE decides, and `prRun` makes us clone the
      // head (see `onCreate`).
      //
      // `null` ON A LOCAL TURN: the disk is elsewhere. The model still reads these
      // files — opencode loads them through its own `instructions` key, which
      // receives `instructions.paths` just below — so only the minddy wrapper is
      // missing, not the content.
      const repoInstructions = host
        ? await readRepoInstructions(host, prRun ? "pr" : anchor)
        : null;
      instructions.paths.push(...REPO_INSTRUCTION_FILES);
      if (repoInstructions) {
        messages.push({ role: "user", content: repoInstructions.message });
        instructions.bytes += repoInstructions.bytes;
      }
      // The launcher's request comes last: it is what the agent answers.
      // NOTEBOOK run: the request is wrapped in the SAME structure as the notebook's
      // “copy prompt” action (`<notes>` tags, checkbox semantics, “these are
      // personal notes, not a spec — ask before guessing”), WITHOUT the MCP block:
      // its native tools (`read_scratchpad`…) replace it.
      //
      // Launched FROM the notebook, the prompt is already wrapped (the composer
      // displays it plainly; see use-launch-agent-note.ts) and
      // `buildScratchpadPrompt` passes it through unchanged. This wrapper is thus
      // for notebook runs launched elsewhere — free-form text typed in the composer
      // or a routine — which otherwise have only raw text.
      // A review has NO final message: its request is already at the head of its
      // context (“What you were asked”), and repeating it here would make it read it
      // twice.
      if (run.prompt?.trim() && !prRun) {
        messages.push({
          role: "user",
          content: promptWithMentions(
            issue ? run.prompt.trim() : buildScratchpadPrompt(run.prompt.trim(), { mcp: false }),
            run.prompt_mentions,
          ),
        });
      }
    }

    /**
     * WHAT THE OPENCODE ENGINE RECEIVES FOR THE TURN (MIN-286): its minddy anchor
     * and the message to post. Composed HERE in the function, like all other
     * bootstrap data — the microVM has neither the issue, favorites, nor locale.
     *
     * The anchor is rebuilt on every turn (see `VmJob.opencodeInput`).
     *
     * The prompt is what bootstrap put in the USER messages: issue (or pull request)
     * context, inherited work, repository instructions, and the launcher's request.
     * On a continued turn, bootstrap wrote nothing — history lives in the opencode
     * journal — and the prompt comes from steering.
     */
    /**
     * WHICH REPOSITORY THIS TURN WRITES TO (MIN-358). A constant here, and a fact:
     * this function created the microVM and cloned into it, so it can produce only
     * a clone. The `current` mode belongs to the desktop launcher (MIN-293), which
     * works in a repository that existed before it.
     *
     * Name it rather than writing it twice: the job carries it, and the anchor served
     * to the model depends on it — stating one without the other would produce a
     * turn that writes one way while believing it is in the other.
     */
    const repoMode: VmJob["repoMode"] = "clone";
    /**
     * ⚠ YET THE ANCHOR IS NOT READ FROM `repoMode` (MIN-364).
     *
     * `repoMode` is a field the MACHINE replaces — `assignmentToJob` sets it to
     * `"current"` ([lib/desktop/local-turn.ts](../../desktop/local-turn.ts)). The
     * `"clone"` above is therefore only a placeholder on a local turn; nobody uses
     * it. The anchor is composed HERE and passed through unchanged: reading it from
     * this placeholder gave the local turn **the cloud's git block** — “the harness
     * commits and pushes whatever you changed at the end of each turn”, even though
     * the local harness commits nothing (D2bis-B) and the guard refused to let the
     * model commit. This is the third version of the three texts in §1 of the
     * 2026-08-15 audit, and the most inaccurate of the three.
     *
     * The fact to tell the model is “this checkout existed before you”, and
     * `run.local_exec` is what knows that on the server.
     */
    // The local worktree is on the user's machine, but not in their checkout: it
    // therefore follows clone rules (the harness delivers the commit), while the
    // historical mode retains current-repository protection.
    const currentRepo =
      (localTurn && !run.local_worktree) || isCurrentRepoJob({ repoMode });
    const opencodeInput = {
      anchorInstructions: buildOpencodeAnchor({
        locale: commentLocale,
        anchor,
        currentRepo,
        // No linked repository → no forge: the anchor drops `create_pr`, the
        // project-PR section, and every sentence that promises a remote.
        hasRepo: target != null,
        interactive: !run.routine_id,
        webSearch: webSearchAllowed,
        webSearchMax: MAX_WEB_SEARCHES_PER_TURN,
        chain: !!run.chain_id,
        images: imageInput,
        // A review does not delegate, and a turn without room for a child must not
        // read a section describing a tool the config does not provide.
        ...(writesToRepo && subagentMaxParallel > 0
          ? {
              subagents: {
                favorites: subagentFavorites,
                models: subagentModels,
                maxMultiplier: subagentScope.maxMultiplier,
              },
            }
          : {}),
      }),
      /**
       * A continued turn from a session run by the old engine first reads what it
       * lost (see `priorConversationLost`): without this sentence, it would answer
       * a message whose context it cannot see.
       */
      prompt: priorConversationLost(run)
        ? `${PRIOR_CONVERSATION_LOST_NOTE(commentLocale)}\n\n${userPromptFromMessages(messages)}`
        : userPromptFromMessages(messages),
    };

    // Session PR state, MUTATED during the turn (create_pr, reopening on push):
    // turn completion reads the current state, not the one frozen at claim time.
    /**
     * Landing the turn on the pull request and issue — open, reopen, record, comment,
     * trace — happens through the CONTROL PLANE since MIN-224: the loop lives in
     * the microVM (or on the machine), and `pr-landing.ts` is driven from
     * `control-plane.ts`. The old in-process `PrLandingContext` died with it;
     * a run with no linked repository simply never lands a PR.
     */
    // Model context window AND input price (OpenRouter): derive the compaction
    // threshold from both — the window BOUNDS it, and the price SIZES it. One index
    // read serves both (process cache).
    // `modelPricing` comes from the SAME index (and therefore the same cached round
    // trip): it goes into the microVM so the opencode harness bills at our prices
    // rather than those of a third-party catalog (MIN-286, see `VmModelPricing`).
    const [contextWindow, inputUsdPerMTok, modelPricing] = await Promise.all([
      getModelContextWindow(run.model, provider, apiKey).catch(() => null),
      getModelInputPrice(run.model, provider, apiKey).catch(() => null),
      getModelPricing(run.model, provider, apiKey).catch(() => null),
    ]);
    // Business-tool contexts, built side by side: both sets are provided regardless
    // of the anchor (MIN-125). What the anchor still decides is `anchorIssueId` —
    // the default target for issue tools.
    //
    // During a REVIEW, this default is the issue implemented by the PULL REQUEST:
    // `run.issue_id` is always null (a review session does not occupy an issue), but
    // the PR often carries one — and that is the issue the agent wants to read when
    // comparing code with the plan. Without this line, the tool would advertise a
    // nonexistent default and the first argumentless `read_issue` would waste a
    // round.
    //
    // A PR without an issue (the normal case for a human PR, MIN-143) leaves the
    // default null: `issue` becomes required again, as the tool also says.
    /**
     * The three PR writes (MIN-168), wired like `create_pr`: the provider's forge
     * and the token from `resolveRepoCloneTarget` — Numo comments as minddy, never
     * as a human (see the identity table in `forge.ts`).
     *
     * `files()` is LAZY and memoized: anchor validation needs it, a turn that does
     * not comment on any line has no reason to pay for it, and a continued chunk
     * has no `prBoot` to reuse. Resolve a fresh token at call time — a chunk may
     * last longer than the claim token.
     */
    /**
     * PROJECT pull requests (MIN-267), wired like the previous ones: the provider's
     * forge and a token resolved again ON EVERY CALL — a microVM turn lasts hours,
     * but an installation token does not.
     *
     * `null` during a REVIEW: it has `prToolCtx` for the pull request it reviews,
     * and its read-only behavior is a property of the tool set. Two locks, as with
     * `create_pr`: the tool is not in its set, and the handler is not wired to it.
     */
    // Chunk background jobs (MIN-114). They die BEFORE every push (a watcher that
    // writes during `git add -A` would commit anything) and in any case at chunk
    // end (`finally`): an abandoned process would consume the microVM until the
    // reaper and still be there on the next turn without the model knowing. The
    // registry does not survive the chunk — this is intentional, and the tool says so.
    //
    // NONE ON A LOCAL TURN (MIN-293): `run_background` is not provided on a
    // machine (see `agentToolsFor`), and this registry has only ever been used for
    // the `finally` safety-net `stopAll` since the loop moved into the microVM.
    backgroundJobs = host
      ? new BackgroundJobs(repoBackgroundRunner(host), run.continuations * 1000)
      : null;

    // Files edited since the last type-check (MIN-110). Cleared on every check: a
    // turn that changes nothing afterward does not launch a second one. SHARED with
    // subagents (MIN-112): this is what type-check reads, and a child that breaks a
    // type must report it before the parent responds.
    //
    // SEEDED from the checkpoint (MIN-210), like `instructions` and `lastFilesSha`:
    // this is TURN state, and a turn that spills into another chunk must type-check
    // what it edited BEFORE the soft deadline. The `completed` path does not write
    // it (the turn is finished there), so the seed remains empty on a turn's first
    // chunk.
    /** What the model verified itself on this chunk (MIN-262) — filled by
     *  `run_command`, invalidated by any edit, and read by the delivery gate.
     *  SHARED with children, like `editedPaths`. It does NOT travel in the
     *  checkpoint: a continued chunk has not seen anything pass green itself. */

    // `quotaNow` and `ledgerSpentUsd` are read above, before the microVM (MIN-223):
    // the run LLM key's cap depends on them, and that key precedes the network
    // policy, and therefore the VM.
    //
    // Two caps, with the tighter one winning: the account QUOTA and any cap the
    // caller set on THIS run. An automation chain does NOT add a third (MIN-147):
    // stopping it midway would leave a half-finished issue without a readable
    // explanation — the global, visible quota bounds spending.
    //
    /** Remaining account usage budget. `undefined` with BYOK. */
    const accountRemainingUsd =
      quotaNow && !quotaNow.unlimited ? Math.max(0, quotaNow.remaining ?? 0) : undefined;
    /**
     * What the run has already spent across all completed chunks — the amount
     * deducted from its cap.
     *
     * READ FROM THE LEDGER (MIN-215), not only from the `cost_usd` column: that
     * column is written only by the HEALTHY exit paths here, so a chunk that throws
     * midway (a failed `commitAndPush`) or whose invocation is killed at the time
     * limit never records its spending there — and the cap was replenished by that
     * amount. A $0.75 pass whose chunk 2 died after $0.40 would resume chunk 3 with
     * a nonexistent remainder and finish above its cap. The ledger is written CALL
     * BY CALL, before the accident: this is already the account-quota policy, which
     * avoids this exact problem (`checkAgentQuota` rereads actual usage for every
     * chunk). The total also includes `sandbox_compute` rows: the cap finally sees
     * the microVM half of the bill.
     *
     * The MAXIMUM of the two, not the ledger alone: `recordAiUsage` is best-effort
     * (it swallows errors), so a failed insert could leave the ledger below what the
     * column contains. Both are LOWER BOUNDS on actual spending — the larger is the
     * more accurate one. The same reasoning applies to falling back to the column
     * when the read fails: never worse than before.
     */
    const runSpentUsd = Math.max(run.cost_usd, ledgerSpentUsd ?? 0);
    /**
     * What remains of the cap set on THIS run — AFTER DEDUCTING already completed
     * chunks. Without this subtraction, the cap would refill on every continuation:
     * the loop compares its CHUNK cost with the budget, and a five-chunk run would
     * spend five times its cap.
     */
    const runCapRemainingUsd =
      run.budget_usd == null ? undefined : Math.max(0, Number(run.budget_usd) - runSpentUsd);
    const budgetUsd = minDefined(accountRemainingUsd, runCapRemainingUsd);
    /**
     * THE SAME CALCULATION, REREAD DURING THE CHUNK (MIN-224).
     *
     * `budgetUsd` above is a snapshot, and nothing reserves budget: two runs launched
     * in the same second read the same remainder and each treats it as a cap, so
     * they can spend twice as much. This chunk already rereads it at entry — at most
     * every five minutes; this hook tightens that to one.
     *
     * Throttled here rather than in the loop: the read costs two requests (billing +
     * ledger total), and a round can last three seconds. `null` means not yet time
     * or a failed read — the loop then keeps its cap; unreachable billing does not
     * stop a run.
     */
    /**
     * ── THE BRANCH (MIN-224) ────────────────────────────────────────────
     *
     * Everything above is BOOTSTRAP, shared by both engines: resolve the repository,
     * model, key, and issue context; wake the microVM; apply the network policy; and
     * build history. One implementation, therefore — bootstrap written twice would
     * diverge, and the divergence would appear in the first system message.
     *
     * What follows happens elsewhere. The function writes the harness into the VM,
     * starts the loop detached, persists the command ID, and RETURNS CONTROL. No
     * soft deadline, chunk budget, or waiting: the turn lives as long as needed,
     * and calls the control plane itself to suspend.
     *
     * The run remains `running` — correctly, it is running. What takes it out of
     * that state is its own turn-completion report, or the watchdog after it notices
     * that its process died (`reapDeadVmRuns`, drain.ts).
     */
    /**
     * THE SESSION MEMORY, ASSEMBLED HERE AND NOWHERE ELSE. Read once per TURN — the
     * run row is reread on every control-plane call, which is why the journal lives
     * outside it.
     */
    const pointer = run.checkpoint?.opencode;
    const opencodeJournal = pointer?.sessionId
      ? {
          sessionId: pointer.sessionId,
          events: await loadRunJournal(run.id, pointer.sessionId),
          seq: pointer.seq ?? {},
        }
      : undefined;
    // `bootstrapMs` is intentionally missing: `startVmLoop` sets it because it knows
    // when bootstrap ends (see `VmJob.bootstrapMs`).
    const job: Omit<VmJob, "bootstrapMs"> = {
      protocolVersion: VM_PROTOCOL_VERSION,
      /**
       * WHERE THIS TURN WORKS (MIN-354). A microVM is created for one run and that
       * run alone: its layout is the cloud layout, with no other choice to make.
       * What changes is that the harness LEARNS it instead of assuming it — which
       * lets another launcher provide a different one.
       */
      layout: cloudLayout(),
      runId: run.id,
      ledgerRunId: run.run_id ?? run.id,
      projectId: run.project_id,
      appOrigin: agentControlOrigin(),
      ...(selfHostedSandbox
        ? {
            controlToken: serverControlToken!,
            executionEnvironment: "server" as const,
            llmRelayUrl: llmRelayUrl!,
          }
        : {}),
      model: run.model,
      baseUrl,
      provider,
      llmPlaceholderKey: AGENT_LLM_PLACEHOLDER_KEY,
      reasoningLevel: run.reasoning_level,
      contextWindow,
      inputUsdPerMTok,
      ...(modelPricing ? { pricing: modelPricing } : {}),
      anchor,
      writesToRepo,
      interactive: !run.routine_id,
      chain: !!run.chain_id,
      imageInput,
      webSearch: webSearchAllowed,
      // The turn's search cap travels WITH the job: the constant lives in the module
      // that bills search, and that module is not included in the microVM bundle
      // (see `VmJob.webSearchMax`).
      webSearchMax: MAX_WEB_SEARCHES_PER_TURN,
      subagents: {
        models: subagentModels,
        favorites: subagentFavorites,
        /**
         * A REVIEW DOES NOT DELEGATE, and this cap enforces that in opencode: the
         * config serves the `task` tool whenever it is > 0
         * ([opencode-config.ts](vm/opencode-config.ts), `primaryTools`). Both
         * prompts already impose the same condition (l.1308 and l.1442), but the
         * job had lost it: the model received a delegation tool its anchor did not
         * describe and `PR_REVIEW_TOOLS` refused, and a review could open two child
         * sessions that EDIT.
         */
        maxParallel: writesToRepo ? subagentMaxParallel : 0,
        allowedIds: subagentScope.allowedIds,
        abovePlanIds: subagentScope.abovePlanIds,
        maxMultiplier: subagentScope.maxMultiplier,
        ...(Object.keys(subagentPricing).length > 0 ? { pricing: subagentPricing } : {}),
      },
      /**
       * THE PREVIOUS TURN'S OPENCODE JOURNAL — it is the memory of a run led by
       * opencode, and it was not passed into the microVM (MIN-286).
       *
       * The supervisor replays it (`/sync/replay`) to recover its session; without
       * it, `job.opencode` is `undefined`, a NEW session is created, and the turn
       * resumes without a line of its conversation. The write path was complete
       * end to end (the supervisor exports it, the control plane stamps it,
       * `AgentCheckpoint` declares it): only this read was missing, so nothing
       * showed up — no error, no type failure, just an agent with amnesia from one
       * turn to the next.
       */
      /**
       * THE JOURNAL, REASSEMBLED FROM ITS TABLE (MIN-286, 2026-08-13). The run row
       * carries only its pointer: events are appended to `agent_run_journal`, because
       * they carry the complete output of every tool and a checkpoint could not hold it.
       */
      ...(opencodeJournal ? { opencode: opencodeJournal } : {}),
      opencodeInput,
      instructions,
      usageSeqStart,
      ...(budgetUsd !== undefined ? { budgetUsd } : {}),
      editedPaths: [...(run.checkpoint?.editedPaths ?? [])],
      repoTouched: run.checkpoint?.repoTouched === true,
      prInlineComments: run.checkpoint?.prInlineComments ?? 0,
      baseBranch,
      workBranch,
      // A first turn whose branch has not yet been stamped cannot exist on the
      // remote. The harness can start directly from HEAD instead of paying for a
      // `git fetch` destined to return "ref does not exist". Without a linked
      // repository there is no remote at all: the answer is always no.
      remoteWorkMayExist: target != null && (run.branch_name != null || run.continuations > 0),
      /**
       * THE FUNCTION CAN PRODUCE ONLY A CLONE (MIN-358). It created the microVM and
       * cloned into it; the `current` mode belongs to a launcher that works in a
       * repository that existed before it.
       */
      repoMode,
      /**
       * A review commits NOTHING: resolving the App bot would cost a provider call
       * for an identity nobody will use. Elsewhere it is the process-memoized bot
       * (see `getGithubBotCommitIdentity`).
       */
      committer: prRun
        ? defaultCommitterIdentity()
        : await committerPromise,
      // This URL is credential-free in Vercel sandboxes and points at the
      // run-scoped trusted relay in self-hosted sandboxes. Only desktop-local
      // execution retains the legacy authenticated URL on the user's machine.
      ...(sandboxRepoUrl ? { authUrl: sandboxRepoUrl } : {}),
      commitRef,
      filesFromSha,
      locale: commentLocale,
      feature: usageFeature,
    };
    /**
     * THE TURN STARTS ON A MACHINE (MIN-293) — and the function stops here.
     *
     * It has done all its work: context, model, cap, spending lease, branch,
     * committer identity, and push URL. What it cannot do is write to a disk it
     * cannot see — so it RETURNS the job instead of placing it.
     *
     * **`layout` is absent, and this is the batch invariant**: the server owns
     * everything related to the run, while the machine owns everything related to
     * the disk (see [lib/desktop/local-turn.ts](../../desktop/local-turn.ts)).
     * `bootstrapMs` is absent too: there is no microVM whose wake-up must be billed.
     *
     * NO `loop_command_id`: there is no platform command to query. The watchdog
     * knows this since MIN-355 and gives a local run the two-hour limit rather than
     * the fifteen-minute one (`reapDeadVmRuns`, drain.ts) — this is the first of the
     * audit's seven failures, and it is fixed there, not here.
     *
     * The run remains `running`: it is running. Its turn-completion report or the
     * watchdog will take it out of that state, exactly as in the cloud.
     */
    if (localTurn) {
      /**
       * ⚠ **`layout` IS REMOVED HERE, BY HAND, AND THAT IS THE HEART OF THE MATTER.**
       *
       * The `onLocalAssignment` type says `Omit<VmJob, "layout" | "bootstrapMs">`,
       * and it is **a compiler fiction**: the object above does carry
       * `layout: cloudLayout()` at runtime, because one was needed to satisfy
       * `VmJob`. Sent as-is, it would give the machine the `/vercel/sandbox` paths
       * — a directory that does not exist there, and, more importantly, a layout
       * the server has NO way to know.
       *
       * The shell parser rejected it, correctly: `"layout" in job` is a hard
       * rejection there ([lib/desktop/local-turn.ts](../../desktop/local-turn.ts)),
       * precisely because `repoDir` is the security root for all model writes and
       * must not be received from elsewhere.
       *
       * The lesson is worth recording: **an `Omit<>` across a network boundary
       * removes nothing.** What caught the mistake was the guard on the other side,
       * not the type.
       */
      const { layout: _cloudLayout, ...assignment } = job;
      opts.onLocalAssignment?.(assignment, {
        // `null` = the project has no linked repository: the machine validates
        // the attached folder as a plain git checkout, without remote comparison.
        repoFullName: target?.repoFullName ?? null,
      });
      // The initial claim (or steering of a continuation) already refreshed activity.
      // We only await the event started at the beginning: in practice it finished
      // long ago, without adding another SQL write.
      await runningEvent;
      // The loop-started flag is NOT set here: it means “a microVM is running, and
      // the loop will bill it”. There is none, and the existing `!sandbox` guard in
      // `billSandboxCompute` is sufficient. Setting both would give two reasons not
      // to bill the same thing, and eventually two reasons that diverge.
      return "detached";
    }

    // `sandbox`, not `sb`: the compiler knows it is non-null here because the local
    // branch returned just above.
    if (!sandbox) throw new Error("no sandbox to start the loop in");
    const cmdId = await startVmLoop(sandbox, job, callStart);
    await stampRun(run.id, {
      loop_command_id: cmdId,
      last_activity_at: new Date().toISOString(),
    });
    /**
     * FROM HERE ON, COMPUTE BELONGS TO THE LOOP. It will bill the entire turn —
     * including bootstrap, which we just passed to it. `finally` must therefore
     * write nothing more, or it would count the same microVM twice.
     *
     * Set AFTER the stamp, not before: if the stamp fails, the turn starts without
     * its `loop_command_id` in the database — the completion report will be rejected
     * with 409 and the watchdog will have nothing to query. Nobody will bill that
     * microVM unless we do.
     */
    vmLoopLaunched = true;
    return "detached";
  } catch (err) {
    // Redacted BEFORE any use (MIN-239): a rejected `git clone` copies the entire
    // clone URL — including the token — into stderr, and this message goes into the
    // `error` event and then `agent_runs.error_message`, which the UI displays.
    const message = secrets.redact(err instanceof Error ? err.message : String(err));
    await emit("error", { message });
    /**
     * Run spending READ FROM THE LEDGER (MIN-215), to be written on this path's
     * suspension stamps. A chunk that throws exits its loop without any `newCost`:
     * its model spending is in the ledger, but `cost_usd` never saw it. Nothing
     * could recover it afterward — the next chunk starts from the column, so the
     * gap is permanent: `recomputeChainSpend` undercounts the chain,
     * `medianCostByIntent` biases its estimates, and “Previous executions” shows
     * less than was paid.
     *
     * Written as-is rather than accumulated: the catch does not know what this
     * chunk spent (it has no `result`), and the ledger total is already the run total.
     * `Math.max` for the same reason as at chunk entry — the ledger is best-effort,
     * the column may contain a row it missed, and displayed spending must never go
     * backward.
     *
     * This chunk's compute is billed BEFORE the reread (MIN-224), as on healthy
     * suspensions: otherwise a dead chunk's column would contain the model but not
     * the microVM it actually woke, and the two engines would still write different
     * things.
     */
    await billSandboxCompute();
    const spentUsd = await spentFromLedger(run.run_id ?? run.id);
    const costFromLedger =
      spentUsd == null ? {} : { cost_usd: Math.max(run.cost_usd, spentUsd) };
    // BOOTSTRAP error (repository/model/clone: sandbox never acquired).
    if (!sandbox) {
      // An EXISTING CONVERSATION (checkpoint) never dies on a bootstrap error — often
      // transient (GitHub token minting, 502). SUSPEND with the visible error: the
      // next message retries bootstrap with the context intact. Only a BLANK run
      // (nothing to preserve) fails as `failed`.
      if (run.checkpoint?.messages?.length) {
        await stampRun(run.id, {
          status: "completed",
          error_message: cap(message, 1000),
          continuations: 0,
          attempts: 0,
          last_activity_at: new Date().toISOString(),
          interrupt_requested: false,
          // Nothing was spent IN this chunk (bootstrap does not call the model), but
          // a previous chunk may have died without stamping: this suspension is an
          // opportunity to bring the column back in line with the ledger.
          ...costFromLedger,
        });
        await notifyAgentRun(run, "agent_failed");
        return "completed";
      }
      await stampRun(run.id, {
        status: "failed",
        error_message: cap(message, 1000),
        checkpoint: null,
        continuations: 0,
      });
      await notifyAgentRun(run, "agent_failed");
      return "failed";
    }
    // ERROR DURING THE TURN → the session remains resumable: SUSPEND, preserving
    // the last healthy checkpoint (not overwritten) and keeping the microVM. If a
    // steering message is waiting (accepted during the turn, never drained),
    // RE-QUEUE it so it is not orphaned — bounded by `attempts` (incremented at every
    // claim and never reset on this path) so a persistent error does not loop
    // claim → error → re-queue forever.
    await clearInterrupt(run.id).catch(() => {});
    const retryForPending =
      run.attempts < MAX_ERROR_REQUEUE_ATTEMPTS &&
      (await hasPendingRunMessages(run.id).catch(() => false));
    await stampRun(run.id, {
      status: retryForPending ? "queued" : "completed",
      ...(retryForPending
        ? { not_before: new Date().toISOString() }
        : // Healthy suspension: the crash-retry budget starts over (otherwise it
          // would be consumed over the run's lifetime and the next crash would erase
          // its checkpoint through requeueStuckRuns).
          { attempts: 0 }),
      error_message: cap(message, 1000),
      continuations: 0,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      last_activity_at: new Date().toISOString(),
      interrupt_requested: false,
      ...costFromLedger,
    });
    if (!retryForPending) await notifyAgentRun(run, "agent_failed");
    return "completed";
  } finally {
    // Background-job safety net (MIN-114): push paths have already killed them, but
    // the mid-turn ERROR path has not — and a surviving server would keep the
    // microVM awake until the reaper. Best-effort, never blocking.
    if (backgroundJobs) await backgroundJobs.stopAll().catch(() => 0);

    // Sandbox compute metering (MIN-72): every execution slice in which the microVM
    // was awake is billed by wall-clock time — including failed turns. A dedicated
    // seq range prevents collisions with LLM-call sequences (continuations × 1000
    // + rounds).
    /**
     * THE SAFETY NET, not the normal path (MIN-224). Suspensions now bill BEFORE
     * rereading the ledger, so `cost_usd` means the same thing in both engines;
     * `billSandboxCompute` is idempotent, so what passes here is what passed through
     * no suspension — a throw outside `catch`, or an exit nobody anticipated.
     *
     * NOT when the loop has STARTED in the microVM: the turn is not finished when
     * this function returns, and its wall-clock is tracked by the loop itself —
     * including bootstrap, which was passed in its job (`VmJob.bootstrapMs`). Billing
     * here as well would count the same microVM twice. The guard lives in
     * `billSandboxCompute`.
     *
     * BUT WE BILL WHEN IT HAS NOT STARTED, and that was the missing gap.
     * Bootstrap that THROWS — failed clone, rejected `writeFiles`, invalid network
     * policy — still woke a machine and sometimes cloned an entire
     * repository, then fell into `catch` without any report ever arriving. The
     * watchdog does not catch it either: it scans only `running` runs, and this one
     * has just been suspended. The function is therefore the only witness to that
     * compute.
     */
    await billSandboxCompute();
  }
}
