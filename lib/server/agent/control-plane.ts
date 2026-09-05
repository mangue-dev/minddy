import "server-only";

import { MCP_CLIENT_TOOL_NAMES } from "@/lib/mcp-client-tools";
import { executeAgentMcpTool } from "./mcp-client";

import {
  recordAiUsage,
  type AiUsageBillTo,
  type AiFeature,
} from "@/lib/server/ai-usage";
import { getAccountSettings } from "@/lib/server/account-settings";
import { afterOrNow } from "@/lib/server/after-safe";
import { defaultLocale } from "@/i18n/config";
import { DEFAULT_NUMO_STATUS } from "@/lib/numo-default-status";

import { executeIssueTool, type IssueToolContext } from "./issue-tools";
import type { AgentLiveEdit, AgentLiveFileStat } from "./agent-contract";
import { CHANGED_FILES_CAP } from "./repo-host";
import {
  DEFAULT_AGENT_BRANCH_PREFIX,
  generatedAgentBranchName,
  isValidGitBranchName,
} from "./branch-name";
import { localDiffPayload } from "./local-diff-payload";
import {
  anchorForRun,
  ISSUE_TOOL_NAMES,
  PLATFORM_TOOLS_BY_ANCHOR,
  PR_TOOL_NAMES,
  PROJECT_PR_TOOL_NAMES,
  SCRATCHPAD_TOOL_NAMES,
} from "./platform-tool-names";
import { WEB_SEARCH_SEQ_BASE } from "@/lib/server/web-search";
import {
  checkUsageClaim,
  USAGE_COST_FLOOR_USD,
  type UsageModelPricing,
} from "./usage-claim";
import type { VmTurnReport } from "./vm/protocol";
import {
  executeScratchpadTool,
  type ScratchpadToolContext,
} from "./scratchpad-tools";
import { agentRunTopic, broadcastToTopic } from "./live";
import {
  appendEvent,
  appendRunJournal,
  clearInterrupt,
  claimRunRest,
  getRun,
  hasPendingRunMessages,
  pullPendingMessages,
  readInterruptFlag,
  requeueRunMessage,
  releaseRunInlineComment,
  reserveRunInlineComment,
  stampRun,
  stampRunResult,
  type AgentRun,
} from "./runs";
import type { AgentCheckpoint } from "./runs";
import type { AgentEventType } from "./agent-contract";
import { parseAgentMentions } from "@/lib/agent-mentions";
import { surfaceForAgentRun } from "@/lib/ai-surfaces";
import { getProjectAccess } from "@/lib/server/project-access";
import { AI_REVIEW_MAX_INLINE_COMMENTS } from "./tools";

/**
 * microVM CONTROL PLANE (MIN-223) — the only surface through which a
 * loop that lives in the VM will touch the base, the ledger, the tickets and the notebook.
 *
 * WHAT MAKES IT STAND, and it's just one idea. The VM does not carry any token
 * TO TALK HERE: the Vercel Sandbox firewall forwards its requests to our
 * road by adding an OIDC signed by the platform, whose claim
 * `sandbox_name` is `agent-<run.id>`. **The `runId` is therefore a parameter
 * INPUT of this module, derived from this claim — never read in the body of the
 * query.** Everything else follows from this:
 *
 * - a VM can only write events on ITS run, not because it is checked,
 * because it cannot claim anything else;
 * - the live broadcast on the topic DERIVED from the run, never on that of the body —
 * a Supabase key with reduced range would not have been able to prevent it, the topic being
 * a parameter;
 * - the ledger imputes to the `created_by` of the run line, not to a `billTo`
 * sent: the VM does not choose who pays for what it spends.
 *
 * SEPARATE FROM THE ROAD ON PURPOSE. The road
 * ([app/api/agent-vm/[...path]/route.ts](../../../app/api/agent-vm/[...path]/route.ts))
 * just checks the OIDC and derives the run; this module is testable
 * without HTTP, and this is where the invariants that a test must be able to live
 * casser.
 *
 * WHAT WAS ADDED WITH THE LOOP (MIN-224). PULL REQUEST tools,
 * `create_pr` and `web_search` are now served: what was missing was not
 * the surface but what the loop would send — the counter of anchors placed,
 * the push state of the round. `/rest` completes the turn, while `/repo-auth`
 * rotates an expiring forge credential in trusted network infrastructure.
 *
 * FORGE CREDENTIALS DO NOT ENTER THE SANDBOX (MIN-421).
 * The firewall or trusted runner relay supplies repository-scoped Git
 * authentication after requests leave the untrusted process. The remote stored
 * in `.git/config` is credential-free or contains only the run-scoped relay
 * credential. A refresh updates infrastructure and returns no forge secret.
 *
 * AND THERE IS NOW A SECOND ADMISSION ROUTE (MIN-355). A trick that plays
 * on the user's machine does not have a firewall to sign anything
 * either: it CARRYS an HS256 token that we have signed
 * ([local-exec-token.ts](local-exec-token.ts)), and the `runId` remains a parameter
 * input to this module — derived from a claim, as before, but from a claim of ours.
 *
 * What that changes, and it must be said in these terms: **this token lives on a
 * disc that the model can read.** We therefore do not treat its confidentiality, we
 * reduces its POWER — `opts.local` lower, and the two refusals it triggers:
 * `/repo-auth`, and `status = 'running'` required wherever the run line is read.
 * Two and not three: the removal of `set_scratchpad` was ruled out, and why
 * is written where it would have landed (`/tool/`). What remains open is what a
 * local tour must be able to do to be a tour.
 *
 * AND A SURFACE THAT EXISTS ONLY FOR HIM (MIN-357). Without a firewall, no one
 * places the key of the model at the exit of the machine: `/llm-key` returns it, and it
 * is the mirror of `/repo-auth` — refused to the cloud as the other is refused to
 * local. It NEVER returns more than a minted key with a hard ceiling: which limits the
 * damage from a token read by the model is not a hiding place, it is this ceiling.
 *
 * THE CUT THAT GUIDES IT ALL: the microVM has the DEPOSIT, the function has the FORGE and
 * the BASIC. `create_pr` is cut exactly there — the VM pushes, the function opens.
 */

/** What a surface renders: an HTTP status and a JSON body. */
export interface ControlPlaneResult {
  status: number;
  body: unknown;
}

const ok = (body: unknown = { ok: true }): ControlPlaneResult => ({
  status: 200,
  body,
});
const bad = (message: string): ControlPlaneResult => ({
  status: 400,
  body: { error: message },
});
/**
 * THIS RUN IS NOT ALLOWED, and it is a 403 — never a 404 (MIN-326). The 404 says
 * “it doesn’t exist”, which is false from one tool perfectly alive on another
 * anchoring: it sends to diagnose a missing tool where refusal is the rule.
 */
const forbidden = (message: string): ControlPlaneResult => ({
  status: 403,
  body: { error: message },
});

