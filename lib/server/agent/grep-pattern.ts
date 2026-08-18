/**
 * Literal fallback of agent tool `grep` (MIN-109). PURE logic (no shell),
 * separated from sandbox.ts to be testable.
 *
 * FINDING: the only `grep` failures measured on `agent_run_events` are all the
 * same thing — the model is looking for a LITERAL string of code (`onUpdateIssue={`,
 * `useState(`, `items[0]`) and `git grep -E` reads it as an extended regex, so
 * `fatal: -e option, 'onUpdateIssue={': Unmatched \{`. The model does not KNOW that it
 * wrote an invalid regex: it thinks it is looking for text. A parameter changes
 * nothing — you have to try `-F` again in its place.
 */

/** Note prefixed to the output when the pattern has been rerun as a literal. */
export const LITERAL_RETRY_NOTE =
  "(pattern retried as a literal string — it was not a valid POSIX regex)";

/**
 * Note when the pattern was restarted in REGEX, `fixed_strings` having searched for the
 * vertical bar at the foot of the letter (MIN-238).
 */
export const REGEX_RETRY_NOTE =
  "(pattern retried as a regex — 'fixed_strings' had matched the '|' literally, so the alternatives were never searched. These are the regex results.)";

/**
 * Is the pattern an ALTERNATION that `fixed_strings` took at face value?
 *
 * The exact twin of `isInvalidRegexError`, and it comes from the same place: the
 * pattern doesn't KNOW what mode it's searching in. There, he followed the description of the
 * tool — which listed `|` among the characters justifying `fixed_strings` — and asked for `claimRun|requeueStuckRuns` literally. `git grep -F` searched for these
 * twenty-four characters in a row, found nothing, and responded "(no
 * matches)": a verified fact, on code that existed in both places.
 * Fifteen calls of this form in the run that wrote the plan for MIN-225,
 * fifteen false negatives, zero true — and a plan built on the absence of symbols
 * very present.
 *
 * STRICT, because a regex rerun on a pattern that we really wanted
 * literal would render something other than what was asked. Three conditions, which
 * together only allow the intention to alternate:
 *
 * - an unescaped bar (`\|` is an intended pipe);
 * - no empty alternative — which excludes `a || b` and the line of array
 * markdown `| --- |`, the split of which makes empty ends;
 * - no bar bordered by space — which excludes the shell pipe `cmd | grep`,
 * where a list of symbols is always written pasted.
 */
export function looksLikeIntendedAlternation(pattern: string): boolean {
  if (!pattern.includes("|")) return false;
  if (/\\\|/.test(pattern)) return false;
  if (/\s\||\|\s/.test(pattern)) return false;
  return pattern.split("|").every((part) => part.length > 0);
}

/**
 * Response when `path`/`glob` have selected NO files (MIN-226).
 *
 * It definitely doesn't say "no match": the search didn't read anything,
 * so it doesn't know anything about the code. The word counts more than the mechanism — it is
 * this sentence that the model rereads in its context when concluding,
 * and “no matches” authorized it to conclude on code never opened.
 */
export const NO_FILES_IN_SCOPE_NOTE =
  "(no file matched the 'path'/'glob' filter — nothing was searched, so this says NOTHING about whether the pattern exists. Re-run without the filter, or check it: 'path' is a DIRECTORY, and to search a single file you pass it as 'path' and leave 'glob' empty.)";

/**
 * Does stderr say “your PATTERN is not a valid regex”?
 *
 * Deliberately STRICT: we only retry a rejected pattern, never an invalid option
 *, a broken pathspec or an absent file — those also come out en
 * code ≥ 2, and restarting them in `-F` would fail the same after lying to the model.
 *
 * The RELIABLE signal on the `git grep` side is structural, not lexical: git prefix
 * `fatal: -e option, '<motif>':` AT EACH reason refusal, whatever the regex engine
 * behind it (the messages change from one platform to another —
 * “Unmatched \{” under glibc, “braces not balanced” under BSD). Other
 * git errors never have this prefix. The following list of sentences only serves
 * therefore only for grep SYSTEM (search in the outputs of tools deposited, MIN-107),
 * which announces nothing of the sort.
 */
export function isInvalidRegexError(stderr: string): boolean {
  if (/^fatal: -e option, /m.test(stderr)) return true;
  return REGCOMP_ERRORS.some((re) => re.test(stderr));
}

/** Regcomp messages relayed by the system grep (GNU, then BSD). */
const REGCOMP_ERRORS = [
  // GNU : « Unmatched ( or \( », « Unmatched \{ », « Unmatched [, [^, [:, [., or [= »
  /\bUnmatched\b/i,
  // GNU : « Invalid regular expression », « Invalid preceding regular expression »,
  // « Invalid back reference », « Invalid character class », « Invalid range end »
  /\bInvalid (?:preceding )?regular expression\b/i,
  /\bInvalid back reference\b/i,
  /\bInvalid character (?:class|range)\b/i,
  /\bInvalid range end\b/i,
  /\bInvalid content of \\\{\\\}/i,
  // BSD : « parentheses not balanced », « braces not balanced »,
  // « brackets ([ ]) not balanced »
  /\b(?:parentheses|braces|brackets)[^\n]*not balanced\b/i,
  // Communs : « repetition-operator operand invalid », « invalid repetition count(s) »,
  // « maximum repetition exceeds 255 », « Trailing backslash »
  /\brepetition[- ]operator operand invalid\b/i,
  /\binvalid repetition count/i,
  /\bmaximum repetition exceeds\b/i,
  /\bTrailing backslash\b/i,
];
