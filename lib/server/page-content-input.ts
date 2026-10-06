import "server-only";

import { exceedsJsonDepth, MAX_PAGE_JSON_DEPTH } from "@/lib/json-depth";
import { checkPageContent } from "@/lib/page-content-schema";

/** Serialized JSON character limit, shared by page writes and brief validation. */
const MAX_CONTENT_BYTES = 1_000_000;

/**
 * Check depth before serialization, then size before schema traversal. Keep this
 * order so deeply nested input cannot overflow the serializer or schema checker.
 * Missing or non-object input retains the page API's existing optional-body behavior.
 */
export function readPageContent(
  value: unknown
): unknown | undefined | "too-large" | "too-deep" | "refused" {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  if (exceedsJsonDepth(value, MAX_PAGE_JSON_DEPTH)) return "too-deep";
  if (JSON.stringify(value).length > MAX_CONTENT_BYTES) return "too-large";
  const checked = checkPageContent(value);
  if (!checked.ok) return "refused";
  return checked.content;
}