/**
 * Body ceiling of the control plane, MEASURED (2026-08-07): a forwarded POST
 * goes to 4 MiB and is refused in 413 `FUNCTION_PAYLOAD_TOO_LARGE` from 4.3 MiB
 * — this is the 4.5 MB limit for Vercel functions, which forward does not cover.
 *
 * It is UNDER `MAX_CHECKPOINT_BYTES` (8 MB, checkpoint-fit.ts): a checkpoint
 * to its current ceiling would not pass. We refuse here, explicitly, rather than
 * to let the platform render a 413 in HTML that a loop would read as “the
 * checkpoint is written.” Catch-up — lower the ceiling, or take out the
 * checkpoint of this road — belongs to MIN-224.
 */
export const CONTROL_PLANE_MAX_BODY_BYTES = 4_000_000;

/** Features of ledger that a VM has the right to write. Closed: without it, a VM
 * compromised would charge its expense to `numo_chat` and remove it from the counters
 *  de l'agent. */
const VM_ALLOWED_FEATURES = new Set<AiFeature>([
  "agent_code",
  "routine_code",
  "sandbox_compute",
  "routine_compute",
  "web_search",
  "pr_review",
]);

/**
 * What a re-queue can carry (MIN-329) — the same terminals as the door
 * message entry ([app/api/agent-runs/[runId]/steer/route.ts](../../../app/api/agent-runs/[runId]/steer/route.ts),
 * `MAX_LEN`), since we only put back what came from it. The number is large
 * on purpose: a turn rarely drains more than two or three messages, and the terminal
 * is there just so there is one.
 */
const MAX_MESSAGE_LEN = 4000;
const MAX_REQUEUED_MESSAGES = 50;

/** Who pays for what this run spends — HIS line, not what the VM says. */
function billToFor(run: AgentRun): AiUsageBillTo {
  return run.created_by
    ? { userId: run.created_by }
    : { unattributed: `run ${run.id} sans created_by` };
}

function repoTargetMatchesRun(
  run: AgentRun,
  target: {
    linkId: string;
    connectionId: string;
    provider: string;
    externalRepoId: string;
  },
): boolean {
  return (
    target.linkId === run.repo_link_id &&
    target.connectionId === run.connection_id &&
    target.provider === run.repo_provider &&
    target.externalRepoId === run.repo_external_id
  );
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * A CALL INDEX, never anything else (MIN-329). `seq` arranges the lines of a run
 * in bands (model calls, `web_search`, `sandbox_compute`): a number
 * negative or excessive does not lose money, it lands a line
 * in the band of another feature — so a fair total, placed in the wrong
 * place, which is more difficult to see than a frank error.
 */
const MAX_SEQ = 100_000;
function seqField(raw: unknown, max = MAX_SEQ): number {
  const n = num(raw);
  if (n === null) return 0;
  return Math.min(Math.max(0, Math.round(n)), max);
}

/**
 * The price of the model, ASKED ONLY WHEN IT CAN CHANGE THE ANSWER.
 *
 * The calculated ceiling never bites under `USAGE_COST_FLOOR_USD` (cf.
 * `checkUsageClaim`), and the overwhelming majority of lines are within a few
 * thousandths of a dollar. Going to read the OpenRouter index for each of them would be
 * one network query per model round for a verdict known in advance.
 */
async function usagePricingFor(
  model: string | null,
  cost: unknown,
): Promise<UsageModelPricing | null> {
  if (!model || typeof cost !== "number" || !(cost > USAGE_COST_FLOOR_USD))
    return null;
  try {
    const { getOpenRouterModelInfo } = await import("./openrouter-index");
    return await getOpenRouterModelInfo(model);
  } catch (err) {
    // An unreachable index must not cause the line to be lost: without a tariff, only
    // hard bounds apply — that's exactly what `null` renders.
    console.error(
      "[agent-control-plane] pricing read failed:",
      (err as Error).message,
    );
    return null;
  }
}

const LIVE_FILE_STATUSES = new Set(["added", "modified", "deleted", "renamed"]);

/**
 * The file list of a live load, reduced to what it claims to be:
 * non-empty paths, known status, and no more than the list cap
 * authoritarian. Nothing that the VM invents crosses.
 */
function liveFiles(
  raw: unknown,
  claimedTruncated: unknown,
): { files?: AgentLiveEdit[]; filesTruncated?: boolean } {
  if (!Array.isArray(raw)) return {};
  const files: AgentLiveEdit[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.path !== "string" || !r.path) continue;
    files.push({
      path: r.path,
      status: (typeof r.status === "string" && LIVE_FILE_STATUSES.has(r.status)
        ? r.status
        : "modified") as AgentLiveEdit["status"],
      ...(typeof r.previousPath === "string"
        ? { previousPath: r.previousPath }
        : {}),
    });
    if (files.length === CHANGED_FILES_CAP) break;
  }
  if (files.length === 0) return {};
  // The confession of truncation is that of the TWO terminals: the one here (what the relay
  // cut) and that of the VM, which already limits to the same ceiling before sending.
  // Without the second term, a list cut UPSTREAM arrived with `raw.length ===
  // files.length` — so without truncation to declare, and the thread read a list
  // bounded as a complete list.
  return {
    files,
    filesTruncated: raw.length > files.length || claimedTruncated === true,
  };
}

/** Exact meters provided by local harness. They remain validated and narrow-minded
 * before joining the real-time topic, like the simple paths above. */
function liveFileStats(raw: unknown): AgentLiveFileStat[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const files: AgentLiveFileStat[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.path !== "string" || !r.path) continue;
    files.push({
      path: r.path,
      status: (typeof r.status === "string" && LIVE_FILE_STATUSES.has(r.status)
        ? r.status
        : "modified") as AgentLiveFileStat["status"],
      additions: Math.max(0, Math.round(num(r.additions) ?? 0)),
      deletions: Math.max(0, Math.round(num(r.deletions) ?? 0)),
      ...(typeof r.previousPath === "string"
        ? { previousPath: r.previousPath }
        : {}),
    });
    if (files.length === CHANGED_FILES_CAP) break;
  }
  return files.length > 0 ? files : undefined;
}

/**
 * What this turn still has the right to spend, re-read from the ledger.
 *
 * New platform runs use their atomically reserved account amount. Legacy rows
 * without a reservation fall back to the live monthly remainder, while BYOK
 * runs have no account ceiling. A run-specific budget (routines/chains) remains
 * a separate governor, and the tighter remaining amount wins.
 *
 * `null` means no applicable ceiling or a failed read; the VM then keeps its
 * previous limit rather than treating an infrastructure error as exhaustion.
 */
async function turnBudgetRemainingUsd(run: AgentRun): Promise<number | null> {
  try {
    const [{ checkAgentQuota }, { spentFromLedger }] = await Promise.all([
      import("./quota"),
      import("@/lib/server/ai-usage"),
    ]);
    const [quota, spent] = await Promise.all([
      checkAgentQuota(run.created_by ?? ""),
      spentFromLedger(run.run_id ?? run.id),
    ]);
    const runSpent = Math.max(run.cost_usd, spent ?? 0);
    const account = quota.unlimited
      ? null
      : run.managed_budget_usd == null
        ? Math.max(0, quota.remaining ?? 0)
        : Math.max(0, Number(run.managed_budget_usd) - runSpent);
    const fromRun =
      run.budget_usd == null
        ? null
        : Math.max(0, Number(run.budget_usd) - runSpent);
    const both = [account, fromRun].filter((v): v is number => v !== null);
    return both.length ? Math.min(...both) : null;
  } catch (err) {
    console.error(
      "[agent-control-plane] budget read failed:",
      (err as Error).message,
    );
    return null;
  }
}

