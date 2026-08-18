import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { REPO_PROVIDERS, isRepoProviderId } from "@/lib/repo-providers";
import { insertEvents } from "@/lib/server/issue-events";
import {
  getUserByok,
  resolveAgentModel,
  resolveReasoningLevel,
  resolvePrReviewModel,
  AgentModelRequiredError,
} from "./model";
import { isLocalAgentProvider } from "@/lib/agent-providers";
import { ensureModelInPlan } from "./model-plan";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { checkAgentQuota, type AgentQuota } from "./quota";
import { loadPrRunContext, type PrRunContext } from "./pr-run";
import { resolveProjectLinkForRepo } from "./repo-access";
import {
  createRun,
  activeRunForChain,
  activeRunForPullRequest,
  activeRunForRoutine,
  activeRunForPrNumber,
  inheritableWorkForPr,
  insertRunMessage,
  bumpRunActivity,
  ActiveRunExistsError,
  type AgentRun,
  type AgentRunTrigger,
} from "./runs";
import { drainAgentRuns } from "./drain";
import { localExecRequested } from "./local-exec";
import { capability } from "@/lib/server/capabilities";
import { syncIssueStatusOnAgentStart } from "./issue-status-sync";
import { handOffToHuman } from "@/lib/server/automations/hooks";
import { generateShortTitle } from "@/lib/server/short-title";
import { agentRunTitleSource } from "./run-title";
import type { AssistantMention } from "@/lib/assistant-types";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";

/**
 * SINGLE entry point to start a COLD run (MIN-46 + MIN-68). Called by
 * all LAUNCH triggers (sidebar, right click, “request changes”,
 * cat number). Solves and FREEZES the model on the run (cascade run > user > root), done
 * the pre-checks (linked deposit, quota/BYOK, no run already active), causes the PR to INHERIT
 * of the outcome if it is still relevant, creates the run `queued`, then kicks the drain
 * in `after()` (immediate response to the user).
 *
 * Cold = a NEW run: no checkpoint, no LLM message taken up. She inherits
 * only the ARTIFACT (branch + PR) and the summary of the previous run, injected
 * in its start prompt with `execute.ts`. HOT recovery (same session, same
 * context) is a distinct path: `/steer`, from the composer of a conversation.
 */

export type LaunchError =
  | "issueNotFound"
  | "prNotFound"
  | "prIncomplete"
  /** Resumption of a PR without a branch to inherit: nothing to correct on it (MIN-292). */
  | "prNoBranch"
  | "noRepo"
  | "unsupportedProvider"
  | "alreadyRunning"
  | "quotaExceeded"
  | "managedServiceUnavailable"
  | "executionBackendUnavailable"
  | "noModelForProvider"
  | "localEndpointRequiresLocalRun"
  | "modelAbovePlan"
  | "promptRequired";

/**
 * Enough to write “Claude Opus 5 (×12) exceeds the ceiling of your Go plan (×4)”.
 * The picker is already graying out these models: this refusal only happens to a chosen model
 * BEFORE (personal fault recorded, then downgrade or ceiling readjusted), and it
 * must therefore be sufficient in itself.
 */
export interface ModelAbovePlan {
  model: string;
  multiplier: number;
  limit: number;
  planId: string;
}

export type LaunchResult =
  | { ok: true; run: AgentRun }
  | {
      ok: false;
      error: LaunchError;
      run?: AgentRun;
      quota?: AgentQuota;
      modelLimit?: ModelAbovePlan;
    };

