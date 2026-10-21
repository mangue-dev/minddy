/**
 * SMART-FILL (MIN-260) — the account preference, and nothing else.
 *
 * The creation form asks for seven properties for each ticket, including four
 * which can be deduced from what we have just written: priority, effort,
 * categories and objective. Smart-fill asks them at creation, from only
 * title + description. The three that remain — status, assigned, deadline — are not deduced from anything: they say an intention, and they remain in hand.
 *
 * Stored in the `user_metadata` of the Supabase account, like
 * [auto-assign-on-start](auto-assign-on-start.ts) and its neighbors. **Activated by
 * default**: only a `false` explicits the cut — a new account has no
 * metadata at all, and an absence should be read as the default, not as a
 * refusal.
 *
 * This module does not depends on NOTHING (neither React nor Supabase): the creation modal le
 * reads it on the client side, the settings screen writes it, and the server uses it to reread what the client claims. This is the only definition of “enabled”.
 */

export const SMART_FILL_META_KEY = "smart_fill";
export const SMART_FILL_CREATED_META_KEY = "smart_fill_created";
export const SMART_FILL_TRIAGE_META_KEY = "smart_fill_triage";

export type SmartFillScope = "created" | "triage";

/** Does the account have Smart-fill enabled? Enabled by default; only an explicit `false`
 * disables it. */
export function resolveSmartFill(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return meta?.[SMART_FILL_META_KEY] !== false;
}

/** Whether automatic Smart Fill monitoring is enabled for one creation family.
 * The master preference always wins; each family is enabled by default so
 * existing accounts keep their current behavior after the finer controls ship. */
export function resolveSmartFillScope(
  meta: Record<string, unknown> | null | undefined,
  scope: SmartFillScope,
): boolean {
  if (!resolveSmartFill(meta)) return false;
  const key =
    scope === "triage" ? SMART_FILL_TRIAGE_META_KEY : SMART_FILL_CREATED_META_KEY;
  return meta?.[key] !== false;
}

/**
 * SMART FILL RE-EVALUATION (MIN-750) — whether an edit of the title or the
 * description lets Smart Fill read the issue again, once the edits have
 * rested. It lives under the master switch, is enabled by default like the
 * others, and belongs to the account that made the latest edit: that account
 * pays the pass, and its refusal cancels a pass that has not run yet.
 */
export const SMART_FILL_REEVALUATE_META_KEY = "smart_fill_reevaluate";

export function resolveSmartFillReevaluation(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSmartFill(meta) && meta?.[SMART_FILL_REEVALUATE_META_KEY] !== false;
}

/**
 * SMART FILL RELATIONS (MIN-717) — two more account preferences, kept apart.
 *
 * - `smart_fill_relations`: whether Smart Fill may LINK an issue to related
 *   issues and dependencies after it is saved. It lives under the master
 *   switch like the creation scopes: Smart Fill off means no relations.
 * - `issue_indexing`: whether the account's issues may be turned into
 *   embedding vectors at all. It is NOT under the Smart Fill switch: the same
 *   index serves search by meaning (MIN-718), which must not force automatic
 *   relations, and a refusal of vectors must hold whatever else is enabled:
 *   with it off, no query vector is created for the user either.
 *   With indexing off, relation inference falls back to lexical candidates
 *   and no vector is generated or billed.
 *
 * Both are enabled by default, read like the others (only an explicit `false`
 * disables), and belong to the account that pays the pass: the creator for a
 * new issue (Smart Fill provenance), the editor for an edit, the project
 * owner for the background backfill — which also honors the issue author's
 * `issue_indexing` refusal. Work already queued re-reads them before
 * spending, so turning one off cancels what has not run yet. A vector
 * already stored stays while the text is unchanged, and is deleted as soon as
 * the content changes or the issue is purged.
 */
export const SMART_FILL_RELATIONS_META_KEY = "smart_fill_relations";
export const ISSUE_INDEXING_META_KEY = "issue_indexing";

export function resolveSmartFillRelations(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSmartFill(meta) && meta?.[SMART_FILL_RELATIONS_META_KEY] !== false;
}

export function resolveIssueIndexing(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return meta?.[ISSUE_INDEXING_META_KEY] !== false;
}
