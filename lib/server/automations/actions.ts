import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import { launchAgentRun } from "@/lib/server/agent/launch";
import {
  buildAgentLaunchMessage,
  intentForLaunchMode,
} from "@/lib/server/agent/launch-message";
import { getAccountSettings } from "@/lib/server/account-settings";
import { defaultLocale } from "@/i18n/config";
import type { AutomationAction } from "@/lib/automations";
import { lastVerdictOfChain, parkChain, type AgentChain } from "./chain";
import { haltChain, notifyChain, postChainComment } from "./report";

/**
 * Execution of the four actions of a rule (MIN-147).
 *
 * Nothing is reinvented on the agent side: `launchAgentRun` is already the entry point
 * UNIQUE of a cold run, and `buildAgentLaunchMessage` knows how to write the instructions
 * framed without request context — it was precisely written for callers
 * who do not have a composer on hand.
 *
 * A launch failure STOPS the chain with its reason, never silently:
 * `LaunchError` distinguishes eight of them, and it is this code that the comment of
 * report will translate. A channel that dies out without saying anything would be worse than
 * no automation at all.
 */

/** What an action did to the chain, from the engine's perspective. */
export type ActionOutcome =
  /** A run has started: the chain awaits its end, the hook will take control again. */
  | { kind: "launched"; runId: string }
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

async function runNumo(
  chain: AgentChain,
  action: Extract<AutomationAction, { type: "run_numo" }>,
  issue: IssueForLaunch,
  extraPrompt: string | null,
  model: string | null,
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
          fromChain: true,
        });

  const result = await launchAgentRun({
    issueId: issue.id,
    userId: chain.owner_id,
    triggeredBy: "automation",
    intent: action.mode === "custom" ? "custom" : intentForLaunchMode(action.mode),
    prompt,
    // The model by ticket SIZE (account setting) takes precedence over that of
    // the rule: it is the one that the user sees and manipulates.
    model: model ?? action.model ?? null,
    reasoningLevel: action.reasoningLevel ?? null,
    chainId: chain.id,
  });

  if (!result.ok) {
    await haltChain(chain, result.error);
    return { kind: "halted" };
  }
  return { kind: "launched", runId: result.run.id };
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
  /** Model set for the SIZE of this ticket (Account → Automations). */
  model?: string | null;
}): Promise<ActionOutcome> {
  const { chain, action, issue } = params;
  switch (action.type) {
    case "run_numo":
      return runNumo(chain, action, issue, params.extraPrompt ?? null, params.model ?? null);
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
