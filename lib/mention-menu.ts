import { isExactIssueQuery, orderIssuesForSearch } from "@/lib/issue-search-order";

export interface MentionSearchItem {
  type: string;
  label: string;
  keywords?: readonly string[];
  /** Issues: their status, which orders them (MIN-726). */
  status?: string;
}

export interface ActiveMentionQuery {
  /** Offset of the triggering `@` in the text node. */
  start: number;
  /** Caret offset in the text node. */
  end: number;
  /** Search text without the triggering `@`. */
  query: string;
}

/**
 * The exit gestures: a space right after the bare trigger, or, once a query
 * is typed, two spaces in a row — or what macOS makes of them, a period
 * followed by a space (its "add period with double-space" substitution), at
 * the end of the query.
 */
const QUERY_EXIT = /^[ \u00a0]|[ \u00a0]{2}|\.[ \u00a0]$/;

/** The open query of `trigger` (“@”, “/”) right before the caret, at the
    start of the text or after a space. */
function activeTrigger(trigger: string): RegExp {
  const char = trigger.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(^|[\\t \\u00a0\\r\\n])${char}([^${char}\\r\\n]*)$`);
}
const ACTIVE_MENTION = activeTrigger("@");

/**
 * Reads the active mention immediately before the caret.
 *
 * Once something is typed after the `@`, a single regular or non-breaking
 * space remains part of the query so full names and multi-word titles can be
 * searched, and two consecutive spaces end the mention mode. A space right
 * after a bare `@` ends it at once. Either way the text stays untouched.
 */
export function findActiveMentionQuery(
  textBeforeCaret: string,
): ActiveMentionQuery | null {
  return findActiveTriggerQuery(textBeforeCaret, "@");
}

/** The same reading for any trigger: “/” follows the rules of “@”. */
export function findActiveTriggerQuery(
  textBeforeCaret: string,
  trigger: string,
): ActiveMentionQuery | null {
  const match = (trigger === "@" ? ACTIVE_MENTION : activeTrigger(trigger)).exec(textBeforeCaret);
  if (!match || QUERY_EXIT.test(match[2])) return null;

  const start = (match.index ?? 0) + match[1].length;
  return {
    start,
    end: textBeforeCaret.length,
    query: match[2],
  };
}

/**
 * Stable ordering: put Numo first, preserve source order, and place tickets
 * last. Among tickets, the issue search order applies (MIN-726): work under
 * way first, closed and triage tickets last, and the ticket whose identifier
 * is the query before all.
 */
/** The targets MIN-872 added, listed after the issues: people, projects,
    objectives, pages and issues stay what a mention is most often for. */
const FEATURE_TYPES: ReadonlySet<string> = new Set(["scratchpad", "cycle", "routine", "skill", "mcp", "pull_request"]);

export function orderMentionItems<T extends MentionSearchItem>(
  items: readonly T[],
  query = "",
): T[] {
  const numo: T[] = [];
  const other: T[] = [];
  const issues: T[] = [];
  const features: T[] = [];
  for (const item of items) {
    (item.type === "numo" ? numo
      : item.type === "issue" ? issues
      : FEATURE_TYPES.has(item.type) ? features
      : other).push(item);
  }
  const orderedIssues = orderIssuesForSearch(
    issues,
    (item) => item.status,
    (item) => isExactIssueQuery(query, item.label),
  );
  return [...numo, ...other, ...orderedIssues, ...features];
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
  return orderMentionItems(matches, query);
}
