/**
 * The `analyze` option of `POST /api/v1/feedback` (MIN-106) — shared, pure.
 *
 * A client running its own classifier should be able to say, return by
 * return, that Numo is not looking at that one. The flag is optional and is set to
 * `true` by default: integrations already in place do not change their behavior overnight.
 *
 * Reading is STRICT, like the rest of the public API: `"false"`, `0` or
 * `null` is not equal to `false`. On an option that decides whether a return is moderated before appearing on a public board, guessing the intent of a mistyped value would be the worst of both worlds — silent, and wrong in the dangerous sense one out of two times. Better a 422 that the integrator sees.
 */

export type AnalyzeOption =
  | { ok: true; analyze: boolean }
  | { ok: false; error: "invalid_analyze" };

export function readAnalyzeOption(value: unknown): AnalyzeOption {
  if (value === undefined) return { ok: true, analyze: true };
  if (typeof value !== "boolean") return { ok: false, error: "invalid_analyze" };
  return { ok: true, analyze: value };
}
