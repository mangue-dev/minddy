import { describe, expect, it } from "vitest";
import {
  isInvalidRegexError,
  looksLikeIntendedAlternation,
  LITERAL_RETRY_NOTE,
  REGEX_RETRY_NOTE,
} from "./grep-pattern";

/**
 * MIN-109 : les 3 seuls échecs de `grep` mesurés en 60 jours sont la MÊME chose —
 * un bout de JSX collé comme motif. La détection doit donc attraper le refus de
 * motif, et RIEN d'autre : une option invalide ou un pathspec cassé relancé en
 * `-F` échouerait pareil, en ayant menti au modèle au passage.
 *
 * Les stderr ci-dessous ne sont pas inventés : ce sont ceux de `git grep` et de
 * `grep`, relevés en production (la sandbox tourne sous glibc) ou reproduits en
 * lançant les commandes. Les messages CHANGENT d'une plateforme à l'autre — même
 * motif, « Unmatched \{ » sous glibc et « braces not balanced » sous BSD — d'où
 * la détection sur le préfixe structurel de git plutôt que sur la phrase.
 */

describe("isInvalidRegexError", () => {
  it("attrape le message EXACT relevé en production", () => {
    expect(isInvalidRegexError(`fatal: -e option, 'onUpdateIssue={': Unmatched \\{`)).toBe(true);
  });

  it("attrape TOUT refus de motif de git grep, quel que soit le moteur de regex", () => {
    const stderrs = [
      // glibc (ce que fait tourner la sandbox).
      `fatal: -e option, 'foo(bar': Unmatched ( or \\(`,
      `fatal: -e option, 'items[0': Unmatched [, [^, [:, [., or [=`,
      // BSD — mêmes motifs, autres phrases : la détection ne doit pas en dépendre.
      `fatal: -e option, 'useState(': parentheses not balanced`,
      `fatal: -e option, 'items[0': brackets ([ ]) not balanced`,
      `fatal: -e option, 'a{2': braces not balanced`,
      `fatal: -e option, 'x\\': trailing backslash (\\)`,
      `fatal: -e option, '*foo': repetition-operator operand invalid`,
      `fatal: -e option, '[z-a]': invalid character range`,
      `fatal: -e option, '[[:bogus:]]': invalid character class`,
      `fatal: -e option, 'a{3,1}': invalid repetition count(s)`,
      `fatal: -e option, 'a{99999999999}': maximum repetition exceeds 255`,
    ];
    for (const stderr of stderrs) expect(isInvalidRegexError(stderr)).toBe(true);
  });

  it("attrape les refus du grep SYSTÈME, qui n'a pas le préfixe de git", () => {
    const stderrs = [
      "grep: Unmatched ( or \\(",
      "grep: Unmatched \\{",
      "grep: Invalid regular expression",
      "grep: Invalid preceding regular expression",
      "grep: Invalid back reference",
      "grep: Invalid character class",
      "grep: Invalid range end",
      "grep: Trailing backslash",
      "grep: brackets ([ ]) not balanced",
    ];
    for (const stderr of stderrs) expect(isInvalidRegexError(stderr)).toBe(true);
  });

  it("ne retente PAS sur ce qui n'est pas un problème de motif", () => {
    const stderrs = [
      "error: unknown option `nope'",
      "fatal: bad flag '-Z' used after filename",
      "fatal: pathspec ':(glob)src/**' did not match any files",
      "fatal: not a git repository (or any of the parent directories): .git",
      "grep: /vercel/sandbox/tool-output/run-3.txt: No such file or directory",
      "grep: greptest: Is a directory",
      "",
    ];
    for (const stderr of stderrs) expect(isInvalidRegexError(stderr)).toBe(false);
  });
});

describe("LITERAL_RETRY_NOTE", () => {
  it("dit au modèle que SON motif a été relu comme du texte", () => {
    // Le modèle croit avoir cherché une regex : sans cette phrase, il lit des
    // résultats qui ne correspondent pas à ce qu'il a demandé.
    expect(LITERAL_RETRY_NOTE).toMatch(/literal/i);
    expect(LITERAL_RETRY_NOTE).toMatch(/not a valid POSIX regex/i);
  });
});

/**
 * MIN-238 — le miroir de MIN-109, et il a coûté un plan entier.
 *
 * Les motifs ci-dessous sont ceux du run qui a écrit le plan de MIN-225 : quinze
 * `grep` en `fixed_strings` sur des listes de symboles séparées par `|`, quinze
 * « (no matches) » sur du code présent aux deux endroits, et un plan bâti sur
 * l'absence de `claimRun`, `requeueStuckRuns` et `planProviderStall`.
 */
describe("looksLikeIntendedAlternation", () => {
  it("reconnaît les motifs EXACTS qui ont menti dans le run de MIN-225", () => {
    const patterns = [
      "claimRun|requeueStuckRuns",
      "drainAgentRuns|claimRun|requeueStuckRuns",
      "drainAgentRuns|claimRun|requeueStuckRuns|hasDueAgentWork|reapIdleSandboxes",
      "hasDueAgentWork|drainAgentRuns|executeAgentRun",
      // Des espaces DANS une alternative ne gênent pas : ce qui compte est que la
      // barre soit collée. Celui-ci est le 13e du run.
      "export async function drainAgentRuns|drainAgentRuns",
    ];
    for (const p of patterns) expect(looksLikeIntendedAlternation(p)).toBe(true);
  });

  it("laisse tranquille ce qu'on cherche VRAIMENT au pied de la lettre", () => {
    const patterns = [
      "useState(", // pas de barre du tout
      "a || b", // alternative vide au milieu → un OU de code, pas une alternation
      "| --- |", // ligne de tableau markdown : alternatives vides aux deux bouts
      "cmd | grep foo", // tube shell : barre bordée d'espaces
      "value |> pipe", // idem
      "a\\|b", // barre échappée = barre voulue
      "|leading", // alternative vide en tête
      "trailing|", // et en queue
    ];
    for (const p of patterns) expect(looksLikeIntendedAlternation(p)).toBe(false);
  });
});

describe("REGEX_RETRY_NOTE", () => {
  it("dit que les alternatives n'avaient jamais été cherchées", () => {
    // Sans ça, le modèle lit les résultats de la RELANCE comme ceux de sa
    // demande — et n'apprend pas que `fixed_strings` ne fait pas ce qu'il croit.
    expect(REGEX_RETRY_NOTE).toMatch(/regex/i);
    expect(REGEX_RETRY_NOTE).toMatch(/never searched/i);
  });
});
