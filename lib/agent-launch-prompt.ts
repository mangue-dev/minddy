import type { IssueEffort } from "@/lib/issue-constants";
import { hasPlanTasks } from "@/lib/plan";

/** i18n key of the launch prompt body (namespace `Agent.launchPrompt`).
 * `writePlan` / `reviewPlan` are never chosen by
 * `agentLaunchPromptVariant`: they respond to an EXPLICIT request for
 * the user (“Generate plan” / “Check plan” entry, button
 * the Plan tab) — frame the ticket, without implementing it. See
 *  `agentPlanPromptVariant`.
 * `verifyImplementation` neither: this is the other explicit request — reread the
 * work ALREADY faced with the plan and comments, and correct the real ones
 * bugs (“Check implementation” entry). */
export type AgentLaunchPromptVariant =
  | "planExists"
  | "planExistsXl"
  | "xs"
  | "s"
  | "xl"
  | "default"
  | "writePlan"
  | "reviewPlan"
  | "verifyImplementation"
  /** The same two checks, played by a CHAIN ​​(MIN-147). They don't
   * say nothing more about work: they add the obligation to call
   * `report_verdict`, otherwise the string has nothing to read to decide the
   * following. Writing a plan has no variation — there is no verdict in
   * report on a plan that has just been written. */
  | "chainVerifyPlan"
  | "chainVerifyImplementation";

/**
 * Selects the variant of the pre-written launch composer prompt depending on the issue.
 * PURE logic (no text): the text, localized, lives in `Agent.launchPrompt.*`
 * and the caller assembles it `head + "\n\n" + <variante>` with its translator.
 *
 * Deux axes :
 * • A PLAN already exists (issue.plan with tasks) → we ask to FOLLOW it
 * (for an XL already planned, we keep the checkpoint: reread then ask).
 * • Otherwise, the framing depth follows the EFFORT (t-shirt):
 * XS → direct implementation, no plan;
 * S → light plan if the task merits it, then implementation;
 * M/L/none → clear plan, then implementation;
 * XL → plan, then STOP and ask before implementing.
 */
export function agentLaunchPromptVariant(issue: {
  plan: string | null;
  effort: IssueEffort | null;
}): AgentLaunchPromptVariant {
  if (hasPlanTasks(issue.plan))
    return issue.effort === "xl" ? "planExistsXl" : "planExists";

  switch (issue.effort) {
    case "xs":
      return "xs";
    case "s":
      return "s";
    case "xl":
      return "xl";
    case "m":
    case "l":
    default:
      // Effort M/L or not indicated: frame then execute.
      return "default";
  }
}

/**
 * Variant of the prompt when the user explicitly asks to work on the
 * PLAN and nothing else: write it down if it does not exist, CHECK it point by point
 * if it already exists — re-requesting a plan from a ticket that has one doesn't make sense.
 */
export function agentPlanPromptVariant(issue: {
  plan: string | null;
}): "writePlan" | "reviewPlan" {
  return hasPlanTasks(issue.plan) ? "reviewPlan" : "writePlan";
}