export interface LaunchAgentInput {
  /**
   * Anchor ticket. ABSENT → run CARNET (MIN-84): the agent is decoupled from the
   * ticket system — `projectId` (the repository to clone) and `prompt` (the note,
   * his instruction) are then required. A run notebook has neither lineage nor heritage:
   * each launch is a self-contained conversation.
   */
  issueId?: string | null;
  /**
   * Pull request whose run RESUMES the work (MIN-292), when it has no
   * ticket: a PR opened by a notebook session has a living branch, and
   * “requesting changes” must be able to start again. The project comes from
   * filing of the PR (as for a proofreading), the lineage of `inheritableWorkForPr`,
   * and the run remains a NOTEBOOK run — it has no tickets to occupy or move.
   * When `issueId` is also provided, the ticket remains the business anchor of the run,
   * but this PR keeps priority for the legacy branch.
   * Unrelated to `pullRequestId`, which anchors a REREAD (no writing).
   */
  continuePullRequestId?: string | null;
  /**
   * Anchor pull request (MIN-168): the run RELITS this PR — it clones its
   * head branch, reads the code and comments, without ever writing to the repository.
   * Exclusive with `issueId`: a review session does not occupy a ticket.
   * The supporting project is resolved here, from the submission of the PR and the projects
   * accessible at `userId`.
   */
  pullRequestId?: string | null;
  /** Run notebook project. Ignored when `issueId` is provided (the project comes from
   * ticket). The caller has already verified project membership. */
  projectId?: string | null;
  userId: string;
  triggeredBy: AgentRunTrigger;
  /** Free instructions in addition to the outcome (optional) — or THE note (run notebook). */
  prompt?: string | null;
  promptMentions?: AssistantMention[] | null;
  /** Explicit model = override/forcing (numo or user). */
  model?: string | null;
  /** true if the model is imposed (numo “use such model”). */
  forced?: boolean;
  /**
   * Level of reasoning chosen at launch (MIN-122). Absent → the personal fault
   * of the user, otherwise `DEFAULT_REASONING_LEVEL` (`medium`). No terminal:
   * the four levels are open, including minddy quota (cf.
   * `resolveReasoningLevel`).
   */
  reasoningLevel?: string | null;
  /**
   * Base branch chosen at launch (default: the default branch of the
   * deposit). IGNORED if the issue has a living lineage to inherit: the branch of
   * work already exists, its basis cannot be chosen again.
   */
  baseBranch?: string | null;
  /**
   * What we ask of the agent, from the TICKET point of view. Only `implement`
   * (the default) changes the ticket to “in progress”; `plan` (“Generate a
   * plan" / "Check the plan") the FRAME without starting it, `verify`
   * (“Check implementation”) CHECKING work already done — a ticket
   * in review must stay there, not regress “in progress” — and `custom` carries a
   * free deposit, which we do not know if it is work.
   */
  intent?: AgentLaunchIntent;
  /**
   * Step of an automation CHAIN ​​(MIN-147). The run carries the id of its
   * chain — it is through it that the hook at the end of the run finds it — and the
   * spending ceiling that the chain grants it, made enforceable by the loop
 * (`min(quota, run, chain)`) and not just displayed.
   */
  chainId?: string | null;
  budgetUsd?: number | null;
  /**
   * Passage of a ROUTINE (MIN-185). A routine run IS a notebook run — even
   * anchor, same `create_pr`, same drain path — to which this single line
   * adds three things: the “Routines” invoice line, the set of tools without
   * `ask_user` nor `create_routine`, and exclusion from the list of
   * conversations. `projectId` and `prompt` remain required, like any run
   * notebook: routine provides them.
   */
  routineId?: string | null;
  /**
   * ALREADY written title of the run, when the caller has one — the title of the routine
   * (MIN-185). It replaces the generation by small model, which is skipped in
   * this case: a title written once is better than a title repaid every morning.
   */
  title?: string | null;
  /**
   * The conversation asks to run on the user's MACHINE (MIN-359).
   *
   * A REQUEST, coming from the body of a POST: `localExecRequested`
   * ([local-exec.ts](local-exec.ts)) decides whether it survives, and `createRun`
   * freezes on the line. There is no other input, and nothing toggles it
   * then — same doctrine as the engine and the microVM (see `createRun`).
   */
  localExec?: boolean;
  /** Request an isolated local worktree, if the run is allowed locally. */
  localWorktree?: boolean;
}

/**
 * What the launch does to the ticket status: cf. `intentStartsWork`.
 * `review` (MIN-168) is the only one who doesn't talk about a ticket at all: he rereads
 * a pull request.
 */
export type AgentLaunchIntent = "implement" | "plan" | "verify" | "custom" | "review";

/**
 * Does launching START the ticket? Only “implement” is work
 * nine: framing comes before, checking comes after, an instruction written by
 * user (`custom`) can be anything, and reread (`review`) does not
 * Don't even touch the deposit — none of the four should move the ticket.
 * `undefined` (historical caller) is “implement”.
 */