const ACTIVE_RUN_STATUSES: AgentRun["status"][] = ["queued", "running"];
const ACCESS_REVOKED_ERROR = "run owner no longer has project access";
type RevocableAgentRun = Pick<
  AgentRun,
  | "id"
  | "status"
  | "sandbox_id"
  | "provider_key_id"
  | "local_exec"
  | "local_exec_gen"
>;

/**
 * Remove every capability held by an active run whose creator no longer has
 * access to its project. The database transition happens first so another
 * worker cannot reclaim the run while external cleanup is in progress.
 */
async function revokeRunAuthority(
  run: RevocableAgentRun,
  reason = ACCESS_REVOKED_ERROR,
): Promise<void> {
  if (ACTIVE_RUN_STATUSES.includes(run.status)) {
    await stampRun(
      run.id,
      {
        status: "canceled",
        interrupt_requested: true,
        error_message: reason,
        ...(run.local_exec ? { local_exec_gen: run.local_exec_gen + 1 } : {}),
      },
      { guard: [...ACTIVE_RUN_STATUSES] },
    ).catch(() => null);
  }

  if (run.provider_key_id) {
    const { revokeRunKey } = await import("./run-key");
    await revokeRunKey(run.provider_key_id).catch(() => {});
    await stampRun(
      run.id,
      { provider_key_id: null },
      { guard: ["canceled"] },
    ).catch(() => null);
  }

  if (run.sandbox_id) {
    const { stopSandboxByName } = await import("./sandbox");
    await stopSandboxByName(run.sandbox_id).catch(() => {});
  }
}

/**
 * Proactively revoke active runs immediately after a project membership is
 * removed. Per-request admission below remains the authoritative backstop for
 * removals performed outside the application lifecycle.
 */
export async function revokeMemberAgentAuthority(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  const { getServiceClient } = await import("@/lib/supabase-service");
  const { data, error } = await getServiceClient()
    .from("agent_runs")
    .select(
      "id, status, sandbox_id, provider_key_id, local_exec, local_exec_gen",
    )
    .eq("project_id", input.projectId)
    .eq("created_by", input.userId)
    .in("status", [...ACTIVE_RUN_STATUSES]);
  if (error) throw new Error(`active run lookup failed: ${error.message}`);

  await Promise.all(
    ((data ?? []) as RevocableAgentRun[]).map((run) => revokeRunAuthority(run)),
  );
}

/**
 * A request from the control plane. `runId` comes from OIDC; `surface` is the
 * chemin sous `/api/agent-vm` (`/events`, `/tool/read_issue`…).
 */
