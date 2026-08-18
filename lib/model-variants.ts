/**
 * A vendor's catalog publishes the same model multiple times — that's
 * the purpose of this file, and nothing else: to bring a family of duplicates to the
 * single id that a human has reason to choose.
 *
 * Three forms of duplicate, measured of the 326 models that the
 * tool-calling filter lets through at OpenRouter:
 *
 * - the DEFERRED RATE (`:batch`, 59 entries, one-fifth of the list) — the same
 * model at half price against an asynchronous queue. We never call it
 *: the agent loop waits for its response. It is therefore pure noise, and
 * the only case where we rule out a variant `:` ;
 * - the DATED SNAPSHOT (`openai/gpt-4o-2024-11-20`,
 * `anthropic/claude-sonnet-5-20260114`) — a BUILD DATE on the calendar, and
 * the bare id is the moving alias that points to it ;
 * - the QUALIFIER (`-preview`, `-exp`, `-beta`…) — `tencent/hy3-preview` to
 * next to `tencent/hy3`, `deepseek-v3.2-exp` next to `deepseek-v3.2`.
 *
 * The rule that holds all three: **we only discard a version if the bare version
 * is there.** `google/gemini-3.1-pro-preview` has no `gemini-3.1-pro` opposite —
 * remains, because removing it would not tidy the list, it would remove the
 * pattern. Guessing a winner in a family that only has dates
 * (`gpt-4o-2024-11-20` / `-2024-08-06`, without `gpt-4o` opposite) would be the same
 * bet: we keep them all.
 *
 * ─── What is NOT a snapshot: The four-digit RELEASE TAG ───
 *
 * `-0731`, `-0813`, `-2507` look like dates and are not. DeepSeek,
 * Qwen and Moonshot use it to release an IMPROVED version under the name of
 * existing family, while the bare id remains attached to the previous release:
 * `deepseek-v4-flash-0731` is not `deepseek-v4-flash` fixed, it is the model
 * according to, and `qwen3-235b-a22b-2507` is not a photo of `qwen3-235b-a22b`.
 * Treating them as duplicates did not tidy up the list - it removed from the picker the
 * only id which leads to this model, and there were none left path.
 *
 * Hence the form of `SNAPSHOT_RE`: it only recognizes a readable date like
 * such as (`2024-11-20`, `20241120`, `05-06`), never a bare tag. A `-0613` of
 * `gpt-4-0613` IS indeed a snapshot — but it has exactly the same
 * shape as a `-0905` of Moonshot, and nothing in the id separates them. The error
 * is not symmetrical: keeping a duplicate lengthens an already searchable list,
 * removing a legitimate model makes it unfindable. When in doubt, we keep.
 *
 * The other variants `:` are NOT duplicates and remain listed:
 * `:free` is another price (therefore another multiplier), `:thinking` a other
 * behavior. A variant survives even when its base disappears —
 * `qwen-plus-2025-07-28:thinking` has no equivalent on `qwen-plus`, and
 * discarding it would lose a capacity instead of a duplicate.
 *
 * The index keeps everything (`openrouter-index.ts`): a hand-pasted id must
 * remain encryptable, including a dated snapshot that an old run still carries.
 * What we store here is the PROPOSED LIST, not what is acceptable.
 */

/** Deferred pricing variant: never available for a synchronous call. */
const BATCH_VARIANT = "batch";

/**
 * Snapshot suffix: a DATE, and nothing else — full ISO
 * (`-2024-11-20`), compact (`-20241120`), or no year (`-05-06`, the form of Google's
 * `-preview-…`). A four-digit release tag (`-0813`, `-2507`)
 * is not one: it names one more model, not a photo of the bare id (see
 * the header). The `$` anchor and the order of the branches matter: `-2024-11-20` must
 * be read in full, not get cut off at `-11-20`.
 */
const SNAPSHOT_RE = /-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{2}-\d{2})$/;

/** Pre-release qualifier attached to the name. */
const QUALIFIER_RE = /-(?:preview|beta|alpha|exp|experimental|nightly|latest|rc\d*)$/;

/** `id` → `[base, variante]` ; variante vide quand il n'y a pas de `:`. */
function splitVariant(id: string): [string, string] {
  const colon = id.indexOf(":");
  return colon < 0 ? [id, ""] : [id.slice(0, colon), id.slice(colon + 1)];
}

/**
 * The NU id of a version: we remove the snapshot and
 * pre-release suffixes, as long as there are any left and as long as there is a name.
 *
 * `google/gemini-2.5-pro-preview-05-06` → `google/gemini-2.5-pro`: the two
 * shapes accumulate, hence the loop. The possible `:` variant is ignored —
 * this is not a version, it is an offer.
 */
export function canonicalModelId(id: string): string {
  const [base] = splitVariant(id);
  const slash = base.indexOf("/");
  const prefix = slash < 0 ? "" : base.slice(0, slash + 1);
  let slug = slash < 0 ? base : base.slice(slash + 1);
  for (;;) {
    const next = slug.replace(SNAPSHOT_RE, "").replace(QUALIFIER_RE, "");
    // A fully eaten slug (`vendor/2024-01-01`) is not a version of
    // something: we stop on the last form which still names.
    if (next === slug || next === "") break;
    slug = next;
  }
  return prefix + slug;
}

/**
 * The catalog cleared of its version duplicates, in the order received.
 * Generic on `{ id }`: the same rule applies for a complete catalog entry
 * and for a simple list of ids.
 */
export function dedupeModelVariants<T extends { id: string }>(models: T[]): T[] {
  const synchronous = models.filter((m) => splitVariant(m.id)[1] !== BATCH_VARIANT);
  const bases = new Set(synchronous.map((m) => splitVariant(m.id)[0]));
  return synchronous.filter((m) => {
    const [base, variant] = splitVariant(m.id);
    if (variant) return true;
    const canonical = canonicalModelId(base);
    return canonical === base || !bases.has(canonical);
  });
}
