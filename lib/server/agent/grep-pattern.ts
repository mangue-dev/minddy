/**
 * Repli littéral du tool `grep` de l'agent (MIN-109). Logique PURE (aucun shell),
 * séparée de sandbox.ts pour être testable.
 *
 * CONSTAT : les seuls échecs de `grep` mesurés sur `agent_run_events` sont tous la
 * même chose — le modèle cherche une chaîne LITTÉRALE de code (`onUpdateIssue={`,
 * `useState(`, `items[0]`) et `git grep -E` la lit comme une regex étendue, donc
 * `fatal: -e option, 'onUpdateIssue={': Unmatched \{`. Le modèle ne SAIT pas qu'il
 * a écrit une regex invalide : il croit chercher du texte. Un paramètre n'y change
 * rien — il faut retenter en `-F` à sa place.
 */

/** Note préfixée à la sortie quand le motif a été relancé en littéral. */
export const LITERAL_RETRY_NOTE =
  "(pattern retried as a literal string — it was not a valid POSIX regex)";

/**
 * Réponse quand `path`/`glob` n'ont sélectionné AUCUN fichier (MIN-226).
 *
 * Elle ne dit surtout pas « aucune correspondance » : la recherche n'a rien lu,
 * donc elle ne sait rien du code. Le mot compte plus que le mécanisme — c'est
 * cette phrase-là que le modèle relit dans son contexte au moment de conclure,
 * et « no matches » l'autorisait à conclure sur du code jamais ouvert.
 */
export const NO_FILES_IN_SCOPE_NOTE =
  "(no file matched the 'path'/'glob' filter — nothing was searched, so this says NOTHING about whether the pattern exists. Re-run without the filter, or check it: 'path' is a DIRECTORY, and to search a single file you pass it as 'path' and leave 'glob' empty.)";

/**
 * Le stderr dit-il « ton MOTIF n'est pas une regex valide » ?
 *
 * Volontairement STRICT : on ne retente qu'un motif refusé, jamais une option
 * invalide, un pathspec cassé ou un fichier absent — ceux-là sortent aussi en
 * code ≥ 2, et les relancer en `-F` échouerait pareil après avoir menti au modèle.
 *
 * Le signal FIABLE côté `git grep` est structurel, pas lexical : git préfixe
 * `fatal: -e option, '<motif>':` À CHAQUE refus de motif, quel que soit le moteur
 * de regex derrière (les messages, eux, changent d'une plateforme à l'autre —
 * « Unmatched \{ » sous glibc, « braces not balanced » sous BSD). Les autres
 * erreurs de git n'ont jamais ce préfixe. La liste de phrases qui suit ne sert
 * donc qu'au grep SYSTÈME (recherche dans les sorties de tools déposées, MIN-107),
 * qui n'annonce rien de tel.
 */
export function isInvalidRegexError(stderr: string): boolean {
  if (/^fatal: -e option, /m.test(stderr)) return true;
  return REGCOMP_ERRORS.some((re) => re.test(stderr));
}

/** Messages de regcomp relayés par le grep système (GNU, puis BSD). */
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