export async function handleControlPlaneRequest(opts: {
  runId: string;
  method: string;
  surface: string;
  /** JSON body already parsed. `null` on a GET. */
  body: Record<string, unknown> | null;
  /**
   * Name of the calling microVM, as signed by the platform. The `runId`
   * is already derived from it — here it is the same thing seen from the BASE: the line
   * of the run should recognize this microVM as its own (MIN-331). Today
   * the name is deterministic, so the equality holds by construction; the day when
   * it would stop holding on, it's a VM that speaks for a run that it
   * does not execute, and this is not a discrepancy to be discovered in the logs.
   */
  sandboxName?: string;
  /**
   * THE TOUR PLAYS ON THE USER'S MACHINE (MIN-355), and the `runId` above
   * therefore does not come from an OIDC of the platform but from a token that WE have
   * signed (`admitLocalCaller`, [local-exec-token.ts](local-exec-token.ts)).
   *
   * Present = the local path, with the lease generation that the token carries. This
   * is not an information flag: it is what triggers the reductions in
   * lower power — the token lives on a disk that the model can read, and
   * pretending to protect him would be the only thing we couldn't hold.
   */
  local?: { gen: number };
  /** A sandbox launched by the built-in self-hosted server runner. */
  server?: true;
}): Promise<ControlPlaneResult> {
  const { runId, method, surface } = opts;
  const body = opts.body ?? {};

  // The line of the run is the CONTEXT, and it is reread at each call: this is what
  // which makes the surface stateless, therefore safe to call from a VM which can
  // die between two requests. A deleted run (retention) or sandbox name
  // which does not correspond to anything falls here, no further.
  const run = await getRun(runId);
  if (!run) return { status: 404, body: { error: "unknown run" } };

  // The microVM of the run is named once and for all and persisted: another
  // has nothing to write here, even signed by the platform (MIN-331). `null` =
  // run whose VM is not yet registered, let it pass.
  if (
    opts.sandboxName &&
    run.sandbox_id &&
    run.sandbox_id !== opts.sandboxName
  ) {
    return { status: 403, body: { error: "sandbox does not run this run" } };
  }

  // The run creator is the identity whose project and repository authority is
  // replayed by every surface below. Revalidate it on every stateful request:
  // launch-time membership is a past fact and cannot authorize a live run.
  const { runRepoBindingIsCurrent } = await import("./runs");
  const [access, bindingCurrent] = await Promise.all([
    run.created_by
      ? getProjectAccess(run.created_by, run.project_id).catch(() => null)
      : Promise.resolve(null),
    runRepoBindingIsCurrent(run).catch(() => false),
  ]);
  if (!access?.isMember) {
    await revokeRunAuthority(run);
    return { status: 409, body: { error: ACCESS_REVOKED_ERROR } };
  }
  if (!bindingCurrent) {
    await revokeRunAuthority(run, "run repository binding has changed");
    return {
      status: 409,
      body: { error: "run repository binding has changed" },
    };
  }

  /**
   * WHAT THE LOCAL PATH PAYS FOR EACH CALL (MIN-355), and why it's here.
   *
   * The run line is already read three lines higher: these three controls do not
   * therefore cost NOTHING more, and that is the whole argument of the self-supporting token.
   * A hashed opaque token would have been revocable in nature, but at the cost of
   * lookup on `/stream` — ~29,000 per two-hour turn, exactly the
   * load that its short circuit exists to remove.
   *
   * 1. **The line must be local.** A signed token for a microVM run does not
   * should not exist; if it exists, it is a fault of ours, and it
   * stops there rather than opening a second route on a cloud run.
   * 2. **The generation must be the current one.** This is the only revocation of a
   * token that cannot be recalled: issuing the next one kills the previous one
   * (`issueLocalExecToken`), and the refusal is instantaneous here.
   * 3. **The run should WORK.** On the cloud path, only `/rest` required it —
   * the microVM of a concluded run being cut by the reaper, the question does not arise
   * didn't pose. A machine cannot be cut: without this line, a
   * fifteen minute token would continue to serve tools and consume the
   * steering queue of a completed conversation. The 409 is the one that the
   * control plane client already reads like "stop"
   * (`saveCheckpointQuietly`), and it is not retried.
   */
  if (opts.local) {
    if (!run.local_exec) return forbidden("this run does not execute locally");
    if (run.local_exec_gen !== opts.local.gen) {
      return forbidden(
        "local execution token superseded — ask the app for a fresh one",
      );
    }
    if (run.status !== "running") {
      return { status: 409, body: { error: "run is no longer running" } };
    }
  }
  if (opts.server) {
    if (run.local_exec)
      return forbidden(
        "a desktop-local run cannot execute in the server sandbox",
      );
    if (run.status !== "running") {
      return { status: 409, body: { error: "run is no longer running" } };
    }
  }

  if (run.status !== "running") {
    return { status: 409, body: { error: "run is no longer running" } };
  }

  /**
   * Live output is privileged control-plane output too. It stays behind the
   * same current membership, repository, sandbox, status, and local generation
   * checks as persisted surfaces, so revoking a lease also revokes broadcast.
   */
  if (method === "POST" && surface === "/stream") {
    const fileStats = liveFileStats(body.fileStats);
    afterOrNow(() =>
      broadcastToTopic(agentRunTopic(runId), "stream", {
        text: typeof body.text === "string" ? body.text : "",
        tools: num(body.tools) ?? 0,
        reasoningActive: body.reasoningActive === true,
        reasoningMs: num(body.reasoningMs) ?? 0,
        ...liveFiles(body.files, body.filesTruncated),
        ...(fileStats ? { fileStats } : {}),
        at: Date.now(),
      }),
    );
    return ok();
  }

  if (method === "POST" && surface === "/heartbeat") {
    const stamped = await stampRunResult(runId, {
      last_activity_at: new Date().toISOString(),
    });
    if (stamped.failed) {
      return { status: 503, body: { error: "heartbeat failed — retry" } };
    }
    if (!stamped.run) {
      return { status: 409, body: { error: "run is no longer running" } };
    }
    return ok();
  }

  if (method === "POST" && surface === "/diff") {
    if (!opts.local)
      return forbidden("local diff requires a local execution token");
    const diff = localDiffPayload(body);
    afterOrNow(() =>
      broadcastToTopic(agentRunTopic(runId), "diff", {
        ...diff,
        at: Date.now(),
      }),
    );
    return ok();
  }

  if (method === "POST" && surface === "/events") {
    const type = typeof body.type === "string" ? body.type : "";
    if (!type) return bad("events: missing type");
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    // `appendEvent` calculates `seq`, retry on collision and diffuses behind —
    // exactly what the loop does today, in the same place.
    await appendEvent(runId, type as AgentEventType, payload);
    return ok();
  }

  if (method === "POST" && surface === "/usage") {
    const feature = body.feature as AiFeature;
    if (!VM_ALLOWED_FEATURES.has(feature))
      return bad(`usage: feature not allowed (${feature})`);
    const model = typeof body.model === "string" ? body.model : run.model;
    /**
     * THE AMOUNT IS NOT A DECLARATION (MIN-329): limited, then capped by
     * what the reported tokens may cost at the model price. A `cost`
     * negative reset the month's consumption to nine, for the entire account.
     */
    const claim = checkUsageClaim(
      body,
      await usagePricingFor(model, body.cost),
    );
    if (!claim.ok) {
      // THIS IS TRACKED, and not only in the logs: a refused line is a
      // expense which does not enter anywhere, and this hole must be readable on the
      // run where it was done — this is what distinguishes “the VM lied” from a
      // meter that drifts for no apparent reason.
      console.error(
        `[agent-control-plane] usage refusée sur ${runId} — ${claim.reason}`,
      );
      await appendEvent(runId, "error", {
        code: "usageRejected",
        reason: claim.reason,
      });
      return bad(`usage: ${claim.reason}`);
    }
    if (claim.clampedFrom !== undefined) {
      console.error(
        `[agent-control-plane] usage plafonnée sur ${runId} — ${claim.clampedFrom} $ ` +
          `annoncés, ${claim.cost} $ écrits (${model})`,
      );
    }
    await recordAiUsage({
      // Same billing identifier as today's loop: the line of
      // ledger of a resumed run must fall under the same `run_id`, otherwise the ceiling
      // of the run no longer sees half of its expenditure.
      runId: run.run_id ?? run.id,
      seq: seqField(body.seq),
      feature,
      billTo: billToFor(run),
      model,
      ...(typeof body.provider === "string" ? { provider: body.provider } : {}),
      keyMode: run.key_mode,
      generationId:
        typeof body.generationId === "string" ? body.generationId : null,
      promptTokens: claim.promptTokens,
      completionTokens: claim.completionTokens,
      totalTokens: claim.totalTokens,
      cachedTokens: claim.cachedTokens,
      cacheWriteTokens: claim.cacheWriteTokens,
      cost: claim.cost,
      ...(claim.estimated ? { estimated: true } : {}),
      projectId: run.project_id,
    });
    return ok();
  }

  if (surface === "/checkpoint") {
    if (method === "GET") return ok({ checkpoint: run.checkpoint ?? null });
    if (method === "PUT") {
      const checkpoint = (body.checkpoint ?? null) as AgentCheckpoint | null;
      // The periodic backup also acts as a HEARTBEAT (MIN-224):
      // it is the only regular signal that a rook that lives in the VM produces, and
      // it is on this field that the watchdog decides to go and question the
      // platform. Without him, he would probe her for every run on every pass.
      const stamped = await stampRunResult(runId, {
        checkpoint,
        last_activity_at: new Date().toISOString(),
      });
      /**
       * A WRITE BREAK IS NOT A CONCLUDED RUN, and confusing them cost the
       * tower (MIN-286). The supervisor reads a 409 as "conversation does not exist
       * more”: he cuts, he does not push, he hands back. A base that refuses
       * the line — a null byte in the output of a command, a break — him
       * therefore said to abandon a perfectly alive trick. It's a 5xx: the
       * Control plane client retries, and the round continues.
       */
      if (stamped.failed) {
        return {
          status: 503,
          body: { error: "checkpoint save failed — retry" },
        };
      }
      // The guard of `stampRun` (`status in ('running')`) did not match: the run
      // been canceled, or another executor concluded. It’s SAID — a VM that believes
      // having saved and continuing works for a conversation that is over.
      if (!stamped.run)
        return { status: 409, body: { error: "run is no longer running" } };
      return ok();
    }
  }

  /**
   * THE OPENCODE JOURNAL, IN APPEND (MIN-286, 2026-08-13).
   *
   * The microVM only sends what `/sync/history` has just returned; there
   * base keeps the rest. This is what replaced “the checkpoint carries all the
   * journal", which could not hold: the complete output of each tool y
   * passes, and the body of the control plane is capped.
   */
  if (method === "POST" && surface === "/journal") {
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const events = Array.isArray(body.events)
      ? (body.events as Record<string, unknown>[])
      : [];
    if (!sessionId) return bad("journal: missing sessionId");
    await appendRunJournal(runId, sessionId, events);
    return ok({ appended: events.length });
  }

  if (method === "GET" && surface === "/messages") {
    // Drains AND consumes, as the loop does at the round boundary: a run
    // has only ONE writer at a time (the claimer), so no double reading.
    return ok({ messages: await pullPendingMessages(runId) });
  }

  /**
   * PUTTING BACK INTO WHAT YOU HAVE DRAINED WITHOUT KNOWING HOW TO PLAY IT (MIN-286).
   *
   * `GET /messages` CONSUMES, and the supervisor drains before ending the round
   * to repost behind. When the turn comes out between the two — ceiling of
   * expense, deadline, run concluded elsewhere, cut suffered — the message was neither
   * played nor kept: it was consumed in base and living in a local variable
   * of the microVM, which dies with it. The user saw their message accepted
   * then ignored forever, and the run didn't even wake up (it's the queue
   * which re-tails it).
   *
   * We therefore reinsert it as it is, without an author: it becomes a waiting message again,
   * exactly as if it had just been written.
   */
  if (method === "POST" && surface === "/messages") {
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .flatMap((message) => {
        const text =
          typeof message === "string"
            ? message
            : message &&
                typeof message === "object" &&
                typeof (message as { text?: unknown }).text === "string"
              ? (message as { text: string }).text
              : null;
        if (text === null || text.trim().length === 0) return [];
        // BOUNDED AS IN WRITING (MIN-329). What we put back in line has been written
        // by a human via `/steer`, which cuts to `MAX_MESSAGE_LEN` — so nothing
        // honesty does not exceed here. Without the terminal, the surface was written in base
        // as many messages as the VM sent, of the size it wanted,
        // and everyone then returned in the prompt of the next round.
        return [
          {
            ...(message &&
            typeof message === "object" &&
            typeof (message as { id?: unknown }).id === "string"
              ? { id: (message as { id: string }).id }
              : {}),
            text: text.slice(0, MAX_MESSAGE_LEN),
            mentions: (message as { mentions?: unknown })?.mentions,
          },
        ];
      })
      .slice(0, MAX_REQUEUED_MESSAGES);
    for (const message of messages) {
      await requeueRunMessage(runId, {
        ...(typeof message === "object" && typeof message.id === "string"
          ? { id: message.id }
          : {}),
        text: message.text,
        mentions: parseAgentMentions(message.mentions),
      });
    }
    return ok({ requeued: messages.length });
  }

  if (method === "GET" && surface === "/messages/pending") {
    // The same question WITHOUT consuming: it is the probe of waiting for a
    // sub-agent (“did the user write?”), popped every 3 s for
    // that a girl works. Draining here would swallow the message — no one
    // would inject it into the history, and the user would get nothing.
    return ok({ pending: await hasPendingRunMessages(runId) });
  }

  if (surface === "/interrupt") {
    if (method === "GET")
      return ok({ interrupted: await readInterruptFlag(runId) });
    // The loop CONSUMES the flag when the “stop” it has just read
    // arrived with a message: the tour then continues with the instruction to
    // instead of going out to be re-queued by this message left in queue. This is the
    // only writer of this field on the VM side, and he can only write it on his run.
    if (method === "DELETE") {
      await clearInterrupt(runId);
      return ok();
    }
  }

  if (method === "GET" && surface === "/budget") {
    return ok({ remainingUsd: await turnBudgetRemainingUsd(run) });
  }

  if (method === "POST" && surface === "/plan-sync") {
    // Mirror agent checklist states to the linked ticket plan. A run
    // notebook has no exit: nothing to do, and it's not an error.
    if (run.issue_id) {
      const { syncIssuePlanStates } = await import("./plan-sync");
      const steps = Array.isArray(body.steps) ? body.steps : [];
      await syncIssuePlanStates(
        run.issue_id,
        steps as Parameters<typeof syncIssuePlanStates>[1],
      );
    }
    return ok();
  }

  if (method === "POST" && surface === "/repo-auth") {
    /** Desktop-local execution refreshes repository access through the signed-in
     * app, not through its readable execution token (MIN-355). */
    if (opts.local) {
      return forbidden(
        "a local run renews its repository token through the app, not here",
      );
    }
    // Mint a fresh repository credential for trusted infrastructure. The
    // requesting process receives only an acknowledgement; the credential is
    // rotated in the Vercel firewall or self-hosted runner relay.
    const [{ resolveRepoCloneTarget }, { refreshAgentSandboxForgeAccess }] =
      await Promise.all([import("./repo-access"), import("./sandbox")]);
    // `repo-write`, not `full`: the trusted relay uses it only for Git smart HTTP.
    const target = await resolveRepoCloneTarget(
      run.project_id,
      "repo-write",
    ).catch(() => null);
    if (!target)
      return { status: 404, body: { error: "no repository linked" } };
    if (!repoTargetMatchesRun(run, target)) {
      return {
        status: 409,
        body: { error: "run repository binding has changed" },
      };
    }
    const sandboxName = opts.sandboxName ?? run.sandbox_id ?? `agent-${run.id}`;
    await refreshAgentSandboxForgeAccess(sandboxName, target);
    return ok({ refreshed: true });
  }

  if (method === "POST" && surface === "/llm-key") {
    /**
     * THE KEY OF THE MODEL, AND IT ONLY GOES ON ONE MACHINE (MIN-357) — the
     * exact mirror of `/repo-auth` above: this one refuses the premises, this one
     * refuses the cloud.
     *
     * WHY THE CLOUD IS REFUSED, and this is not a stylistic precaution: a
     * microVM does not hold ANY LLM key, the firewall installs it after its exit
     * (network-policy.ts). Serving that surface there would bring in the secret
     * in the process where the model executes from the shell — i.e. undo
     * MIN-223 through a door that we opened ourselves.
     *
     * WHAT SHE DOES NOT CLAIM. The local token lives on a disk that the model
     * reads: he can call this surface himself, and in any case relay by
     * the proxy that listens on `127.0.0.1`. What limits the damage is therefore not
     * the confidentiality of the response — this is the HARD CEILING of the returned key,
     * held by OpenRouter, outside the VM as well as outside our code.
     *
     * Two modes, no implicit fallback:
     *
     * - **BYOK**: the user's key is returned as is only to the local,
     * interactive launcher. A server sandbox uses the runner relay, which
     * never returns the provider key;
     * - **platform**: no mint = no key. 503, never
     * `OPENROUTER_API_KEY`: the key
     * platform is UNCAPPED and shared with Numo, transcription,
     * embeddings and catalog. Reasonable in a disposable microVM,
     * unacceptable on a user's machine. It's up to the LAUNCHER to keep
     * run in the cloud when mint is not available (`admitLocalRun`,
     *   [local-exec.ts](local-exec.ts)) ; ici, on refuse.
     */
    if (opts.server) {
      return forbidden(
        "a server sandbox gets model access through the runner relay",
      );
    }
    if (!opts.local) {
      return forbidden(
        "a microVM gets its model key from the firewall, not from here",
      );
    }
    if (run.key_mode === "byok") {
      const { resolveAgentApiKey } = await import("./model");
      const endpoint = await resolveAgentApiKey(
        run.created_by ?? "",
        run.chain_id || run.routine_id ? "automations" : "agent",
        {
          allowLocal: true,
          requireByok: true,
        },
      ).catch(() => null);
      // The key could have been removed after launch. Never substitute then
      // the platform key to a fixed BYOK run: this would mean changing payer and
      // download a shared secret to a user device.
      if (!endpoint || endpoint.mode !== "byok") {
        return {
          status: 409,
          body: {
            error:
              "the BYOK credential used by this run is no longer available",
          },
        };
      }
      // A local provider can voluntarily not request any key (Ollama,
      // LM Studio…). `null` is distinct from an incomplete response: the proxy
      // will then remove its placeholder instead of inventing an empty Bearer.
      return ok({ key: endpoint.apiKey || null });
    }
    const [
      { mintRunKey, revokeRunKey, runKeyCapUsd },
      { checkAgentQuota },
      { spentFromLedger },
    ] = await Promise.all([
      import("./run-key"),
      import("./quota"),
      import("@/lib/server/ai-usage"),
    ]);
    // Same arithmetic as when launching a microVM chunk (`execute.ts`), and
    // on the same entries: the budget of the run is a governor, the remainder of the
    // has a hard ceiling. Reading it here rather than taking it on a journey is what
    // which means that a long tour does not rely on a six-hour remaining.
    const [quota, ledgerSpent] = await Promise.all([
      checkAgentQuota(run.created_by ?? "").catch(() => null),
      spentFromLedger(run.run_id ?? run.id).catch(() => null),
    ]);
    const minted = await mintRunKey({
      runId: run.id,
      capUsd: runKeyCapUsd({
        runBudgetUsd: run.budget_usd,
        runSpentUsd: Math.max(run.cost_usd, ledgerSpent ?? 0),
        reservedBudgetUsd:
          run.managed_budget_usd == null
            ? null
            : Math.max(
                0,
                Number(run.managed_budget_usd) -
                  Math.max(run.cost_usd, ledgerSpent ?? 0),
              ),
        accountRemainingUsd:
          quota && !quota.unlimited
            ? Math.max(0, quota.remaining ?? 0)
            : undefined,
      }),
    });
    if (!minted) {
      return {
        status: 503,
        body: { error: "no capped model key could be minted for this run" },
      };
    }
    /**
     * THE HASH BEFORE THE RESPONSE, and the previous revoked one behind. This is what
     * causes a key to never survive the turn that requested it: end of turn
     * (`vm-rest.ts`) and watchdog (`drain.ts`) both revoke
     * `provider_key_id`, and they can only revoke what they read.
     */
    const previous = run.provider_key_id;
    await stampRun(run.id, { provider_key_id: minted.hash });
    if (previous && previous !== minted.hash)
      await revokeRunKey(previous).catch(() => {});
    return ok({ key: minted.key, capUsd: minted.capUsd });
  }

  if (method === "POST" && surface === "/rest") {
    // THE END OF THE TOUR. The VM has carried out its work and gives back; everything that
    // follows asks for the base and the forge, therefore the function (see `vm-rest.ts`).
    const report = body as unknown as VmTurnReport;
    if (typeof report?.status !== "string") return bad("rest: missing status");
    /**
     * ONLY ONCE. The control plane client tries again on 5xx: without this
     * guard, a report whose response was lost in flight would be replayed —
     * duplicate events in the thread, and a second compute line in the ledger.
     * The 409 is not retried (see `retryable`), so the VM stops there, which
     * is exactly what we want: the round IS concluded.
     */
    const claimed = await claimRunRest(run.id);
    if (!claimed) {
      return { status: 409, body: { error: "run is no longer running" } };
    }
    const { landVmTurn } = await import("./vm-rest");
    await landVmTurn(claimed, report);
    return ok();
  }

  if (method === "POST" && surface.startsWith("/tool/")) {
    /**
     * THE TOOLSET DOES NOT CHANGE ON A MACHINE (MIN-355), and this is a
     * decision, not an oversight.
     *
     * The scope wanted to remove `set_scratchpad` from the local path — it's the only one
     * tool destructive to the surface (it rewrites the private notebook of the launcher in
     * whole, without return). Two reasons not to do it, decided on
     * 2026-08-15 :
     *
     * - **It didn't protect much.** `read_scratchpad` remains used, so
     * a token holder reads the book and its `rev` anyway: the
     * compare-and-swap is only a guard against obsolescence, not against
     * someone who gets around it by reading first;
     * - **it cost a tool that doesn't lie.** A refusal served here without removing the
     * catalog (`agentToolsFor`) makes the model burn a round, and the depot has
     * already decided this point elsewhere: `ask_user` and `create_routine` come out of
     * TOOLS GAME of a routine, never by a 403.
     *
     * What remains true of the power of a local token is therefore carried by both
     * guards which cost nothing in the honest round: `/repo-auth` and
     * `status = 'running'`.
     */
    return await runPlatformTool(run, surface.slice("/tool/".length), body);
  }

  return {
    status: 404,
    body: { error: `unknown surface: ${method} ${surface}` },
  };
}

