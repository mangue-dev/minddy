/**
 * The pure halves of the Smart Fill title (MIN-798): cleaning a model's
 * answer, and the fallback title read from the description's first line.
 * Client-safe on purpose: the server uses them to name an issue, and the board
 * shows the same fallback on a card Smart Fill is still filling (MIN-1032).
 */

/** A board row reads about this much at a glance. */
export const MAX_GENERATED_TITLE_CHARS = 80;
/** A safeguard for a model that returns a whole sentence anyway. */
const MAX_GENERATED_TITLE_WORDS = 12;

/**
 * Cleans the model's output: quotes, a "Title:" prefix, final punctuation,
 * spare whitespace, and a length beyond what a board row shows. Cuts at the
 * last whole word. `null` when nothing remains. Pure, exported for its test.
 */
export function cleanIssueTitle(raw: string): string | null {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'«»“”`\s]+|["'«»“”`\s]+$/g, "")
    .replace(/^(titre|title)\s*[:—-]\s*/i, "")
    .replace(/[.…;:,]+$/, "")
    .trim();
  if (!cleaned) return null;
  const words = cleaned.split(" ");
  const capped =
    words.length > MAX_GENERATED_TITLE_WORDS
      ? words.slice(0, MAX_GENERATED_TITLE_WORDS).join(" ")
      : cleaned;
  if (capped.length <= MAX_GENERATED_TITLE_CHARS) return capped;
  const cut = capped.slice(0, MAX_GENERATED_TITLE_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[.…;:,]+$/, "");
}

/** How much of the description the fallback reads. */
const MAX_FALLBACK_LINES = 50;
const MAX_FALLBACK_LINE_CHARS = 1_000;

/**
 * The title when no model answers: the description's first line of text,
 * stripped of its Markdown. `null` when the description holds no text at all
 * (an image alone): such an issue still needs a title from its author.
 */
export function fallbackIssueTitle(description: string | null | undefined): string | null {
  if (!description) return null;
  // The description is the author's text, up to 64 KB: only its first lines
  // are read, each cut short, and the link patterns below are bounded, so a
  // crafted description cannot make these replacements slow.
  for (const line of description.split("\n", MAX_FALLBACK_LINES)) {
    const text = line
      .slice(0, MAX_FALLBACK_LINE_CHARS)
      // Images say nothing a title can use; links and mentions keep their label.
      .replace(/!\[[^\]\n]{0,200}\]\([^)\n]{0,500}\)/g, "")
      .replace(/\[([^\]\n]{0,200})\]\([^)\n]{0,500}\)/g, "$1")
      // Block markers: headings, quotes, list bullets, numbers and checkboxes.
      .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX~-]\]\s+)?|\d+[.)]\s+)/, "")
      .replace(/[*_~`]+/g, "")
      .trim();
    if (text) return cleanIssueTitle(text);
  }
  return null;
}