export function intentStartsWork(intent: AgentLaunchIntent | undefined): boolean {
  return intent === undefined || intent === "implement";
}

export async function launchAgentRun(input: LaunchAgentInput): Promise<LaunchResult> {
  const service = getServiceClient();

  // PULL REQUEST anchor (MIN-168): separate end-to-end path — the project
  // comes from the repository, the model of `pr_review_model`, and nothing is written on a
  // ticket (neither status, nor event, nor branch inheritance).
  if (input.pullRequestId) {
    if (!capability("vercelSandbox").configured) {
      return { ok: false, error: "executionBackendUnavailable" };
    }
    return launchPrReviewRun(input, input.pullRequestId);
  }

  const issueId = input.issueId ?? null;
  // Resumption of a PR (MIN-292): when the caller provides an explicit PR, it
  // carries the lineage in all cases — including when it is linked to a
  // ticket. The ticket remains the business anchor of the run, but it can no longer do
  // choose a branch other than that of the requested PR.
  const continuePrId = input.continuePullRequestId ?? null;
  let projectId: string;
  // Title of the TICKET: the lasting half of what the titrator summarizes (the other is
  // the instruction). See `agentRunTitleSource`.
  let issueTitle: string | null = null;
  let continuePr: PrRunContext | null = null;
  if (issueId) {
    const { data: issue } = await service
      .from("issues")
      .select("id, project_id, title")
      .is("deleted_at", null)
      .eq("id", issueId)
      .maybeSingle();
    if (!issue) return { ok: false, error: "issueNotFound" };
    projectId = (issue as { project_id: string }).project_id;
    issueTitle = (issue as { title: string | null }).title;
    if (continuePrId) {
      continuePr = await loadPrRunContext(continuePrId);
      // The PR comes from the same server gesture as the ticket. Refuse an anchor
      // inconsistent avoids creating a run of the ticket on the branch of another PR.
      if (!continuePr || continuePr.issueId !== issueId) {
        return { ok: false, error: "prNotFound" };
      }
    }
  } else if (continuePrId) {
    // Same project resolution as a proofread: a PR belongs to a repository,
    // and the supporting project is the first link accessible to the launcher — it is him
    // which carries the RLS of the run, therefore the visibility of the session.
    continuePr = await loadPrRunContext(continuePrId);
    if (!continuePr) return { ok: false, error: "prNotFound" };
    const prLink = await resolveProjectLinkForRepo({
      userId: input.userId,
      provider: continuePr.provider,
      repoFullName: continuePr.repoFullName,
    });
    if (!prLink) return { ok: false, error: "prNotFound" };
    // Like a run notebook: without instructions, the session would have no mission —
    // and here the instruction IS the request for changes.
    if (!input.prompt?.trim()) return { ok: false, error: "promptRequired" };
    projectId = prLink.projectId;
  } else {
    // General conversation: without a ticket, the message IS the mission.
    if (!input.projectId) return { ok: false, error: "issueNotFound" };
    if (!input.prompt?.trim()) return { ok: false, error: "promptRequired" };
    projectId = input.projectId;
  }

  // After the resolution of the project, these readings no longer depend on each other.
  // others. Throwing them together shortens the time before the drain kicks — and
  // so before the cloud sandbox wakes up — without changing the guards that
  // consume them below.
  const linkPromise = getProjectLink(projectId);
  const activePromise = continuePr
    ? activeRunForPrNumber({
        repoFullName: continuePr.repoFullName,
        prNumber: continuePr.number,
        provider: continuePr.provider,
      })
    : input.chainId
      ? activeRunForChain(input.chainId)
      : input.routineId
        ? activeRunForRoutine(input.routineId)
        : Promise.resolve(null);
  const aiSurface = input.chainId || input.routineId ? "automations" : "agent";
  const quotaPromise = checkAgentQuota(input.userId, aiSurface);
  const byokPromise = getUserByok(input.userId, aiSurface);

  const link = await linkPromise;
  if (!link) return { ok: false, error: "noRepo" };
  // The authoritative provider register (MIN-69): a known provider with the
  // write capacity (PR/MR) can carry the agent — github AND gitlab.
  if (!isRepoProviderId(link.provider) || !REPO_PROVIDERS[link.provider].capabilities.write) {
    return { ok: false, error: "unsupportedProvider" };
  }

  // The ticket is a context, not a lock: multiple conversations can
  // cite it and work in parallel on separate branches.
  //
  // A routine or chain keeps its own lock: a passage that drags
  // must not be duplicated by the same instruction.
  if (continuePr) {
    // A PR resumption rediscovers the rule: two relaunches in parallel
    // would grow on the SAME branch. It is the lineage that is unique, not the
    // notebook — and here the lineage is the pull request.
    const active = await activePromise;
    if (active) return { ok: false, error: "alreadyRunning", run: active };
  } else if (input.chainId || input.routineId) {
    const active = await activePromise;
    if (active) return { ok: false, error: "alreadyRunning", run: active };
  }

  const quota = await quotaPromise;
  if (!quota.allowed) {
    return {
      ok: false,
      error: quota.reason === "managed_ai_unavailable" ? "managedServiceUnavailable" : "quotaExceeded",
      quota,
    };
  }
  const localExec = localExecRequested(input);
  if (!localExec && !capability("vercelSandbox").configured) {
    return { ok: false, error: "executionBackendUnavailable" };
  }
  const byok = await byokPromise;
  // Never create a cloud run that ends up choosing OpenRouter: the
  // local provider is a valid configuration, but it has only existed since
  // the desktop app proxy.
  if (isLocalAgentProvider(byok?.provider) && !localExec) {
    return { ok: false, error: "localEndpointRequiresLocalRun" };
  }

  // The title is only launched once the guards have passed — a refusal should not
  // consume a model call — then it overlaps with model resolution
  // and the branch. Above all, it NEVER becomes a barrier before the drain:
  // the conversation starts under its fallback label and the title comes afterwards.
  const titleSource = agentRunTitleSource({ issueTitle, prompt: input.prompt });
  const generatedTitle =
    !input.routineId && titleSource
      ? generateShortTitle({
          text: titleSource,
          kind: "note",
          locale: "auto",
          usage: { feature: "agent_code", userId: input.userId, projectId },
        }).catch(() => null)
      : null;

  let model: string;
  try {
    const resolved = await resolveAgentModel({
      perRunModel: input.model,
      userId: input.userId,
      surface: aiSurface,
    });
    model = resolved.model;
    // Ceiling of plan model (Minddy quota only): it concerns what
    // the user CHOSE — not about the faults of minddy, whose instance
    // answers. The picker is already graying these models; this refusal catches the case where the
    // choice precedes the constraint (personal default recorded, then downgrade).
    if (resolved.chosenByUser) {
      await ensureModelInPlan({ userId: input.userId, model, mode: quota.mode });
    }
  } catch (err) {
    if (err instanceof AgentModelRequiredError) {
      return { ok: false, error: "noModelForProvider" };
    }
    if (isPlanLimitError(err) && err.code === "model_above_plan") {
      const p = err.params ?? {};
      return {
        ok: false,
        error: "modelAbovePlan",
        modelLimit: {
          model: String(p.model ?? ""),
          multiplier: Number(p.multiplier ?? 0),
          limit: Number(p.limit ?? 0),
          planId: String(p.plan ?? ""),
        },
      };
    }
    throw err;
  }

  // Level of reasoning fixed on the run, like the model: the following chunks
  // rotate in other invocations and must find the same one.
  const reasoningLevel = await resolveReasoningLevel({
    perRunLevel: input.reasoningLevel,
    userId: input.userId,
  });

  // A new conversation always has its workspace. The only implicit recovery
  // still admitted here is an EXPLICIT request to continue a pull request:
  // the lineage is then read on the runs which bear its number. A PR without
  // branch to resume (no run having opened it, or already merged) is refused
  // here rather than leaving silently on a new branch, which would lose
  // the work that was precisely asked to be corrected.
  const inherited = continuePr
    ? await inheritableWorkForPr({
        repoFullName: continuePr.repoFullName,
        prNumber: continuePr.number,
        provider: continuePr.provider,
      })
    : null;
  if (continuePr && !inherited) return { ok: false, error: "prNoBranch" };

  let run: AgentRun;
  try {
    run = await createRun({
      projectId,
      issueId,
      repoLinkId: link.id,
      connectionId: link.connection_id,
      createdBy: input.userId,
      prompt: input.prompt ?? null,
      promptMentions: input.promptMentions ?? null,
      // The title provided wins: it is that of routine. A generated title,
      // is written after the HTTP response — it cannot delay the first token.
      title: input.title?.trim() || null,
      model,
      modelForced: !!input.forced,
      reasoningLevel,
      keyMode: quota.mode,
      triggeredBy: input.triggeredBy,
      // Persisted since MIN-147: without it, the channel cannot know what
      // the run that just finished DID. `undefined` is “implement”,
      // as everywhere else (see `intentStartsWork`).
      intent: input.intent ?? "implement",
      chainId: input.chainId ?? null,
      budgetUsd: input.budgetUsd ?? null,
      routineId: input.routineId ?? null,
      branchName: inherited?.branchName ?? null,
      baseBranch: inherited ? inherited.baseBranch : input.baseBranch ?? null,
      prNumber: inherited?.prNumber ?? null,
      prUrl: inherited?.prUrl ?? null,
      prState: inherited?.prState ?? null,
      // THE ENVIRONMENT (MIN-359), frozen here like the engine and the microVM. THE
      // path `pr` never passes there: it is `launchPrReviewRun`, a function to
      // leaves, and this is how “a replay run does not start locally”
      // is a property of the code rather than a `if` to remember.
      localExec,
      localWorktree: localExec && input.localWorktree === true,
    });
  } catch (err) {
    // Lost race against a concurrent launch (double-click, two tabs):
    // the single index finger decided. Same answer as the pre-check, not a 500.
    // The lock no longer concerns tickets; it remains for automation and
    // to explicit repetitions of the same pull request.
    if (err instanceof ActiveRunExistsError) {
      const winner = continuePr
        ? await activeRunForPrNumber({
            repoFullName: continuePr.repoFullName,
            prNumber: continuePr.number,
            provider: continuePr.provider,
          })
        : input.chainId
          ? await activeRunForChain(input.chainId)
          : input.routineId
            ? await activeRunForRoutine(input.routineId)
            : null;
      if (continuePr || input.chainId || input.routineId) {
        return { ok: false, error: "alreadyRunning", run: winner ?? undefined };
      }
    }
    throw err;
  }

  /**
   * The title is an asynchronous enrichment, not a launch dependency.
   * The promise has already started higher and has therefore covered the pre-flights; This
   * callback does not wait for it so as not to serialize the kick of the drain behind
   * She. The `is(title, null)` clause respects a manual renaming carried out in
   * the interval — a slow response from the small model never regains control.
   */
  if (!input.title?.trim() && generatedTitle) {
    after(() => {
      void generatedTitle
        .then(async (title) => {
          if (!title) return;
          const { error } = await service
            .from("agent_runs")
            .update({ title })
            .eq("id", run.id)
            .is("title", null);
          if (error) console.error("[agent-launch] title update failed:", error.message);
        })
        .catch((err) => console.error("[agent-launch] title generation failed:", (err as Error).message));
    });
  }

  if (issueId) {
    const recordLaunch = async () => {
      // Trace in the activity log of the issue: who launched the agent + the model.
      await insertEvents(service, [
        {
          issue_id: issueId,
          actor_id: input.userId,
          type: "agent_launched",
          to_value: model,
          // TECHNICAL actor vs DISPLAYED actor (MIN-147): the run starts under the
          // account that pays and from which the key comes, but it is automation that
          // the timeline must be named — same vocabulary as `via_smart_assign`.
          ...(input.triggeredBy === "automation" ? { via_automation: true } : {}),
        },
      ]);

      // Agent launched → the outcome changes to “in progress” (MIN-46). Two exceptions:
      // • run which is not new work (`intent` `plan`, `verify` or
      // `custom` — frame before, check after, free deposit): the ticket
      //    keeps its status, whatever it is;
      // • the run inherits a PR still under review (open/draft) — it is ITS state which
      // governs the status (in_review), we do not make it regress for a period of time
      // iteration. A rejected PR (closed → issue `todo`) returns to “in progress”.
      if (
        intentStartsWork(input.intent) &&
        inherited?.prState !== "open" &&
        inherited?.prState !== "draft"
      ) {
        await syncIssueStatusOnAgentStart({ issueId, actorId: input.userId });
      }
    };

    if (run.local_exec) {
      // The renderer must receive the id as quickly as possible to claim the turn
      // Electron. These two writings do not construct either the job or its lease: we
      // keeps them in the duration of the route, but out of the way of the response.
      after(() => {
        void recordLaunch().catch((err) =>
          console.error("[agent-launch] local launch bookkeeping failed:", (err as Error).message),
        );
      });
    } else {
      await recordLaunch();
    }

    // A MANUAL launch, regardless of its mode, means that someone takes the
    // ticket in hand: the chain that was waiting for him on reprieve is canceled (MIN-147).
    // Without that, only the implementation was covered — it alone moves the
    // ticket —, and launching a plan or a check by hand left the
    // reprieve to run to the end, to get back to the work we had just done
    // take. A chain that RUNS is not concerned: there, that's what
    // launch which is refused (`alreadyRunning`, above).
    if (input.triggeredBy !== "automation") handOffToHuman(issueId);
  }

  // The drain already excludes `local_exec`, but waking it up still launched a
  // serverless invocation that could not take this run.
  if (!run.local_exec) kickAgentDrain(service);
  return { ok: true, run };
}

