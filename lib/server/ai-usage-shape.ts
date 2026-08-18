/**
 * FORMS of AI usage accounting — types, normalization of
 * OpenRouter's `usage`, and nothing else.
 *
 * SEPARATED FROM `ai-usage.ts` BY MIN-224, and for only one reason. The agent loop
 * needs these forms; it has nothing to do with WRITING, which
 * passes through the Supabase client as a service key. Now since MIN-224 the loop
 * descends into the microVM, where the model executes an arbitrary shell: a `env`
 * would be enough to read `SUPABASE_SERVICE_ROLE_KEY` if this module entered into
 * its bundle. The bundle import graph is kept by
 * `vm-bundle-secrets.test.ts` — it is this edge that he has been pointing to
 * since MIN-216, under the name of "written debt".
 *
 * Nothing here touches the base, reads environment, nor any SDK import:
 * it's arithmetic and names. `ai-usage.ts` re-exports them, so no existing
 * callers change.
 */

/** The types of AI calls tracked (1:1 with the migration's `feature` check). */
export type AiFeature =
  | "numo_chat"
  | "numo_comment"
  | "dictation"
  | "transcription"
  | "smart_assign"
  /**
 * Smart-fill (MIN-260): a call to create a ticket, which reads its title
 * and description and sets priority, effort, categories and objective. Its
 * own feature next to `smart_assign` — one chooses WHO takes the ticket,
 * the other says what it IS, we arm them separately and their costs read
 * separately. They meet one line higher, in the segment
 * “Automations” shown to the user (`USAGE_SEGMENTS`).
 */
  | "smart_fill"
  | "feedback_classify"
  | "feedback_analyze"
  | "embedding"
  | "agent_code"
  | "sandbox_compute"
  | "web_search"
  | "pr_review"
  | "import_map"
  /**
 * Breaking a brief into objectives + tickets (MIN-172): one call per brief
 * pasted. Its own feature, like `import_map`: it's the cost of starting
 * of a project, and we want to be able to read it alone.
 */
  | "brief_split"
  /**
 * Landing dictation demo (MIN-150): its TWO calls (transcription
 * then storage) are written under this single feature, under a common run_id
 *. One line = one demo played, its average cost per run = the price of one
 * passage. Putting them under 'transcription'/'dictation' mixed them with the dictation of the real accounts, and made the two questions insoluble.
 */
  | "landing_demo"
  /**
 * Dictate feedback — on the public board as well as in the dashboard. Its TWO calls
 * (listening then storage by Numo) are written under this single feature,
 * under a common run_id: a line = a socket, its average cost per run = the
 * price of a dictated return. On the user side it joins the segment
 * “Returns” (`USAGE_SEGMENTS`): it is feedback, not dictation of
 * ticket, and it is in this line that we will find our expense.
 */
  | "feedback_voice"
  /**
 * A ROUTINE run (MIN-185). Technically it's the run of `agent_code`, au
 * exact word — same calls, same sandbox. In billing, no: an agent run
 * is a gesture that we made, a routine is a subscription that we let
 * run, and confusing them makes it "what ate my budget this
 * this month?" " unsolvable when the answer is "something that runs all
 * alone". Hence TWO features, one by cost nature — without
 * `routine_compute`, the microVM minutes of a routine would remain under
 * “Agents”. The subagents of a routine run bill themselves with their mother.
 */
  | "routine_code"
  | "routine_compute";

/** Form of the `usage` object returned by OpenRouter (chat / embeddings / audio). */
export interface OpenRouterUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  /** USD cost — present only if the request passed `usage: { include: true }`. */
  cost?: number | null;
  /** Audio endpoints (whisper) sometimes expose tokens under these names. */
  input_tokens?: number | null;
  output_tokens?: number | null;
  /**
 * Details of the caching prompt (MIN-242). `cached_tokens` = what the provider has
 * READ back into its cache (charged a fraction of the entry price); `cache_write_tokens`
 * = what was just WRITTEN there (charged a premium, 1.25× at Anthropic). The two
 * are there on the streaming path as well as on the blocking path, and absent from the
 * providers without caching — hence the optional one at the bottom.
 */
  prompt_tokens_details?: {
    cached_tokens?: number | null;
    cache_write_tokens?: number | null;
  } | null;
}

/** Normalized fields extracted from an OpenRouter `usage` (absentee tolerant). */
export interface NormalizedUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  /**
 * Prompt tokens RELEASED to the provider's cache, and tokens it just wrote to y
 * (MIN-242). `null` — never 0 — when the provider says nothing:
 * a zero would read "cache did not bite", when there is no cache
 * at all. It is this distinction that makes the hit rate readable by the ledger
 * without going through OpenRouter's `generation` API.
 */
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
}

/** To pass on each AI call to get the cost inline in the response. */
export const OPENROUTER_USAGE_INCLUDE = { include: true } as const;

/**
 * Normalizes OpenRouter's `usage` object to our fields. Covers both forms
 * of token naming (chat: prompt/completion, audio: input/output) and calculates
 * `totalTokens` by sum if the API does not provide it.
 */
export function parseOpenRouterUsage(
  usage: OpenRouterUsage | null | undefined
): NormalizedUsage {
  if (!usage) {
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cost: null,
      cachedTokens: null,
      cacheWriteTokens: null,
    };
  }
  const prompt = usage.prompt_tokens ?? usage.input_tokens ?? null;
  const completion = usage.completion_tokens ?? usage.output_tokens ?? null;
  const total =
    usage.total_tokens ??
    (prompt != null || completion != null ? (prompt ?? 0) + (completion ?? 0) : null);
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    cost: usage.cost ?? null,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens ?? null,
  };
}

/**
 * TO WHOM the line is charged (MIN-131) — said by the caller, never guessed.
 *
 * The rule produces: everyone pays for their own usage, not that of other members
 * of their project. The fallback on the owner still exists, but it is ASKED: a
 * call path which forgets the user can no longer charge the owner in
 * silence, because `billTo` is obligatory and these three forms are the only ones that exist.
 */
export type AiUsageBillTo =
  /** The identified trigger pays. The normal case of any user action. */
  | { userId: string }
  /**
 * No nameable trigger (anonymous visitor to the public board, background pass
 * from the cron): the project owner pays, because it is HIS budget which authorized the call (`ownerHasUsageBudget`). To be reserved for these cases.
 */
  | { projectOwner: string }
  /**
 * The PLATFORM pays, deliberately: a call that is offered to someone who does not have
 * an account (the landing dictation demo, MIN-150). Like
 * `unattributed`, the line does not enter anyone's budget — but it is distinguished in base, and does NOT log as an error: it is a decided expenditure, not a leak. The pattern says which one.
 */
  | { platform: string }
  /**
 * No one pays — the line exists for accounting, but does not enter the
 * counter for any budget. The reason is logged as an error: it is an anomaly that we loudly assume, never a quiet fault.
 */
  | { unattributed: string };

/** A usage line to save. `runId`, `feature` and `billTo` are required. */
