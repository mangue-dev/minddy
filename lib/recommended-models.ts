/**
 * RECOMMENDED templates: the short list that a user sees when opening the
 * picker, before typing anything.
 *
 * The OpenRouter catalog has more than 300 text templates. Showing them in
 * alphabetical order is opening on `agentica-org/…` and `ai21/…` — a rank
 * that says nothing about what works, and leaves the entire choice up to
 * someone who just wanted to run an agent. The list below is an OPINION:
 * what minddy advises, in order.
 *
 * **The criterion is cost as much as capacity**, and it is the plan that sets it
 *. The Pro is €20/month for $15 usage included, and the
 * multiplier ceiling goes from ×15 (GB) to ×40 (Pro) — cf. `lib/billing-plans.ts`. A
 * model beyond ×40 cannot be launched by anyone: it has nothing to do here,
 * however capable it may be. The list therefore targets the Pareto frontier between what codes well and what is affordable, most of it under the Go ceiling.
 *
 * This is NOT a filter: the rest of the catalog remains accessible to the search, and the admin can rewrite the list without deployment
 * (`app_config.recommended_models`, cf. `lib/ai-model-config.ts`). Hence the
 * form — simple ids.
 *
 * It's a SET, not a sequence: the display order is CALCULATED, from least expensive to most expensive (`resolveRecommended`). The only one that remains true — the OpenRouter prices move, and a rank frozen on the day we wrote it would end up announcing a cost scale that no longer exists. The order of the table
 * below is therefore only for reading convenience.
 *
 * NO server-only import here: this module is pulled into the client.
 */

/**
 * The fallback produced, written in code. The multipliers in the comments are
 * relating to the minddy default (`deepseek/deepseek-v4-flash`), such as the
 * OpenRouter prices gave them in August 2026 — indicative, not contractual:
 * it is `lib/model-multiplier.ts` which recalculates them for good, and the picker
 * which displays them.
 *
 * Arranged here from the least expensive to the most expensive so that it can be read again, but it is the price
 * of the day which sets the real order on display: these comments will age,
 * not the sort.
 */
export const DEFAULT_RECOMMENDED_MODELS: string[] = [
  // ×0.4 — 1M context for one fifth of the default. The “mechanical” notch.
  "qwen/qwen3.7-flash",
  // ×1 — minddy's default, and the scale reference.
  "deepseek/deepseek-v4-flash",
  // ×1,1
  "z-ai/glm-4.7-flash",
  // ×3.6 — 1M context, the cheapest of the truly capable.
  "minimax/minimax-m3",
  // ×3,8
  "qwen/qwen3.7-plus",
  // ×4 — best open-weights on SWE-bench Pro, and on long-term code.
  "z-ai/glm-5.2",
  // ×4,2
  "google/gemini-3.1-flash-lite",
  // ×4.5 — leading on SWE-bench Verified, one-ninth of Sonnet's price.
  "deepseek/deepseek-v4-pro",
  // ×5,4
  "openai/gpt-5.1-codex-mini",
  // ×6,7
  "google/gemini-3.5-flash-lite",
  // ×10
  "moonshotai/kimi-k2.7-code",
  // ×14 — the last one that goes under the Go plan ceiling.
  "anthropic/claude-haiku-4.5",
  // ×19 — beyond Go: visible and grayed out there, launchable in Pro.
  "x-ai/grok-4.5",
  // ×29 — the top of the range that a Pro can still afford (ceiling ×40).
  "anthropic/claude-sonnet-5",
];

/**
 * Readable list taken from the value `app_config`, or `null` when there is NOTHING
 * usable (empty, unreadable JSON, not an array, no valid id).
 *
 * `null` is a verdict, not an error: the server responds with a fallback — a
 * broken setting should not empty the picker — and the admin API with a 400, so that
 * no one saves a list that will never be used. Same parser of
 * both sides, as for subagent favorites: what the admin
 * screen accepts is exactly what the picker will read.
 *
 * Duplicates are overwritten rather than refused: twice the same id in a
 * `CommandItem` would give two identical lines of which only one reacts.
 */
export function parseRecommendedModels(raw: string | null | undefined): string[] | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const ids = new Set<string>();
  for (const entry of parsed) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (id) ids.add(id);
  }
  return ids.size > 0 ? [...ids] : null;
}