/**
 * Replays a PLATFORM tool on the function side — ticket or notebook. These are the ones
 * whose context is ENTIRELY reconstructable from the run line: nothing
 * to transport, nothing to take your word for.
 *
 * The FILE tools (`read_file`, `edit_file`, `run_command`…) do not pass
 * deliberately not here: they will run IN the VM, that's the whole point of
 * MIN-224.
 *
 * THE NAME IS NOT ENOUGH TO ROUTE (MIN-326). What a run is allowed to call is
 * a property of ITS ANCHOR, read on its line and opposed here to the table of
 * `platform-tool-names.ts` — the same one that decides what is announced on
 * model. Without this passage, a rereading session, including everything she reads
 * comes from an unknown fork, written in the tickets and project notebook by
 * a simple POST from its shell: “rereading = zero writing” was just a
 * prompt sentence, and one injection was enough to get through it.
 */
async function runPlatformTool(
  run: AgentRun,
  name: string,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const args = (body.args ?? {}) as Record<string, unknown>;

  const anchor = anchorForRun(run);
  if (!PLATFORM_TOOLS_BY_ANCHOR[anchor].has(name)) {
    return forbidden(
      `${name} is not available in this session (anchor: ${anchor})`,
    );
  }

  if (MCP_CLIENT_TOOL_NAMES.has(name)) {
    return ok(await executeAgentMcpTool(run, name, args));
  }

  if (SCRATCHPAD_TOOL_NAMES.has(name)) {
    /**
     * THE NOTEBOOK IS PERSONAL, and it is that of the CREATOR of the run. But no matter
     * which member of the project can resume a hot run (`/steer`): without this
     * guard, a colleague was piloting an agent plugged into someone's notebook
     * else — he read it, and could rewrite it in its entirety (`set_scratchpad`).
     *
     * The rule concerns the LIFE OF THE RUN, not the tour: the instructions of a third party
     * remains in history and governs subsequent turns. A run hit by
     * someone other than its creator therefore loses his notebook all the way.
     */
    if (!run.created_by)
      return forbidden(`${name}: this run has no owner, so it has no notebook`);
    const { runSteeredByOther } = await import("./runs");
    if (await runSteeredByOther(run.id, run.created_by)) {
      return forbidden(
        `${name}: this session has been steered by someone other than its owner, ` +
          `so the notebook is closed for the rest of it`,
      );
    }
    const ctx: ScratchpadToolContext = { userId: run.created_by };
    return ok(await executeScratchpadTool(ctx, name, args));
  }

  if (ISSUE_TOOL_NAMES.has(name)) {
    const ctx = await issueContextFor(run, body);
    return ok(await executeIssueTool(ctx, name, args));
  }

  if (PR_TOOL_NAMES.has(name)) {
    return await runPrTool(run, name, args, body);
  }

  if (PROJECT_PR_TOOL_NAMES.has(name)) {
    return await runProjectPrTool(run, name, args, body);
  }

  if (name === "web_search") {
    return await runWebSearch(run, args);
  }

  if (name === "create_pr") {
    return await runCreatePr(run, args, body);
  }

  /**
   * Unreachable by the VM: the table above has already refused any name that it does not
   * don't wear it. We only get here by adding a name to the table without wiring it
   * of executor — a fault on OUR side, which must be seen as such.
   */
  return {
    status: 500,
    body: { error: `platform tool allowed but not routed: ${name}` },
  };
}

