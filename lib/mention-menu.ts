export interface MentionSearchItem {
  type: string;
  label: string;
  keywords?: readonly string[];
}

export interface ActiveMentionQuery {
  /** Offset of the triggering `@` in the text node. */
  start: number;
  /** Caret offset in the text node. */
  end: number;
  /** Search text without the triggering `@`. */
  query: string;
}

const ACTIVE_MENTION = /(^|[\t \u00a0\r\n])@([^@\r\n]*)$/;
const DOUBLE_SPACE = /[ \u00a0]{2}/;

/**
 * Reads the active mention immediately before the caret.
 *
 * A single regular or non-breaking space remains part of the query so full
 * names and multi-word titles can be searched. Two consecutive spaces end the
 * mention mode and leave the text untouched.
 */
export function findActiveMentionQuery(
  textBeforeCaret: string,
): ActiveMentionQuery | null {
  const match = ACTIVE_MENTION.exec(textBeforeCaret);
  if (!match || DOUBLE_SPACE.test(match[2])) return null;

  const start = (match.index ?? 0) + match[1].length;
  return {
    start,
    end: textBeforeCaret.length,
    query: match[2],
  };
}

/** Stable ordering: preserve relevance/source order, but place tickets last. */
export function orderMentionItems<T extends MentionSearchItem>(
  items: readonly T[],
): T[] {
  const other: T[] = [];
  const issues: T[] = [];
  for (const item of items) {
    (item.type === "issue" ? issues : other).push(item);
  }
  return [...other, ...issues];
}

/** Matches a mention query without imposing an artificial result limit. */
export function filterMentionItems<T extends MentionSearchItem>(
  items: readonly T[],
  query: string,
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = normalized
    ? items.filter((item) =>
        [item.label, ...(item.keywords ?? [])].some((term) =>
          term.toLocaleLowerCase().includes(normalized),
        ),
      )
    : [...items];
  return orderMentionItems(matches);
}
