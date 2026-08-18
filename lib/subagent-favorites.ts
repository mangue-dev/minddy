/**
 * Subagent favorites (MIN-112): type, product fallback and parser.
 *
 * Shared by both ends of the chain — the server, which serves them at the parent prompt (
) (`lib/server/agent/subagent-config.ts`), and the admin dashboard, which
 * edits (`components/admin/admin-models-dashboard.tsx`). The parser is the SAME
 * on both sides: the API denies on write exactly what the runtime
 * would ignore on read.
 *
 * NO server-only import here: this module is pulled into the client.
 */

export type SubagentThinkingEffort = "low" | "medium" | "high";

export const SUBAGENT_THINKING_EFFORTS: readonly SubagentThinkingEffort[] = [
  "low",
  "medium",
  "high",
];

export function isSubagentThinkingEffort(value: unknown): value is SubagentThinkingEffort {
  return (
    typeof value === "string" &&
    (SUBAGENT_THINKING_EFFORTS as readonly string[]).includes(value)
  );
}

/** A template from the “Favorites for sub-agents” list (adjustable by `app_config`). */
export interface FavoriteSubagentModel {
  /** Exact provider ID, as OpenRouter knows it. */
  id: string;
  /** Readable name — the agent can reference the model by this. */
  label: string;
  /** Recommended use-case, served in the parent's system prompt. */
  use_case: string;
  /** Recommended level of reflection for this model (indicative). */
  thinking_effort?: SubagentThinkingEffort;
}

/**
 * Fallback written IN CODE, in ENGLISH — it's from the prompt, not from the UI. A `use_case`
 * written for a human ("Economic · default", the `hint` of the picker) says nothing
 * to an agent who chooses a model for an exploration: these sentences are
 * written to be READ BY THE MODEL.
 *
 * No `app_config` line is seeded for this key: as long as the admin has not set
 * anything, it is this list that runs.
 *
 * The list is STAGED in cost (see `scopeSubagentModels`, which sizes it au
 * ceiling of the plan before serving it): each level must keep at least two
 * entries, otherwise delegating loses its meaning — a parent who only has the choice between
 * his own model and nothing delegates anymore, he executes. Hence the intermediate notch
 *: without it, a Go account only saw DeepSeek.
 */
export const DEFAULT_SUBAGENT_FAVORITES: FavoriteSubagentModel[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    use_case:
      "Cheap and fast. Default choice for exploration, greps, reading a lot of files, and any mechanical task.",
    thinking_effort: "low",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    use_case:
      "Good at code for a fraction of Sonnet. The middle gear: a real change in a file or two, a focused fix, a test to write.",
    thinking_effort: "medium",
  },
  {
    id: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5",
    use_case:
      "Balanced and strong at code. Use it when the sub-agent has to WRITE code you will not re-read line by line.",
    thinking_effort: "medium",
  },
  {
    id: "anthropic/claude-opus-4.8",
    label: "Claude Opus 4.8",
    use_case:
      "Most capable, most expensive. Only for genuinely hard analysis or a change with subtle logic.",
    thinking_effort: "high",
  },
];

/** Validates an entry. Broken input is ignored, never fatal. */
export function parseSubagentFavorite(raw: unknown): FavoriteSubagentModel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : id;
  const useCase = typeof o.use_case === "string" ? o.use_case.trim() : "";
  const effort = typeof o.thinking_effort === "string" ? o.thinking_effort.trim() : "";
  return {
    id,
    label,
    use_case: useCase,
    ...(isSubagentThinkingEffort(effort) ? { thinking_effort: effort } : {}),
  };
}

/**
 * Readable list taken from the value `app_config`, or `null` when there is NOTHING
 * usable (empty, unreadable JSON, not an array, no valid entry).
 *
 * `null` is a verdict, not an error: the server responds with a fallback — a
 * broken setting should not kill a run — and the admin API with a 400, so that
 * no one saves a list that will never be used.
 */
export function parseSubagentFavorites(
  raw: string | null | undefined,
): FavoriteSubagentModel[] | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const favorites = parsed
    .map(parseSubagentFavorite)
    .filter((f): f is FavoriteSubagentModel => f !== null);
  return favorites.length > 0 ? favorites : null;
}