/**
 * The three writes on the RELUE pull request (MIN-168), replayed here: they
 * need the forge client and its token, which do not enter the VM.
 *
 * THE ANCHOR COUNTER goes back and forth, and that's what makes its ceiling
 * just. “5 per run” is counted over the life of the run, not over one lap: the VM
 * sends it, the function opposes it to the ceiling then returns the one it has reached.
 * Reading it in base at each call would cost one request per comment for the
 * same answer; leaving it in the VM would reset it to zero every turn.
 */
async function runPrTool(
  run: AgentRun,
  name: string,
  args: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const [
    { executePrTool },
    { loadPrRunContext },
    { resolveRepoCloneTarget },
    { forgeFor },
  ] = await Promise.all([
    import("./pr-tools"),
    import("./pr-run"),
    import("./repo-access"),
    import("./forge"),
  ]);
  if (!run.pull_request_id) {
    return bad(`${name} is only available in a pull request review session`);
  }
  const [prRun, target] = await Promise.all([
    loadPrRunContext(run.pull_request_id),
    resolveRepoCloneTarget(run.project_id),
  ]);
  if (!prRun || !target)
    return bad(`${name}: the pull request is no longer reachable`);
  if (!repoTargetMatchesRun(run, target)) {
    return {
      status: 409,
      body: { error: `${name}: repository binding changed` },
    };
  }

  const forge = forgeFor(target.provider);
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number: prRun.number,
  };
  const inline = { used: seqField(body.prInlineComments) };
  const { locale } = await runPrefsFor(run);
  const outcome = await executePrTool(
    {
      forge,
      call,
      // Lazy and paid only once per call: anchor validation has it
      // besoin, un commentaire de PR entier n'y touche jamais.
      files: async () => (await forge.listPullRequestFiles(call)).files,
      model: run.model ?? "",
      locale,
      inline,
      reserveInline: () =>
        reserveRunInlineComment(run.id, AI_REVIEW_MAX_INLINE_COMMENTS),
      releaseInline: () => releaseRunInlineComment(run.id),
    },
    name,
    args,
  );
  return ok({ ...outcome, inlineUsed: inline.used });
}

