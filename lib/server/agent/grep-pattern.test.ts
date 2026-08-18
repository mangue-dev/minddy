import { describe, expect, it } from "vitest";
import {
  isInvalidRegexError,
  looksLikeIntendedAlternation,
  LITERAL_RETRY_NOTE,
  REGEX_RETRY_NOTE,
} from "./grep-pattern";

/**
 * MIN-109: the only 3 `grep` failures measured in 60 days are the SAME thing —
 * a piece of JSX stuck as a pattern. The detection must therefore catch the refusal of
 * pattern, and NOTHING else: an invalid option or a broken pathspec restarted in
 * `-F` would fail the same, having lied to the model in passing.
 *
 * The stderrs below are not invented: they are those of `git grep` and de
 * `grep`, recorded in production (the sandbox runs under glibc) or reproduced by
 * launching the commands. Messages CHANGE from one platform to another — same
 * pattern, “Unmatched \{” under glibc and “braces not balanced” under BSD — hence
 * detection on the git structural prefix rather than on the phrase.
 */

describe("isInvalidRegexError", () => {
  it("attrape le message EXACT relevé en production", () => {
    expect(isInvalidRegexError(`fatal: -e option, 'onUpdateIssue={': Unmatched \\{`)).toBe(true);
  });

  it("attrape TOUT refus de motif de git grep, quel que soit le moteur de regex", () => {
    const stderrs = [
      // glibc (what the sandbox runs).
      `fatal: -e option, 'foo(bar': Unmatched ( or \\(`,
      `fatal: -e option, 'items[0': Unmatched [, [^, [:, [., or [=`,
      // BSD — same patterns, other sentences: detection should not depend on them.
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
    // The model thinks it has searched for a regex: without this sentence, it reads
    // results that don't match what he asked for.
    expect(LITERAL_RETRY_NOTE).toMatch(/literal/i);
    expect(LITERAL_RETRY_NOTE).toMatch(/not a valid POSIX regex/i);
  });
});

/**
 * MIN-238 — the mirror of MIN-109, and it cost an entire blueprint.
 *
 * The patterns below are from the run that wrote the blueprint for MIN-225: fifteen
 * `grep` in `fixed_strings` on lists of symbols separated by `|`, fifteen
 * “(no matches)” on code present in both places, and a plan built on
 * the absence of `claimRun`, `requeueStuckRuns` and `planProviderStall`.
 */
describe("looksLikeIntendedAlternation", () => {
  it("reconnaît les motifs EXACTS qui ont menti dans le run de MIN-225", () => {
    const patterns = [
      "claimRun|requeueStuckRuns",
      "drainAgentRuns|claimRun|requeueStuckRuns",
      "drainAgentRuns|claimRun|requeueStuckRuns|hasDueAgentWork|reapIdleSandboxes",
      "hasDueAgentWork|drainAgentRuns|executeAgentRun",
      // Spaces IN an alternative do not interfere: what matters is that the
      // bar is stuck. This is the 13th of the run.
      "export async function drainAgentRuns|drainAgentRuns",
    ];
    for (const p of patterns) expect(looksLikeIntendedAlternation(p)).toBe(true);
  });

  it("laisse tranquille ce qu'on cherche VRAIMENT au pied de la lettre", () => {
    const patterns = [
      "useState(", // pas de barre du tout
      "a || b", // empty alternative in the middle → an OR of code, not an alternation
      "| --- |", // ligne de tableau markdown : alternatives vides aux deux bouts
      "cmd | grep foo", // tube shell: bar bordered by spaces
      "value |> pipe", // idem
      "a\\|b", // escaped bar = desired bar
      "|leading", // empty alternative at the head
      "trailing|", // and in tail
    ];
    for (const p of patterns) expect(looksLikeIntendedAlternation(p)).toBe(false);
  });
});

describe("REGEX_RETRY_NOTE", () => {
  it("dit que les alternatives n'avaient jamais été cherchées", () => {
    // Without that, the model reads the results of the RAISING as those of its
    // asks — and does not learn that `fixed_strings` is not doing what it thinks.
    expect(REGEX_RETRY_NOTE).toMatch(/regex/i);
    expect(REGEX_RETRY_NOTE).toMatch(/never searched/i);
  });
});
