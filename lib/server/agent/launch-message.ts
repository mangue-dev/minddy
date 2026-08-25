// PURE construction of the message which LAUNCHES the code agent on a ticket, for
// callers who do not have a dialer on hand — the Numo assistant (chat and
// @numo in comment). No DB, no secret, no `server-only` import:
// the caller already provides the ticket fields, so this module is testable in
// node/vitest, comme prompt.ts.
//
// The texts are NOT rewritten here: they are exactly those of the buttons
// the UI (`Agent.launchPrompt.*` in messages/<locale>.json), read with
// `createTranslator` rather than with `getTranslations` — a launch can go
// from a context detached from the request (@numo in the background), where `cookies()`/`headers()`
// are no longer available. A single source of truth for all three modes:
// changing the instruction of a button changes that of the assistant.

import { createTranslator } from "next-intl";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import {
  agentLaunchPromptVariant,
  agentPlanPromptVariant,
  type AgentLaunchPromptVariant,
} from "@/lib/agent-launch-prompt";
import { issueIdentifier, type IssueEffort } from "@/lib/issue-constants";

/**
 * The three NATIVE ways of launching the agent on a ticket — the same as the
 * buttons in the app, so that the assistant does not start from a house instruction:
 * • `plan` — frame the ticket without implementing it (write the plan if it there
 * does not have one, CHECK it point by point if it exists);
 * • `implement` — do the work (the instruction follows the plan and the effort);
 * • `verify` — reread the implementation already done against the plan and the
 * comments, and fix real bugs.
 * Outside of these three, the wizard freely sends its own prompt.
 */
export const AGENT_LAUNCH_MODES = ["plan", "implement", "verify"] as const;
export type AgentLaunchMode = (typeof AGENT_LAUNCH_MODES)[number];

export function isAgentLaunchMode(value: unknown): value is AgentLaunchMode {
  return (AGENT_LAUNCH_MODES as readonly unknown[]).includes(value);
}

/** Fields from the ticket that the message needs (nothing more is read). */
export interface LaunchMessageIssue {
  number: number;
  title: string;
  plan: string | null;
  effort: IssueEffort | null;
}

/**
 * Message body i18n key for a mode. `plan` and `implement` fit the
 * ticket (existing plan, t-shirt effort) exactly like the menu entries;
 * `verify` doesn't depend on anything — there's only one way to reread work done.
 */
export function launchPromptVariantForMode(
  mode: AgentLaunchMode,
  issue: Pick<LaunchMessageIssue, "plan" | "effort">,
  /**
 * Launch is a step in an automation CHAIN ​​(MIN-147). Only
 * the two CHECKS then change: they must end with a call to
 * `report_verdict`, the only thing that the chain knows how to read to decide what to do next. The rest is the same — a plan written by a chain is a plan.
 *
 * Note: "check plan" of the chain is `mode: "plan"` on a
 * ticket that ALREADY has one — `agentPlanPromptVariant` returns `reviewPlan`, of which
 * `chainVerifyPlan` is the verdict variant.
 */
  fromChain = false
): AgentLaunchPromptVariant {
  switch (mode) {
    case "plan": {
      const variant = agentPlanPromptVariant(issue);
      return fromChain && variant === "reviewPlan" ? "chainVerifyPlan" : variant;
    }
    case "verify":
      return fromChain ? "chainVerifyImplementation" : "verifyImplementation";
    default:
      return agentLaunchPromptVariant(issue);
  }
}

/**
 * What launching does to the STATUS of the ticket. The three modes have the
 * same names as the three intentions - the mode says what we ASK, the intention
 * what it does to the ticket - so the conversion is the identity, and it exists
 * so that it remains true in writing: only "implementing" is new work,
 * framing comes before and verifying comes after, both leaving the ticket
 * exactly where it is (a ticket under review that is checked must remain there).
 */
export function intentForLaunchMode(mode: AgentLaunchMode): AgentLaunchIntent {
  return mode;
}

function resolveLocale(raw: string | null | undefined): Locale {
  return raw && (locales as readonly string[]).includes(raw)
    ? (raw as Locale)
    : defaultLocale;
}

/**
 * The message sent to the agent: the header “Working on MIN-42: title. » then
 * the mode instruction, in the language of the requester — the agent responds in this
 * language (see `buildAgentSystemPrompt`), and the message remains readable in the
 * conversation of the run. `extra` (the details that the user gave to
 * the assistant) is added last: it specifies the instruction, it does not replace
 *.
 */
export async function buildAgentLaunchMessage(input: {
  mode: AgentLaunchMode;
  issue: LaunchMessageIssue;
  projectKey: string;
  locale?: string | null;
  extra?: string | null;
  /** Step in an automation chain — cf. `launchPromptVariantForMode`. */
  fromChain?: boolean;
}): Promise<string> {
  const locale = resolveLocale(input.locale);
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({
    locale,
    messages,
    namespace: "Agent.launchPrompt",
  });

  const head = t("head", {
    identifier: issueIdentifier(input.projectKey, input.issue.number),
  });
  const body = t(
    launchPromptVariantForMode(input.mode, input.issue, input.fromChain === true)
  );
  const extra = input.extra?.trim();

  return extra ? `${head}\n\n${body}\n\n${extra}` : `${head}\n\n${body}`;
}
