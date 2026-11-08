/**
 * Columns whose change alone is no news (MIN-926). The batch filter drops an
 * update that changed only these, and the wake decision (MIN-928) leaves them
 * out of an event's changed fields.
 */

/** Order, maintenance, derived data. */
const NOISE_FIELDS = new Set([
  "position", "sort_order", "favorite", "version", "search_text", "search_tsv",
  "embedding", "analyzed_at", "analysis_claimed_at", "analysis_failures", "classified_at",
  "vote_count", "suggested_merge_into_id", "suggested_confidence", "sensitivity", "moderation_reason",
  "translated_title", "translated_body", "translated_language", "source_language",
  "remote_url", "updated_kind", "updated_api_key_id",
  // Who saved last: it changes with the content, never meaningfully alone.
  "updated_by",
  // Bumped by every write of a protected or collaborative row, whatever it
  // changed (the collaboration reset bumps only these).
  "encryption_revision", "content_revision", "body_revision", "title_revision",
]);
const NOISE_SUFFIX = /_(checked|attempted|synced)_at$/;

export function isNoiseField(field: string): boolean {
  return NOISE_FIELDS.has(field) || NOISE_SUFFIX.test(field);
}