/**
 * The PROJECT pull requests (MIN-267), replayed here for the same reason as
 * those of the rereading: the forge and its token do not enter the VM, and the
 * liste se lit en base.
 *
 * The anchor counter makes the same round trip as up there, and it's the SAME
 * ceiling: “5 per run”, all pull requests combined.
 *
 * WHAT THE BODY CAN SAY, AND WHAT IT CANNOT (MIN-326 audit). The only one
 * identifier that the model chooses is the pull request NUMBER, and it is
 * resolved against the submission of the RUN PROJECT (`repo()` part of `run.project_id`):
 * a VM cannot therefore designate the pull request of another project, whatever
 * or the number she sends. Remains `prInlineComments`, which is a COUNTER and
 * not an identifier: a VM which returns it to zero offers itself additional anchors.
 * This is the assumed price of making it travel (see `tool-bridge.ts`) — the ceiling
 * borne du bruit, pas un droit.
 */
async function runProjectPrTool(
  run: AgentRun,
  name: string,
  args: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const [{ executeProjectPrTool }, { resolveRepoCloneTarget }] =
    await Promise.all([import("./project-pr-tools"), import("./repo-access")]);
  const { locale } = await runPrefsFor(run);
  const inline = { used: seqField(body.prInlineComments) };
  const outcome = await executeProjectPrTool(
    {
      projectId: run.project_id,
      // Un token FRAIS par appel : un tour de VM dure plus longtemps que celui
      // who cloned the repository.
      repo: async () => {
        const target = await resolveRepoCloneTarget(run.project_id).catch(
          () => null,
        );
        if (!target) return null;
        if (!repoTargetMatchesRun(run, target)) return null;
        return {
          token: target.token,
          repoFullName: target.repoFullName,
          provider: target.provider,
        };
      },
      model: run.model ?? "",
      locale,
      inline,
      reserveInline: () =>
        reserveRunInlineComment(run.id, AI_REVIEW_MAX_INLINE_COMMENTS),
      releaseInline: () => releaseRunInlineComment(run.id),
    },
    name,
    args,
  );
  return ok({ ...outcome, inlineUsed: inline.used });
}

/**
 * `web_search`: the run key accompanies it, and it does not go down into the VM.
 * The ceiling per turn remains where it was — in the loop, which counts its
 * calls. Here we just pay and return.
 */
async function runWebSearch(
  run: AgentRun,
  args: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const query = String(args.query ?? "").trim();
  if (!query) return bad("web_search: query is required");
  const { runWebSearchTool } = await import("@/lib/server/web-search");
  // The runner of the run, and him alone: ​​it is HIS key (BYOK) or HIS quota that pays
  // search, just like for model calls.
  if (!run.created_by) return bad("web_search: this run has no owner");
  const outcome = await runWebSearchTool({
    query,
    userId: run.created_by,
    surface: surfaceForAgentRun(run),
    runId: run.run_id ?? run.id,
    // The search seq tape is hers; the counter starts again from the round, and
    // two searches in the same turn do not overlap.
    // The index stays IN its band: 99 searches per turn, and no number
    // received which is placed in the band of another feature (MIN-329).
    seq: WEB_SEARCH_SEQ_BASE + run.continuations * 100 + seqField(args.seq, 99),
    billTo: billToFor(run),
    projectId: run.project_id,
  });
  return ok(outcome);
}

/**
 * `create_pr`, HALF FORGED. The VM has already pushed (it has the repository); what remains
 * — PR merged, PR already alive, PR refused to reopen, creation — lives here, in
 * the implementation shared with the old form.
 *
 * WHAT THE BODY CAN SAY (MIN-326 audit): the deposit comes from `run.project_id`,
 * the base of `run.base_branch`, the run anchor ticket — none of the three
 * is not received. The VM only chooses the HEAD BRANCH, and it must
 * chooses: `create_pr` IS its first push, so `branch_name` is still null
 * on the line (MIN-123). What it can do with it remains limited to submitting the project
 * — open a pull request from another branch of THIS repository, which a `git
 * push` from the same shell would work anyway.
 */
