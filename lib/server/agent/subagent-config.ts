import { isMultiplierWithinPlan } from "@/lib/model-multiplier";
import type { FavoriteSubagentModel, SubagentThinkingEffort } from "@/lib/subagent-favorites";
import type { AgentModelsCatalog } from "./models-catalog";

/**
 * Subagent settings (MIN-112): the "Favorites for sub-agents" list and the
 * parallelism cap.
 *
 * Both go through `app_config`, NOT the env — same mechanism as
 * `agent_model` (`getAppConfigValue`, 60 s cache): adjustable without deployment, as
 * requested, and without additional Vercel variable. A broken config falls on the fallback
 * written in code: a malformed JSON must not kill a run.
 *
 * Favorites are edited from /admin (register `lib/ai-model-config.ts`), therefore the
 * FORM of the list — type, product fallback, parser — lives in a shared module
 * client/server: `lib/subagent-favorites.ts`.
 *
 * THIS MODULE IS PURE since MIN-224: arithmetic and tables, nothing that touches the base. BOTH `app_config` reads went to
 * [subagent-app-config.ts](subagent-app-config.ts), and not for the sake of slicing —
 * the agent loop now runs in the microVM, and whatever it imports must not be able to reach
 * `getServiceClient` (see `vm-bundle-secrets.test.ts`). What
 * she needs to know here — a girl's round cap, the model resolver
 * — never needed the base; what had it were the
 * settings, and they are read BEFORE, on the function side, then go down to the job.
 */

/**
 * THE VOCABULARY OF GIRLS SESSIONS (MIN-286) — repatriated here when `subagent.ts`
 * left with the home loop.
 *
 * What disappeared was the REGISTER: the parallelism cap held en
 * memory, writer's exclusivity, reporting delivery. Opencode holds
 * all this itself — a girl is a session, opened by its tool `task`, and
 * its model comes from the NAME of the agent (see file §2.14). What remains are the
 * three words that the function and the supervisor still need: the mode, the
 * form of a favorite, and the seq band where its expenditure is counted.
 */

/** A girl's two hands: reading to report, or writing code. */
export type SubagentMode = "explore" | "implement";

/**
 * A girl's thinking level and the shape of a favorite live in
 * `lib/subagent-favorites.ts`: the admin dashboard EDITS these favorites, and the client
 * cannot import a server module. Re-exported so that server callers keep a single entry point.
 */
export type { FavoriteSubagentModel, SubagentThinkingEffort };

/**
 * Base of the daughters' `ai_usage` seq strip — above whatever the parent
 * can reach, so the two never interleave on display.
 */
export const SUBAGENT_USAGE_SEQ_BASE = 2_000_000_000;
const SUBAGENT_SEQ_SPAN = 1_000;
/** `ai_usage.seq` is a Postgres `integer`: out of bounds, the INSERT is REJECTED. */
const MAX_PG_INT = 2_147_483_647;

/**
 * Starting seq of the usage lines of the child n° `slot` of the run. The spacing is
 * BOUNDED: beyond that, we fall back on the last representable slot rather than writing
 * an integer out of bounds — two girls would then share a seq range (an
 * ambiguous display order), where an overrun would lose the entire usage line.
 */
export function subagentUsageSeq(slot: number): number {
  const s = Number.isFinite(slot) ? Math.max(0, Math.floor(slot)) : 0;
  const room = MAX_PG_INT - SUBAGENT_USAGE_SEQ_BASE - SUBAGENT_SEQ_SPAN;
  return SUBAGENT_USAGE_SEQ_BASE + Math.min(s * SUBAGENT_SEQ_SPAN, room);
}

/**
 * Round cap for a girl, CUMULATED over all her retakes — and not by
 * chunk: a girl retaken three times is not entitled to forty-five rounds.
 */
export const SUBAGENT_MAX_ROUNDS = 15;

/**
 * What rounds are left for a girl who is about to (re)launch. **Zero or
 * less means CUT**, never "give one back."
 *
 * This nuance cost two entire routine runs (08/07/2026). The
 * launcher limited the girl taken to `Math.max(1, MAX - already played)`: once
 * her ceiling was reached, she left with ONE round, played it, the loop
 * immediately suspended (`round >= maxRounds`), the parent parked, the chunk se
 * re-queued — and that started again with the next chunk. Nineteen chunks of 5 to 20 s
 * during which the parent didn't say a word, each paying for their wakeup by
 * microVM, until the 20-continuation guardrail killed the round.
 *
 * The `max(1, …)` seemed prudent — “at least one round, otherwise the loop
 * would refuse to turn”. It's exactly the opposite: a loop that cannot continue
 * must return, not run empty.
 */
export function subagentRoundsLeft(roundsSoFar: number | undefined): number {
  return SUBAGENT_MAX_ROUNDS - (roundsSoFar ?? 0);
}


/** A favorite, located on the run cost scale — `undefined` = not placeable. */
export type ScopedFavorite = FavoriteSubagentModel & { multiplier?: number };

