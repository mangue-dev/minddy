// Project key = 2–5 uppercase letters, unique per owner. Auto-suggested from the
// name, editable by the user. (Matches plan.md §14.)

export const PROJECT_KEY_MAX = 5;
export const PROJECT_KEY_MIN = 2;

/** Uppercase, strip anything that isn't A–Z, clamp to the max length. */
export function normalizeKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, PROJECT_KEY_MAX);
}

export function isValidKey(key: string): boolean {
  return new RegExp(`^[A-Z]{${PROJECT_KEY_MIN},${PROJECT_KEY_MAX}}$`).test(key);
}

/**
 * Suggest a key from a project name:
 *  - 2+ words → initials ("Refactor UI" → "RU")
 *  - 1 word   → first letters ("Refactor" → "REFA")
 * Result is uppercased, A–Z only, clamped to the max length. May return fewer
 * than the minimum for odd inputs — the form asks the user to complete it then.
 */
export function suggestKeyFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  let candidate =
    words.length >= 2
      ? words.map((w) => w[0]).join("")
      : words[0].slice(0, PROJECT_KEY_MAX);

  candidate = normalizeKey(candidate);

  // Single short acronym (e.g. one-letter words) → fall back to name letters.
  if (candidate.length < PROJECT_KEY_MIN) {
    candidate = normalizeKey(words.join(""));
  }
  return candidate;
}
