import type { IssueStatusValue } from "@/lib/issue-validation";
import type { PlanTaskState } from "@/lib/plan";

// Account preference (Account → Preferences): when enabled, copying an issue's
// prompt — or a notebook task's — moves it to "in_progress". Stored in the
// account's Supabase auth `user_metadata.prompt_copy_auto_start` — same
// mechanism as `auto_assign_created` / `numo_default_status`. Enabled by
// default: the preference is only off when explicitly set to `false`.
// Server-safe: imports only the enum types, no React/lucide.

export const PROMPT_COPY_AUTO_START_META_KEY = "prompt_copy_auto_start";

/** Read whether "copy prompt" should auto-start the issue, from the user's auth
 *  user_metadata. Defaults to enabled (true) unless explicitly turned off. */
export function resolvePromptCopyAutoStart(
  meta: Record<string, unknown> | null | undefined
): boolean {
  return meta?.[PROMPT_COPY_AUTO_START_META_KEY] !== false;
}

/** Statuses from which copying the prompt advances the issue to in_progress:
 *  the pre-work ones only. Already-started (in_progress) and later/terminal
 *  statuses are left untouched, so copying a prompt never yanks a done, review
 *  or cancelled issue back into progress. */
const AUTO_START_FROM: readonly IssueStatusValue[] = [
  "triage",
  "backlog",
  "todo",
];

export function shouldAutoStartOnPromptCopy(status: IssueStatusValue): boolean {
  return AUTO_START_FROM.includes(status);
}

/**
 * Même règle pour une tâche du CARNET (quatre états, pas huit statuts) : seule
 * une tâche pas encore commencée avance. Confier la tâche à un agent, c'est la
 * commencer — mais cochée ou annulée, elle ne revient pas en arrière, et « en
 * cours » y est déjà.
 *
 * Sert aux DEUX gestes de passation, comme sur un ticket : « copier le prompt »
 * (sous l'option de compte ci-dessus) et « lancer un agent » (toujours, cf.
 * `intentStartsWork` côté serveur).
 */
export function shouldAutoStartTask(state: PlanTaskState): boolean {
  return state === "pending";
}
