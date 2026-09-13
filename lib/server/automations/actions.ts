import "server-only";

import { randomUUID } from "node:crypto";
import { updateIssueFields } from "@/lib/server/update-issue";
import { buildAgentLaunchMessage } from "@/lib/server/agent/launch-message";
import { getAccountSettings } from "@/lib/server/account-settings";
import { getServiceClient } from "@/lib/supabase-service";
import { startNumoIntent } from "@/lib/server/numo/start-intent";
import { executeNumoTurn } from "@/lib/server/numo/turns";
import { defaultLocale } from "@/i18n/config";
import type { AutomationAction } from "@/lib/automations";
import {
  bindNumoAutomationOperation,
  ensureNumoAutomationOperation,
  lastNumoAutomationOperation,
  lastVerdictOfChain,
  parkChain,
  type AgentChain,
  type NumoAutomationOperation,
  type NumoAutomationOperationState,
} from "./chain";
import { haltChain, notifyChain, postChainComment } from "./report";
import { notifyAutomationOfNumoTurn } from "./numo-hooks";

/**
 * Execution of the four actions of a rule (MIN-147).
 *
 * A run_numo step reserves one durable operation and enters the canonical
 * conversation service. Numo may finish with Minddy tools alone or delegate
 * repository work; only the parent turn's interpreted outcome advances the chain.
 */

/** What an action did to the chain, from the engine's perspective. */
export type ActionOutcome =
  /** A Numo operation was submitted; its durable lifecycle now owns the step. */
  | { kind: "submitted"; turnId: string }
  /** The action has been played and the engine can continue with the event produced. */
  | { kind: "continue" }
  /** The channel is parked (human stopping point) or stopped: nothing more to play. */
  | { kind: "halted" };

/** Fields in the ticket needed to write an instruction. */
interface IssueForLaunch {
  id: string;
  number: number;
  title: string;
  plan: string | null;
  effort: "xs" | "s" | "m" | "l" | "xl" | null;
  project_key: string;
}

async function localeOf(userId: string): Promise<string> {
  try {
    const r = await getAccountSettings({ userId });
    if (r.ok) return r.settings.locale;
  } catch {
    // ignore
  }
  return defaultLocale;
}

