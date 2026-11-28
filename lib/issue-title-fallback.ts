/**
 * The pure halves of the Smart Fill title (MIN-798): cleaning a model's
 * answer, and the fallback title read from the description's first line.
 * Client-safe on purpose: the server uses them to name an issue, and the board
 * shows the same fallback on a card Smart Fill is still filling (MIN-1032).
 */

/** A board row reads about this much at a glance: the budget the prompt sets. */
export const MAX_GENERATED_TITLE_CHARS = 80;
/**
 * How long a model's answer may run past that budget and still be kept whole
 * (MIN-1038). A title cut to fit is a fragment ("Items show unfiltered while the
 * view of"), worse than a slightly long one, so a model's answer is never cut: within
 * this limit it stays as written, beyond it the answer is unusable and the
 * caller falls back to the description's first line.
 */
export const MAX_ACCEPTED_TITLE_CHARS = 120;

/**
 * Strips what small models add around a title or a name: spare whitespace,
 * quotes, a label `prefix` such as "Title:", and the `trailing` punctuation.
 */
export function tidyGeneratedText(raw: string, prefix: RegExp, trailing: RegExp): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'«»“”`\s]+|["'«»“”`\s]+$/g, "")
    .replace(prefix, "")
    .replace(trailing, "")
    .trim();
}

const TITLE_PREFIX = /^(titre|title)\s*[:—-]\s*/i;
const TITLE_TRAILING = /[.…;:,]+$/;

/**
 * Cleans the model's output: quotes, a "Title:" prefix, final punctuation and
 * spare whitespace. The answer is kept whole, never cut: `null` when nothing
 * remains or when it runs past `MAX_ACCEPTED_TITLE_CHARS`. Pure, exported for
 * its test.
 */
export function cleanIssueTitle(raw: string): string | null {
  const cleaned = tidyGeneratedText(raw, TITLE_PREFIX, TITLE_TRAILING);
  if (!cleaned || cleaned.length > MAX_ACCEPTED_TITLE_CHARS) return null;
  return cleaned;
}

/**
 * `text` within `max` characters: whole when it fits, otherwise cut at the
 * last whole word and closed with an ellipsis, so the cut reads as an excerpt
 * rather than as a broken sentence. For text taken from the author, never for
 * a model's answer. Pure.
 */
export function excerptAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s.…;:,!?—–-]+$/, "");
  return `${head || cut}…`;
}

/** How much of the description the fallback reads. */
const MAX_FALLBACK_LINES = 50;
const MAX_FALLBACK_LINE_CHARS = 1_000;

/**
 * The description's first line of text, stripped of its Markdown, uncut.
 * `null` when the description holds no text at all (an image alone).
 */
export function firstDescriptionLine(description: string | null | undefined): string | null {
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
    if (text) return text;
  }
  return null;
}

/**
 * The title when no model answers: the description's first line, within a
 * board row and closed with an ellipsis when it had to be cut. `null` when the
 * description holds no text at all: such an issue still needs a title from
 * its author.
 */
export function fallbackIssueTitle(description: string | null | undefined): string | null {
  const line = firstDescriptionLine(description);
  if (!line) return null;
  const title = tidyGeneratedText(line, TITLE_PREFIX, TITLE_TRAILING);
  return title ? excerptAtWord(title, MAX_GENERATED_TITLE_CHARS) : null;
}
