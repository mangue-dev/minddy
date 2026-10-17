/**
 * Order of issues in every issue search (MIN-726) — pure and shared by the
 * palette, the mention menus, the cmdk pickers and the server search.
 *
 * Three tiers, whatever the query:
 *   0. work under way: `in_progress`, `in_review`;
 *   1. the other open issues: `backlog`, `todo` (and any status this list
 *      does not know, so a new status is never buried);
 *   2. issues that are not open: `triage`, `done`, `canceled`, `duplicate` —
 *      always last.
 *
 * Within a tier, the caller's relevance order is kept (stable sort). One
 * exception keeps lookup reliable (MIN-718): an issue whose identifier or
 * number IS the query comes before every tier.
 */

export type IssueSearchTier = 0 | 1 | 2;

const UNDER_WAY = new Set(["in_progress", "in_review"]);
const NOT_OPEN = new Set(["triage", "done", "canceled", "duplicate"]);

export function issueSearchTier(status: string | null | undefined): IssueSearchTier {
  if (status && UNDER_WAY.has(status)) return 0;
  if (status && NOT_OPEN.has(status)) return 2;
  return 1;
}

/** Whether the typed query names this issue exactly (`MIN-42`, `min-42`, `42`, `#42`). */
export function isExactIssueQuery(query: string, identifier: string | null | undefined, number?: number | null): boolean {
  const q = query.trim().toLocaleLowerCase().replace(/^#/, "");
  if (!q) return false;
  if (identifier && q === identifier.toLocaleLowerCase()) return true;
  return number != null && /^\d+$/.test(q) && Number(q) === number;
}

/**
 * Stable reorder of issues by tier, exact identifier first. `exact` may be
 * omitted when there is no query (an opened picker). Pure.
 */
export function orderIssuesForSearch<T>(
  items: readonly T[],
  statusOf: (item: T) => string | null | undefined,
  exact?: (item: T) => boolean,
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      rank: exact?.(item) ? -1 : issueSearchTier(statusOf(item)),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * cmdk keyword token carrying an issue's tier. Starts with a NUL character,
 * which nobody types, so it never matches a query; `issueAwareFilter` reads
 * it back.
 */
const TIER_TOKEN = "\u0000tier:";
const IDENTIFIER = /^[a-z]{1,10}-\d+$/i;

export function issueTierKeyword(status: string | null | undefined): string {
  return `${TIER_TOKEN}${issueSearchTier(status)}`;
}

/**
 * The cmdk filter of issue pickers. Items without a tier token score exactly
 * like cmdk's default filter. Issue items keep cmdk's relevance inside their
 * tier and are lifted by tier, and an exact match (score 1: the identifier
 * typed in full) outranks every tier. Returns 0 — hidden — whenever cmdk's
 * own filter would.
 */
export function issueAwareFilter(
  defaultFilter: (value: string, search: string, keywords?: string[]) => number,
): (value: string, search: string, keywords?: string[]) => number {
  return (value, search, keywords) => {
    const tierKeyword = keywords?.find((keyword) => keyword.startsWith(TIER_TOKEN));
    const visible = tierKeyword ? keywords!.filter((keyword) => keyword !== tierKeyword) : keywords;
    const base = defaultFilter(value, search, visible);
    if (!tierKeyword || base <= 0) return base;
    const tier = Number(tierKeyword.slice(TIER_TOKEN.length));
    // Only an identifier typed in full jumps the tiers; an exact title does not.
    const exact = visible?.some((keyword) => IDENTIFIER.test(keyword) && isExactIssueQuery(search, keyword)) ?? false;
    // Relevance stays within (0, 1]; each tier step weighs more than any relevance.
    return (exact ? 10 : 0) + (2 - (Number.isFinite(tier) ? tier : 1)) * 2 + base;
  };
}