async function runCreatePr(
  run: AgentRun,
  args: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const [
    { openPullRequestAfterPush, PrLandingAuthorityError },
    { resolveRepoCloneTarget },
    { forgeFor },
  ] = await Promise.all([
    import("./pr-landing"),
    import("./repo-access"),
    import("./forge"),
  ]);
  const target = await resolveRepoCloneTarget(run.project_id).catch(() => null);
  if (!target) return bad("create_pr: no repository linked to this project");
  if (!repoTargetMatchesRun(run, target)) {
    return {
      status: 409,
      body: { error: "create_pr: repository binding changed" },
    };
  }

  const pushed = body.pushed as
    { pushed: boolean; remoteUpdated: boolean; headSha: string } | undefined;
  if (!pushed) return bad("create_pr: missing push result");

  const anchorId = await anchorIssueIdFor(run);
  const identifier = anchorId ? await issueIdentifier(anchorId) : null;
  const { locale, branchPrefix } = await runPrefsFor(run);
  const prState = {
    number: run.pr_number,
    url: run.pr_url,
    state: run.pr_state,
  };
  const title = String(args.title ?? "").trim();
  /**
   * THE HEAD BRANCH, sent by the VM. `agent_runs.branch_name` is not worth
   * something only after a first REAL push (MIN-123) — or `create_pr` IS
   * this first push in the normal case. Reading it alone here opened the pull request
   * on an empty head, and stamped `branch_name: ""` in passing.
   */
  const expectedBranch =
    run.branch_name ??
    generatedAgentBranchName({
      runId: run.id,
      issueIdentifier: identifier,
      conversationTitle: run.title,
      prompt: run.prompt,
      branchPrefix,
    });
  const suppliedBranch =
    typeof body.workBranch === "string" ? body.workBranch.trim() : "";
  const workBranch = suppliedBranch || expectedBranch;
  if (!isValidGitBranchName(workBranch) || workBranch !== expectedBranch) {
    return bad("create_pr: invalid or unexpected work branch");
  }
  const baseBranch = run.base_branch ?? target.defaultBranch;
  if (!isValidGitBranchName(baseBranch))
    return bad("create_pr: invalid base branch");

  try {
    const outcome = await openPullRequestAfterPush(
      {
        run,
        target,
        forge: forgeFor(target.provider),
        issue: identifier ? { identifier } : null,
        workBranch,
        baseBranch,
        locale,
        emit: (type, payload) => appendEvent(run.id, type, payload),
        prState,
      },
      {
        pushed,
        prTitle:
          title || (identifier ? `${identifier}: agent work` : "Agent work"),
        body: typeof args.body === "string" ? args.body : undefined,
        fresh: target,
        jobsNote: typeof body.jobsNote === "string" ? body.jobsNote : "",
        noteBranchPushed: async (p) => {
          if (!p.pushed || run.branch_name || !workBranch) return;
          const stamped = await stampRun(
            run.id,
            { branch_name: workBranch },
            { guard: ["running"] },
          );
          if (!stamped) {
            throw new PrLandingAuthorityError(
              "run stopped before branch binding",
            );
          }
        },
      },
    );
    return ok(outcome);
  } catch (error) {
    if (error instanceof PrLandingAuthorityError) {
      return { status: 409, body: { error: error.message } };
    }
    throw error;
  }
}

/** `MIN-42` of the given ticket, or null. */
async function issueIdentifier(issueId: string): Promise<string | null> {
  const { getServiceClient } = await import("@/lib/supabase-service");
  const { data } = await getServiceClient()
    .from("issues")
    .select("number, projects(key)")
    .eq("id", issueId)
    .maybeSingle();
  const row = data as {
    number?: number;
    projects?: { key?: string } | null;
  } | null;
  return row?.projects?.key && row.number
    ? `${row.projects.key}-${row.number}`
    : null;
}

/**
 * The tools ticket context, reconstructed from the run line — same
 * fields than those that `execute.ts` assembles today, and for the same
 * raisons.
 *
 * Only one field comes from the body: `imageInput`. This is not an oversight — it depends
 * of the run model and a capacity index that the VM already has in hand, it does not
 * decides to do nothing that she cannot already do (at worst she receives an image
 * she asked), and reading it again here would cost one network call per tool.
 */
async function issueContextFor(
  run: AgentRun,
  body: Record<string, unknown>,
): Promise<IssueToolContext> {
  const [projectKey, prefs, anchorIssueId] = await Promise.all([
    projectKeyFor(run),
    runPrefsFor(run),
    anchorIssueIdFor(run),
  ]);
  return {
    anchorIssueId,
    projectId: run.project_id,
    projectKey,
    // The ACTOR of the writes, and it is the launcher of the run — not the VM, which has
    // no own identity, and not the owner of the project.
    actorId: run.created_by,
    numoDefaultStatus: prefs.numoDefaultStatus,
    imageInput: body.imageInput === true,
    runId: run.id,
    chainId: run.chain_id,
  };
}

/**
 * The ANCHOR ticket — the default target for tools ticket, and the same as
 * qu'`execute.ts` assemble.
 *
 * On a REPLAY of pull request, `run.issue_id` is ALWAYS null (one session
 * review does not occupy a ticket): the defect is then the ticket that the PR issues
 * implemented, when she wears one (MIN-143). Without this fallback, the tool would announce
 * a default which does not exist and the first `read_issue` without argument would burn a
 * round — exactly what the twin line of `execute.ts` exists to avoid.
 *
 * The PR is reread by `loadPrRunContext`, the unique resolver of the PR anchor: the
 * rereading by hand here would be the fifth reading that this module was written
 * to delete.
 */
async function anchorIssueIdFor(run: AgentRun): Promise<string | null> {
  if (run.issue_id) return run.issue_id;
  if (!run.pull_request_id) return null;
  const { loadPrRunContext } = await import("./pr-run");
  return (await loadPrRunContext(run.pull_request_id))?.issueId ?? null;
}

/** Run project key (ticket identifier prefix). */
async function projectKeyFor(run: AgentRun): Promise<string> {
  const { getServiceClient } = await import("@/lib/supabase-service");
  const { data } = await getServiceClient()
    .from("projects")
    .select("key")
    .eq("id", run.project_id)
    .maybeSingle();
  return (data as { key?: string } | null)?.key ?? "";
}

/** Landing status of a ticket created by the agent: LAUNCHER setting,
 * never a model parameter (see `resolveRunPrefs` in execute.ts). */
async function runPrefsFor(run: AgentRun) {
  if (run.created_by) {
    const r = await getAccountSettings({ userId: run.created_by });
    if (r.ok) {
      return {
        locale: r.settings.locale,
        numoDefaultStatus: r.settings.numo_default_status,
        branchPrefix: r.settings.agent.branch_prefix,
      };
    }
  }
  return {
    locale: defaultLocale,
    numoDefaultStatus: DEFAULT_NUMO_STATUS,
    branchPrefix: DEFAULT_AGENT_BRANCH_PREFIX,
  };
}