/**
 * Starts a REVIEW session of a pull request (MIN-168).
 *
 * The path is distinct from start to finish, and each deviation at the start of a run
 * ticket is a decision:
 * - **the project comes from the DEPOSIT**, not from a ticket: a PR belongs to a
 * repository, which several projects can link. We retain the first link of which
 * the project is accessible to the launcher (`resolveProjectLinkForRepo`) — it is
 * he who will carry the RLS of the run, and therefore the visibility of the session;
 * - **the model comes from `resolvePrReviewModel`**, deliberately distinct from
 * writing model (see `model.ts`);
 * - **no writing on a ticket**: neither `agent_launched` nor change of
 * status, nor branch inheritance. The linked PR can carry a ticket; reread
 * is not working on it;
 * - **one active run per PR**, same rule as per ticket, for the same reason.
 *
 * The PR branches are a PREREQUISITE: without them, the sandbox has nothing to do
 * clone. We refuse at launch (`prIncomplete`) rather than at the first chunk —
 * a stillborn run costs a claim and leaves an empty session on the screen.
 */
async function launchPrReviewRun(
  input: LaunchAgentInput,
  pullRequestId: string,
): Promise<LaunchResult> {
  const pr = await loadPrRunContext(pullRequestId);
  if (!pr) return { ok: false, error: "prNotFound" };
  if (!isRepoProviderId(pr.provider) || !REPO_PROVIDERS[pr.provider].capabilities.write) {
    return { ok: false, error: "unsupportedProvider" };
  }
  // The base is essential (this is what we clone, and the diff is based on it);
  // the head is found by the server ref of the PR even on a fork —
  // hence the only requirement made here.
  if (!pr.baseBranch) return { ok: false, error: "prIncomplete" };

  const link = await resolveProjectLinkForRepo({
    userId: input.userId,
    provider: pr.provider,
    repoFullName: pr.repoFullName,
  });
  // No accessible project links this repository: from the launcher's point of view, this
  // PR does not exist. Same answer as everywhere else (MIN-143).
  if (!link) return { ok: false, error: "prNotFound" };

  const active = await activeRunForPullRequest(pullRequestId);
  if (active) return { ok: false, error: "alreadyRunning", run: active };

  const quota = await checkAgentQuota(input.userId);
  if (!quota.allowed) {
    return {
      ok: false,
      error: quota.reason === "managed_ai_unavailable" ? "managedServiceUnavailable" : "quotaExceeded",
      quota,
    };
  }

  const resolvedReview = await resolvePrReviewModel({
    perCall: input.model,
    userId: input.userId,
  });
  const model =
    !resolvedReview.chosenByUser && quota.mode === "byok"
      ? (
          await resolveAiRuntime({
            userId: input.userId,
            modelKey: "pr_review_model",
            surface: "agent",
          })
        ).model
      : resolvedReview.model;
  if (resolvedReview.chosenByUser && quota.mode === "platform") {
    try {
      await ensureModelInPlan({ userId: input.userId, model, mode: quota.mode });
    } catch (err) {
      if (isPlanLimitError(err) && err.code === "model_above_plan") {
        const p = err.params ?? {};
        return {
          ok: false,
          error: "modelAbovePlan",
          modelLimit: {
            model: String(p.model ?? ""),
            multiplier: Number(p.multiplier ?? 0),
            limit: Number(p.limit ?? 0),
            planId: String(p.plan ?? ""),
          },
        };
      }
      throw err;
    }
  }

  const reasoningLevel = await resolveReasoningLevel({
    perRunLevel: input.reasoningLevel,
    userId: input.userId,
  });

  let run: AgentRun;
  try {
    run = await createRun({
      projectId: link.projectId,
      issueId: null,
      pullRequestId,
      // The sha RELUDE by this session: frozen at launch, compared later to the
      // running head to see if relaunching would have anything new to read.
      prHeadSha: pr.headSha,
      repoLinkId: link.linkId,
      connectionId: link.connectionId,
      createdBy: input.userId,
      prompt: input.prompt ?? null,
      // Session title: that of the pull request. No summary to generate —
      // Unlike a note, a PR already has a title written to be read.
      title: prSessionTitle(pr),
      model,
      modelForced: !!input.forced,
      reasoningLevel,
      keyMode: quota.mode,
      triggeredBy: input.triggeredBy,
      intent: "review",
      // The base serves as a point of comparison to `git diff` in the sandbox.
      baseBranch: pr.baseBranch,
    });
  } catch (err) {
    // Lost race against a competing launch: the unique index has decided.
    if (err instanceof ActiveRunExistsError) {
      const winner = await activeRunForPullRequest(pullRequestId);
      return { ok: false, error: "alreadyRunning", run: winner ?? undefined };
    }
    throw err;
  }

  kickAgentDrain(getServiceClient());
  return { ok: true, run };
}

