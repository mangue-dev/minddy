import "server-only";

import { getTranslations } from "next-intl/server";

import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Typed error raised when a plan limit blocks an action (MIN-72).
 * Routes convert it via `planLimitResponse` to 403 JSON
 * `{ error, code, params }` — `error` already located (namespace ApiErrors),
 * `code` stable for clients who want to plug in a CTA upgrade.
 */

export type PlanLimitCode =
  | "project_limit_reached"
  | "issue_limit_reached"
  | "member_limit_reached"
  | "agents_not_in_plan"
  | "usage_budget_exceeded"
  | "model_above_plan";

export class PlanLimitError extends Error {
  readonly status = 403;
  readonly code: PlanLimitCode;
  readonly params?: Record<string, string | number>;

  constructor(code: PlanLimitCode, params?: Record<string, string | number>) {
    super(`Plan limit: ${code}`);
    this.name = "PlanLimitError";
    this.code = code;
    this.params = params;
  }

}

export function isPlanLimitError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError;
}

/** code → ApiErrors namespace key (FR/EN localized messages). */
const PLAN_LIMIT_I18N_KEYS: Record<PlanLimitCode, MessageKey<"ApiErrors">> = {
  project_limit_reached: "projectLimitReached",
  issue_limit_reached: "issueLimitReached",
  member_limit_reached: "memberLimitReached",
  agents_not_in_plan: "agentsNotInPlan",
  usage_budget_exceeded: "usageBudgetExceeded",
  model_above_plan: "modelAbovePlan",
};

/** Localized 403 response from a PlanLimitError (query context only). */
export async function planLimitResponse(error: PlanLimitError): Promise<Response> {
  const t = await getTranslations("ApiErrors");
  return Response.json(
    {
      error: t(PLAN_LIMIT_I18N_KEYS[error.code], error.params),
      code: error.code,
      params: error.params ?? {},
    },
    { status: error.status }
  );
}
