/**
 * The account's dictation vocabulary (MIN-773): the words a speech model
 * cannot be expected to spell — product names, people, jargon — and, for some
 * of them, what the model writes instead.
 *
 * - An entry with only a `term` is a spelling: it guides the cleanup pass (and
 *   the transcription model where the provider accepts a hint).
 * - An entry with `heardAs` is a replacement: every whole-word occurrence of
 *   `heardAs` in the final text becomes `term`, deterministically, cleanup on
 *   or off.
 *
 * Stored in `user_metadata` like the other dictation preferences, which ride in
 * the session token: hence the tight caps below. Shared by the settings screen,
 * the recorder (which sends its live copy) and `/api/transcribe`; no React, no
 * server-only import.
 */

export const DICTATION_VOCABULARY_META_KEY = "dictation_vocabulary";
export const MAX_VOCABULARY_ENTRIES = 50;
export const MAX_VOCABULARY_TERM_CHARS = 40;

export interface VocabularyEntry {
  /** How the word is written. */
  term: string;
  /** What transcription produces instead, replaced by `term`. */
  heardAs?: string;
}

// Control characters and line breaks never belong in a single word or phrase.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const HAS_CONTENT = /[\p{L}\p{N}]/u;

/** One term as stored: NFC (the characters as typed), single-spaced, trimmed and capped. "" when unusable. */
export function normalizeVocabularyTerm(value: unknown): string {
  if (typeof value !== "string") return "";
  const term = value
    .normalize("NFC")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_VOCABULARY_TERM_CHARS)
    .trim();
  return HAS_CONTENT.test(term) ? term : "";
}

const keyOf = (entry: VocabularyEntry) =>
  `${entry.term.toLocaleLowerCase()}\u0000${(entry.heardAs ?? "").toLocaleLowerCase()}`;

/** Validate, normalize, dedupe and cap a list from any source. */
export function sanitizeVocabulary(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: VocabularyEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const term = normalizeVocabularyTerm((item as { term?: unknown }).term);
    if (!term) continue;
    const heardAs = normalizeVocabularyTerm((item as { heardAs?: unknown }).heardAs);
    const entry: VocabularyEntry =
      heardAs && heardAs.toLocaleLowerCase() !== term.toLocaleLowerCase()
        ? { term, heardAs }
        : { term };
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length === MAX_VOCABULARY_ENTRIES) break;
  }
  return entries;
}

/** The account's vocabulary, read from its `user_metadata`. */
export function resolveDictationVocabulary(
  meta: Record<string, unknown> | null | undefined,
): VocabularyEntry[] {
  return sanitizeVocabulary(meta?.[DICTATION_VOCABULARY_META_KEY]);
}

/** The vocabulary a dictation request carries (JSON), or null when absent or malformed. */
export function parseVocabularyField(value: unknown): VocabularyEntry[] | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return sanitizeVocabulary(JSON.parse(value));
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace each `heardAs` with its `term`, as a whole word (letters and digits
 * of any script are word characters) and case-insensitively. Longer phrases go
 * first so "new mo app" wins over "new mo".
 */
export function applyVocabularyReplacements(
  text: string,
  entries: readonly VocabularyEntry[],
): string {
  const replacements = entries
    .filter((entry): entry is Required<VocabularyEntry> => !!entry.heardAs)
    .sort((a, b) => b.heardAs.length - a.heardAs.length);
  let result = text;
  for (const { term, heardAs } of replacements) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(heardAs).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    result = result.replace(pattern, () => term);
  }
  return result;
}

/** The distinct spellings, for the cleanup prompt and the transcription hint. */
export function vocabularyTerms(entries: readonly VocabularyEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.term))];
}
