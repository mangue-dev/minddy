/**
 * Shared registry (client + server) of models and settings of the agent of
 * cloud code (MIN-46). NO server-only import: the model picker (UI) and the
 * server-side resolution (`lib/server/agent/model.ts`) both import it.
 *
 * Model resolution cascade of a run:
 * run override > user's personal default (user_agent_preferences) >
 * root default (app_config.agent_model, fallback AGENT_ROOT_MODEL_FALLBACK).
 */
import { aiModelFallback } from "@/lib/ai-model-config";

export interface AgentModelOption {
  /** id OpenRouter au format `provider/model`. */
  id: string;
  /** label displayed in the picker. */
  label: string;
  /** short note (cost / usage). */
  hint?: string;
}

// ── app_config keys (admin overload without redeploy) ──────────────────────────
/** Root defect in the agent model. */
export const AGENT_MODEL_CONFIG_KEY = "agent_model";
// The old fixed monthly cap (`agent_monthly_cap_usd`, $10) is replaced
// from MIN-72 by the PLAN usage budget (lib/billing-plans.ts).

/**
 * Root fault if `app_config.agent_model` is absent. The id itself lives in
 * the admin registry (`lib/ai-model-config.ts`), along with all the others — we don't rewrite it here. Mirror the migration seed 20260806090000_agent_runs.sql:
 * keep both in sync.
 */
export const AGENT_ROOT_MODEL_FALLBACK = aiModelFallback(AGENT_MODEL_CONFIG_KEY);

/**
 * Curated labels from a handful of top models. The picker (launch +
 * personal default) is NO LONGER limited to this list: it searches the entire index
 * OpenRouter (`/api/agent/models`) and formats the names via `formatModelName`.
 * This list is only used to provide nice known labels (cf. `model-display`)
 * for these specific ids. Ids to be confirmed against OpenRouter index `/models`.
 */
export const AGENT_ALLOWED_MODELS: AgentModelOption[] = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", hint: "Économique · défaut" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", hint: "Équilibré, fort en code" },
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", hint: "Qualité maximale" },
];

// ── Operational settings (defaults; overloadable later) ────────────────
/**
 * CEILING of the soft-deadline of a chunk: beyond that, we suspend the next round.
 *
 * 700 s, based on the 800 s of the Pro plan under Fluid Compute (see the `maxDuration` of
 * `app/api/cron/agent-drain`). This is only a CEILING: the effective soft-deadline
 * is `min(the caller's declared budget, this)`, so a drain launched from a
 * route of 300 s remains limited by its own budget. This is what allows you to have long chunks in the cron without endangering the short paths.
 */
export const AGENT_SOFT_DEADLINE_MS = 700_000;
/** Hard timeout of a model call in the agentic loop. */
export const AGENT_RUN_TIMEOUT_MS = 210_000;
/** Garde-fou anti-runaway : nombre max de reprises (suspend→resume) d'un run. */
export const AGENT_MAX_CONTINUATIONS = 20;

// ── Context compaction (hardening, very long runs) ────────────────────
/** Beyond this estimation of tokens, we summarize the middle of the history.
 Conservative (proxy characters/4 which underestimates the code): safe on models
 with a wide window (DeepSeek, Claude…). */
export const AGENT_COMPACT_TOKEN_THRESHOLD = 70_000;
/**
 * CALIBRATED VALUE of the compaction threshold: what it is worth at the reference price, and
 * the FLOOR under which it never falls (see `agentCompactThreshold`, which
 * transposes it to the price of the run model — it was a fixed ceiling until MIN-248).
 *
 * Window ≠ budget. The threshold was 75% of the window, and the models we
 * use have windows from 1M to 1.05M → effective threshold ~787,000 tokens, i.e.
 * 5× our largest checkpoint. Result: compaction never ran a single time in production (MIN-113). What caps a long session is not
 * the window, it is the COST PER ROUND: we return the entire history with each call
 * and — measured, not assumed — prompt caching does not amortize it (the breakpoints of
 * `caching.ts` are at the top of the history, so the block hidden remains frozen while
 * the history increases; the observed cost sticks to the full input rate to within 2%).
 *
 * 120,000 comes from the MIN-101 measurement of 814 agent `ai_usage` calls:
 * • p90 of real context = 86,815 tokens → a normal session never sees it;
 * • max observed = 158,301 → a cap at 180k would NEVER trigger, this which
 * would reproduce the bug that we are correcting here;
 * • summarizing is amortized in ~1.2 rounds from 60 k, so it is the quality (do not
 * harass the short sessions) which sets the floor, not the profitability.
 * To be reviewed if the distribution of contexts changes — not to the blind man.
 */