async function metadataOf(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await getServiceClient().auth.admin.getUserById(userId);
    return (data?.user?.user_metadata ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

async function executeOperation(
  chain: AgentChain,
  operation: NumoAutomationOperation,
): Promise<string> {
  const service = getServiceClient();
  let started;
  try {
    started = await startNumoIntent({
      supabase: service,
      userId: chain.owner_id,
      userMetadata: await metadataOf(chain.owner_id),
      projectId: chain.project_id,
      prompt: operation.prompt,
      locale: operation.locale,
      source: "issue",
      action: operation.mode,
      context: {
        projectId: chain.project_id,
        issueId: operation.context.issue.id,
        issueIdentifier: operation.context.issue.identifier,
        issueTitle: operation.context.issue.title,
      },
      conversationId: operation.conversation_id,
      conversationUserId: chain.owner_id,
      requestId: operation.request_id,
      executeInBackground: false,
      triggerSource: "chat",
      automation: operation.context,
    });
  } catch (error) {
    // Without an admitted turn there is no canonical retry state to sweep.
    // Stop visibly instead of leaving an advanced chain that retries forever.
    await haltChain(chain, "numo_failed");
    throw error;
  }
  await bindNumoAutomationOperation(operation.id, started.turnId);
  await executeNumoTurn({
    turnId: started.turnId,
    readClient: service,
  });
  return started.turnId;
}

/** Recover admission, execution, or terminal delivery for one reserved step. */
export async function recoverNumoAutomationOperation(
  chain: AgentChain,
  known?: NumoAutomationOperationState | null,
): Promise<boolean> {
  const state = known === undefined
    ? await lastNumoAutomationOperation(chain.id)
    : known;
  if (!state || state.operation.step !== chain.step) return false;
  if (!state.turn) {
    await executeOperation(chain, state.operation);
    return true;
  }
  if (state.turn.status === "queued" || state.turn.status === "retryable") {
    await executeNumoTurn({
      turnId: state.turn.id,
      readClient: getServiceClient(),
      allowRetryable: state.turn.status === "retryable",
    });
    return true;
  }
  if (["completed", "failed", "stopped"].includes(state.turn.status)) {
    notifyAutomationOfNumoTurn(state.turn);
  }
  return true;
}

async function runNumo(
  chain: AgentChain,
  action: Extract<AutomationAction, { type: "run_numo" }>,
  issue: IssueForLaunch,
  extraPrompt: string | null,
): Promise<ActionOutcome> {
  const locale = await localeOf(chain.owner_id);
  // `custom` mode: the rule instruction IS the message. The other three
  // repeat word for word that of the app buttons — a single source of
  // truth, here as for the assistant.
  const prompt =
    action.mode === "custom"
      ? [action.prompt ?? "", extraPrompt ?? ""].filter(Boolean).join("\n\n")
      : await buildAgentLaunchMessage({
          mode: action.mode,
          issue: {
            number: issue.number,
            title: issue.title,
            plan: issue.plan,
            effort: issue.effort,
          },
          projectKey: issue.project_key,
          locale,
          extra: extraPrompt,
        });

  const mode = action.mode;
  const ruleId = chain.played_rule_ids.at(-1);
  if (!ruleId) throw new Error("Automation chain step has no rule identity");
  const identifier = `${issue.project_key}-${issue.number}`;
  const context = {
    chainId: chain.id,
    step: chain.step,
    ruleId,
    preset: chain.preset,
    retries: chain.retries,
    mode,
    issue: {
      id: issue.id,
      identifier,
      title: issue.title,
      plan: issue.plan,
    },
  } as const;
  const operation = await ensureNumoAutomationOperation({
    chain,
    ruleId,
    mode,
    title: `${identifier}: ${issue.title}`,
    requestId: randomUUID(),
    prompt,
    locale,
    context,
  });
  const turnId = await executeOperation(chain, operation);
  return { kind: "submitted", turnId };
}

/**
 * Human breakpoint. The chain parks, the ticket does not move, and we warn
 * the account that carries it — this is the only moment when the loop needs
 * someone, it must not be discovered by chance.
 */
async function awaitHuman(chain: AgentChain): Promise<ActionOutcome> {
  const parked = await parkChain(chain.id);
  if (!parked) return { kind: "halted" };
  // The verdict of the step that leads here — the verification of the plan. It is
  // exactly what we are asking for a green light on: without it, the comment
  // announces “the plan is verified” without saying what the verification concluded,
  // and you have to open the agent session to find out.
  const verdict = await lastVerdictOfChain(parked.id);
  await postChainComment(parked, "awaiting_human", {
    verdictSummary: verdict?.summary ?? null,
    verdictBlockers: verdict?.blockers ?? [],
  });
  await notifyChain(parked, "automation_paused");
  return { kind: "halted" };
}

export async function runAction(params: {
  chain: AgentChain;
  action: AutomationAction;
  issue: IssueForLaunch;
  /** Instruction added to the step (the report of a failed verification). */
  extraPrompt?: string | null;
}): Promise<ActionOutcome> {
  const { chain, action, issue } = params;
  switch (action.type) {
    case "run_numo":
      return runNumo(chain, action, issue, params.extraPrompt ?? null);
    case "set_status":
      // Go back through the ordinary writing heart: it is he who writes
      // activity, notifications and feedback sync. It retriggers
      // so the status hook, and this is intended — `played_rule_ids` and
      // `MAX_CHAIN_STEPS` are what prevents the loop.
      await updateIssueFields({
        issueId: issue.id,
        actorId: chain.owner_id,
        input: { status: action.status },
        viaAssistant: true,
        // …and the RULE, not just Numo: without this flag, a status posed by
        // the loop reads in the timeline like a run launched by hand.
        viaAutomation: true,
      });
      return { kind: "continue" };
    case "await_human":
      return awaitHuman(chain);
    case "stop":
      await haltChain(chain, "rule");
      return { kind: "halted" };
  }
}