/**
 * What a run has the right to give to its girls: the catalog and the favorites
 * PASSED TO THE PLAN CEILING of the paying account.
 *
 * Without this sorting, `spawn_agent` was the hole in the racket: the picker grise
 * Opus for a Go account, but the parent agent was offered the entire
 * tool-calling catalog and could delegate to it — on the minddy quota, and
 * without anyone having chosen it. The ceiling must apply to everything that
 * spends, including when it is a model that decides.
 *
 * The ceiling obviously only applies to the minddy quota: in BYOK, the catalog
 * does not carry a `maxMultiplier` and nothing is removed.
 */
export interface SubagentModelScope {
  /** Ids the girl can really spin. */
  allowedIds: string[];
  /** Ids known from the catalog but above the ceiling: refused by SAYING so. */
  abovePlanIds: string[];
  /** Favorites that fit in the ceiling — what the prompt announces. */
  favorites: ScopedFavorite[];
  /** Plan ceiling, or null (BYOK) — to explain it to the parent. */
  maxMultiplier: number | null;
}

export function scopeSubagentModels(opts: {
  favorites: FavoriteSubagentModel[];
  catalog: Pick<AgentModelsCatalog, "models" | "maxMultiplier">;
}): SubagentModelScope {
  const max = opts.catalog.maxMultiplier ?? null;
  const multipliers = new Map(
    opts.catalog.models.flatMap((m) => (m.multiplier == null ? [] : [[m.id, m.multiplier]] as const)),
  );
  const within = (id: string) => max == null || isMultiplierWithinPlan(multipliers.get(id), max);

  const allowedIds: string[] = [];
  const abovePlanIds: string[] = [];
  for (const m of opts.catalog.models) (within(m.id) ? allowedIds : abovePlanIds).push(m.id);

  return {
    allowedIds,
    abovePlanIds,
    // A favorite that the catalog does not locate remains served: we do not remove a
    // safe bet because the price index was unreadable that day.
    favorites: opts.favorites
      .filter((f) => within(f.id))
      .map((f) => {
        const multiplier = multipliers.get(f.id);
        return multiplier == null ? f : { ...f, multiplier };
      }),
    maxMultiplier: max,
  };
}

/**
 * Resolver of the `model` field of `spawn_agent`, built for ONE run.
 *
 * Validated against the run catalog (`getAgentModelsForUser`) and NOT against the index
 * deprived of `model.ts`: the catalog is already exported, hidden for an hour, never raises
 *, and above all it FILTERS on tool-calling support — a sub-agent who does not
 * know how to call a tool cannot do anything. Favorites are accepted by id AND
 * by label (the agent reads them by name in its prompt) even if the catalog
 * could not be loaded: a curated favorite is a safe bet.
 *
 * An invented id returns as a TOOL ERROR with the list of favorites, never in 400
 * from the provider — this one would burn a round of the girl for nothing. A model which
 * exists but exceeds the ceiling of the plan is refused SEPARATEly, by naming it: him
 * answering “unknown in the catalog” would be wrong, and the agent would try it again under
 * another spelling instead of choosing another.
 */
export function makeSubagentModelResolver(opts: {
  favorites: FavoriteSubagentModel[];
  /** Catalog ids of the PASSED TO CEILING run (empty = catalog unavailable). */
  catalogIds: string[];
  /** Catalog Ids excluded by the plan ceiling. */
  abovePlanIds?: string[];
  /** The ceiling itself, to tell the parent. */
  maxMultiplier?: number | null;
}): (raw: string) => { ok: true; id: string } | { ok: false; error: string } {
  const catalog = new Set(opts.catalogIds);
  const abovePlan = new Set(opts.abovePlanIds ?? []);
  const byLabel = new Map(opts.favorites.map((f) => [f.label.toLowerCase(), f.id]));
  const favoriteIds = new Set(opts.favorites.map((f) => f.id));
  const list = () => opts.favorites.map((f) => `${f.id} (${f.label})`).join(", ");

  return (raw: string) => {
    const value = raw.trim();
    const byName = byLabel.get(value.toLowerCase());
    if (byName) return { ok: true, id: byName };
    if (favoriteIds.has(value) || catalog.has(value)) return { ok: true, id: value };
    if (abovePlan.has(value)) {
      return {
        ok: false,
        error:
          `${value} is above this account's plan ceiling` +
          (opts.maxMultiplier != null ? ` (×${opts.maxMultiplier} its default model)` : "") +
          `, so it cannot run on this account's usage budget. ` +
          `Available favorites: ${list()}. Omit \`model\` to run the sub-agent on your own model.`,
      };
    }
    return {
      ok: false,
      error:
        `Unknown model ${JSON.stringify(value)} — it is not in this session's model catalogue ` +
        `(models that cannot call tools are excluded from it, and a sub-agent needs tools). ` +
        `Favorites for sub-agents: ${list()}. Omit \`model\` to run the sub-agent on your own model.`,
    };
  };
}
