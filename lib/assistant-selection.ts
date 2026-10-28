// A passage of text the user selected in an editor and handed to Numo
// ("Ask Numo" in the selection toolbar). The same normalization runs in the
// browser, before the pill is shown, and on the server, where the request's
// page context is parsed: the server never trusts the client's cap.

/**
 * Ceiling of a quoted selection. Large enough for a few paragraphs ("rewrite
 * this section"), small enough that one forged context cannot crowd the
 * prompt: a user message itself is capped at 12,000 characters.
 */
export const MAX_SELECTION_LENGTH = 4_000;

/** Length of the excerpt the context pill shows before its ellipsis. */
export const SELECTION_EXCERPT_LENGTH = 40;

// The purpose of this constant IS to match control characters (tab and
// newline are kept: they carry the passage's structure).
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * The selection as it travels and is stored: unified newlines, control
 * characters stripped, trimmed, and cut at `MAX_SELECTION_LENGTH` with an
 * ellipsis. Anything that is not a non-blank string yields `null`.
 */
export function normalizeSelectionText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .trim();
  if (!text) return null;
  return text.length <= MAX_SELECTION_LENGTH
    ? text
    : `${text.slice(0, MAX_SELECTION_LENGTH).trimEnd()}…`;
}

/** The pill's label: the passage folded onto one line, cut with an ellipsis. */
export function selectionExcerpt(
  text: string,
  max: number = SELECTION_EXCERPT_LENGTH,
): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max).trimEnd()}…`;
}