export const AGENT_COMPACT_BASELINE_TOKENS = 120_000;
/**
 * Entry price AT WHICH the 120,000 above were calibrated: that of model
 * minddy's default at the time of measurement (`deepseek/deepseek-v4-flash`,
 * $0.14/Mtok). This is what makes the cap TRANSPOSABLE: at this price, the prompt
 * of a round costs $0.0168, and it is this COST PER ROUND — not the number of
 * tokens — that the cap actually limits.
 */
export const AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK = 0.14;
/**
 * How high the cap can GO for a cheap model. Twice the value
 * calibrated, and the reason is that of MIN-113: the largest context ever
 * observed on the agent is 158,301 tokens. A threshold beyond 240,000 would therefore never trigger — that is, it would not exist.
 */
export const AGENT_COMPACT_MAX_TOKENS_CEILING = 240_000;

/**
 * COMPACTION THRESHOLD of the run, derived from the model rather than written in hard copy.
 *
 * The 120,000 cap said a real thing — "a round should not cost
 * more than that to return" — but it said it in TOKENS, which does not mean la
 * same as for a model at the same price. Between `deepseek-v4-flash`
 * ($0.14/Mtok) and `claude-opus-4.8` ($5/Mtok), the same history of 120,000
 * tokens costs $0.017 or $0.60 per round: thirty-six times the difference, for a
 * safeguard supposed to limit an expense.
 *
 * The threshold is therefore read in dollars and is converted into tokens at the price of the model.
 * Three terminals, and each repairs a known fault:
 *
 * - **floor to `AGENT_COMPACT_BASELINE_TOKENS`** — we never GO
 * below the calibrated value, even for a very expensive model. Compacting earlier
 * saves nothing: the model buys back in rereads what is taken from it, and
 * is exactly MIN-248. An expensive model therefore keeps the behavior
 * of today, down to the byte.
 * - **ceiling at `AGENT_COMPACT_MAX_TOKENS_CEILING`** — a threshold that runs
 * never reach has never been triggered (MIN-113).
 * - **and always ≤ 75% of the window**: the budget cannot exceed what
 * the model can read.
 *
 * `inputUsdPerMTok` unknown (BYOK provider outside the OpenRouter catalog) or null
 * (free model) → we fall back on the calibrated value. Ignoring the price is not
 * a license to move up: it is a reason not to move.
 */
export function agentCompactThreshold(opts: {
  contextWindow?: number | null;
  inputUsdPerMTok?: number | null;
}): number {
  const fromWindow = opts.contextWindow
    ? Math.floor(opts.contextWindow * 0.75)
    : AGENT_COMPACT_TOKEN_THRESHOLD;

  const price = opts.inputUsdPerMTok;
  const affordable =
    typeof price === "number" && Number.isFinite(price) && price > 0
      ? Math.floor(
          (AGENT_COMPACT_BASELINE_TOKENS * AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK) / price,
        )
      : AGENT_COMPACT_BASELINE_TOKENS;

  const budget = Math.min(
    Math.max(affordable, AGENT_COMPACT_BASELINE_TOKENS),
    AGENT_COMPACT_MAX_TOKENS_CEILING,
  );
  return Math.min(fromWindow, budget);
}
/** Size (bytes) of the recent queue preserved verbatim during compaction. */
export const AGENT_COMPACT_KEEP_RECENT_BYTES = 48_000;
/** We do not launch compaction (additional LLM call) if there is less than that budget remaining. */
export const AGENT_COMPACT_MIN_BUDGET_MS = 60_000;

/**
 * Rate at which BOTH engines reread the spending cap — the loop
 * house (`refreshBudgetUsd`) like the opencode supervisor. Here rather than
 * in each of them: a loss window which would differ between the two forms
 * would be exactly the kind of gap that MIN-224 is careful not to create, and
 * MIN-286 completes the separation — the supervisor does not import the loop that it
 * replaces.
 *
 * One minute, and not every round: reading costs two requests (billing
 * + sum of the ledger) and a round can last three seconds. What can be lost
 * between two readings is therefore limited by what the OTHER runs spend in one
 * minute — compared to five for the old form, which only rereads between its chunks,
 * and compared to an entire round (hours) for a form which does not reread.
 */
export const BUDGET_REFRESH_INTERVAL_MS = 60_000;
