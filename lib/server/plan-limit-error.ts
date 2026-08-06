import "server-only";

import { getTranslations } from "next-intl/server";

import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Erreur typée levée quand une limite de plan bloque une action (MIN-72).
 * Les routes la convertissent via `planLimitResponse` en 403 JSON
 * `{ error, code, params }` — `error` déjà localisé (namespace ApiErrors),
 * `code` stable pour les clients qui veulent brancher un CTA upgrade.
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

/** code → clé du namespace ApiErrors (messages localisés FR/EN). */
const PLAN_LIMIT_I18N_KEYS: Record<PlanLimitCode, MessageKey<"ApiErrors">> = {
  project_limit_reached: "projectLimitReached",
  issue_limit_reached: "issueLimitReached",
  member_limit_reached: "memberLimitReached",
  agents_not_in_plan: "agentsNotInPlan",
  usage_budget_exceeded: "usageBudgetExceeded",
  model_above_plan: "modelAbovePlan",
};

/** Réponse 403 localisée d'une PlanLimitError (contexte requête uniquement). */
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