/** Readable title of a review session — that of the PR, failing that its number. */
function prSessionTitle(pr: PrRunContext): string {
  const title = pr.title?.trim();
  return title ? `#${pr.number} ${title}` : `#${pr.number}`;
}

export type ContinueResult =
  | { ok: true; run: AgentRun; continued: boolean }
  | { ok: false; error: LaunchError; run?: AgentRun; quota?: AgentQuota };

/**
 * Starts a conversation from a trigger without a conversation ID.
 * A mention of a ticket never distracts from another conversation. Only one
 * mention in the thread of a PR joins its active review, because the thread already designates
 * this shared execution.
 * A `completed` run (at rest) is not repeated here: hot restart of a
 * existing conversation is done from the composer of ITS conversation (`/steer`).
 */
export async function continueOrLaunchAgentRun(
  input: LaunchAgentInput,
): Promise<ContinueResult> {
  // A review that is running is already reading this PR: the question of his thread reaches him
  // in steering instead of opening a second session on the same diff.
  const active = input.pullRequestId
    ? await activeRunForPullRequest(input.pullRequestId)
    : null;
  if (active) {
    const text = (input.prompt ?? "").trim();
    if (text) await insertRunMessage(active.id, input.userId, text, input.promptMentions);
    await bumpRunActivity(active.id);
    return { ok: true, run: active, continued: true };
  }
  const result = await launchAgentRun(input);
  return result.ok ? { ok: true, run: result.run, continued: false } : result;
}

/**
 * Low latency kick: launches the runs due after the HTTP response, in the same
 * invocation. Never raise — the cron (every 2 min) is the net.
 *
 * No more chaining behind (MIN-225): a launch is counted in seconds, a
 * window therefore absorbs all the runs due, and the two paths which return a
 * run in line — steering and provider fallback — call this kick
 * directly rather than waiting for a tick.
 */
export function kickAgentDrain(service: SupabaseClient): void {
  after(async () => {
    try {
      await drainAgentRuns(service);
    } catch (err) {
      console.error("[agent-launch] kick drain failed:", (err as Error).message);
    }
  });
}
