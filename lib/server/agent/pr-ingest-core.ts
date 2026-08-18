/**
 * Attachment of a pull request to a minddy ticket (MIN-143) — pure, without I/O
 * nor `server-only`, therefore testable in node (same pattern as `checks-core.ts`).
 *
 * Since the page shows ALL the PRs of the repository and no longer only those of
 * Numo, the PR ↔ ticket link can no longer come from the run: a human PR does not have
 *. So it comes from what the PR SAYS about itself — and by CONVENTION, never
 * by guess: `<KEY>-<n>` in the branch name, in the title, or in a
 * closing line (`Fixes MIN-42`) of the body. Nothing else. An unattached PR remains unattached: this is a normal state, not a failure.
 *
 * The candidate keys are those of the projects that bind THIS repository — this is what
 * prevents `ACME-42` from bringing back ticket 42 of a project that has not nothing to see.
 */

/** Closing keywords recognized in the body (those of GitHub/GitLab). */
const CLOSING_KEYWORDS =
  "close|closes|closed|closing|fix|fixes|fixed|fixing|resolve|resolves|resolved|resolving";

/** Escapes a project key before interpolation into a regex. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reason for a ticket reference for these keys.
 *
 * The two edge guards do all the anti-false-positive work:
 * - `(?<![A-Za-z0-9])` — `ADMIN-42` does not contain a `MIN-42` reference ;
 * - `(?![A-Za-z0-9])` — `MIN-421` is not `MIN-42`, and `MIN-42x` is nothing.
 * A `-` or a `/` around, on the other hand, passes: this is exactly the form of the
 * branches (`minddy/agent/min-42-quelque-chose`, `feature/MIN-42`).
 */
function referencePattern(projectKeys: readonly string[]): RegExp | null {
  const keys = [...new Set(projectKeys.map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return null;
  const alternation = keys.map(escapeRegExp).join("|");
  return new RegExp(`(?<![A-Za-z0-9])(${alternation})-(\\d+)(?![A-Za-z0-9])`, "gi");
}

/** First reference found in `text`, normalized to `KEY-n` (key in original case). */
function firstReference(
  text: string | null | undefined,
  pattern: RegExp,
  keyByLower: Map<string, string>,
): string | null {
  if (!text) return null;
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match) return null;
  const key = keyByLower.get(match[1].toLowerCase());
  if (!key) return null;
  // `007` is a strangely written number, not another ticket: we standardize it.
  const number = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return `${key}-${number}`;
}

/** Lignes du corps qui FERMENT un ticket (`Fixes MIN-42`, `Closes: MIN-42`). */
function closingLines(body: string | null | undefined): string {
  if (!body) return "";
  const keyword = new RegExp(`^\\s*(?:${CLOSING_KEYWORDS})\\b`, "i");
  return body
    .split(/\r?\n/)
    .filter((line) => keyword.test(line))
    .join("\n");
}

export interface IssueRefInput {
  /** Keys to projects that link to this repository — the scope of valid references. */
  projectKeys: readonly string[];
  branch?: string | null;
  title?: string | null;
  body?: string | null;
}

/**
 * Identifier of the ticket that this PR declares to carry (`"MIN-42"`), or null.
 *
 * The order is that of decreasing intention: the BRANCH first (we name it on purpose, this is the convention that minddy himself applies), then the
 * TITLE, then the body closing lines alone. The rest of the body is
 * intentionally ignored — "as in MIN-12" is a mention, not a
 * attachment.
 */
export function issueRefFromPr(input: IssueRefInput): string | null {
  const pattern = referencePattern(input.projectKeys);
  if (!pattern) return null;
  const keyByLower = new Map(
    input.projectKeys.filter(Boolean).map((k) => [k.trim().toLowerCase(), k.trim()]),
  );
  return (
    firstReference(input.branch, pattern, keyByLower) ??
    firstReference(input.title, pattern, keyByLower) ??
    firstReference(closingLines(input.body), pattern, keyByLower)
  );
}

/**
 * Number of a HAND DESIGNATED pull request, or null (MIN-163bis).
 *
 * The conventional binding above reads what the PR says about itself;
 * this one reads what a HUMAN (or the agent listening to it) says about it: "bind the PR
 * #42 to ticket MIN-12", or the URL he copied from his browser. The
 * four forms that we really encounter, and not one more:
 *
 * - `42`, and the bare number that a model sometimes returns in JSON;
 * - `#42` (GitHub) and `!42` (GitLab's MR syntax);
 * - a forge URL — `…/pull/42`, `…/pulls/42`, `…/-/merge_requests/42`,
 * with the following (`/files`, `#discussion_r…`) which changes nothing.
 *
 * What is denied counts as much: an ISSUE URL (`…/issues/42`) is not
 * a PR, and taking it as such would silently attach the wrong
 * thing — both numberings coexist in the same GitHub repository.
 */
export function parsePullRequestRef(
  ref: string | number | null | undefined,
): number | null {
  const asNumber = (value: number): number | null =>
    Number.isSafeInteger(value) && value > 0 ? value : null;

  if (typeof ref === "number") return asNumber(ref);
  if (typeof ref !== "string") return null;
  const text = ref.trim();
  if (!text) return null;

  // The URL first: it CONTAINS a bare number, and the short pattern would take it.
  const url = /\/(?:pull|pulls|merge_requests)\/(\d+)(?:[/?#]|$)/.exec(text);
  if (url) return asNumber(Number.parseInt(url[1], 10));
  if (/^https?:\/\//i.test(text)) return null;

  const short = /^[#!]?(\d+)$/.exec(text);
  return short ? asNumber(Number.parseInt(short[1], 10)) : null;
}

/** `"MIN-42"` → `{ key: "MIN", number: 42 }`. Null if the form is not there. */
export function parseIssueRef(ref: string): { key: string; number: number } | null {
  const at = ref.lastIndexOf("-");
  if (at <= 0) return null;
  const number = Number.parseInt(ref.slice(at + 1), 10);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { key: ref.slice(0, at), number };
}
