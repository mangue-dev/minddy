import { createTwoFilesPatch, diffLines } from "diff";

/**
 * Code Agent String Replacement Editing Engine (MIN-46) — the
 * heart of the “real editor”. Ported from the opencode `edit` tool
 * (https://github.com/sst/opencode, MIT), itself derived from the approaches of
 * Cline and gemini-cli. We keep the logic PURE (no I/O, no Effect/LSP/
 * permission): `replace()` applies robust substitution, `applyEdit()`
 * returns the new content + a unified diff.
 *
 * Principle: the model provides `oldString` (the exact text to replace) and
 * `newString`. An exact replacement fails as soon as the model drifts from a space,
 * an indentation, escape or end of line — common on
 * eco models. We therefore attempt a CASCADE of matching strategies, from the most
 * strict to the most tolerant, until one locates the block. Failure
 * reste BRUYANT (throw) : jamais de corruption silencieuse.
 */

/**
 * Why a substitution was refused. The message remains that which the agent
 * of code reads forever (`execute.ts` only knows `.message`); This
 * `reason` is added next to it for callers who need to REWRITE the message —
 * the MCP tool `minddy_edit_issue_text` edits a ticket plan, not a file,
 * and has neither “the file” nor `write_file` to offer (MIN-186).
 */
export type ReplaceFailure =
  | "identical"
  | "empty_old"
  | "disproportionate"
  | "not_found"
  | "ambiguous";

/**
 * What the cascade did to achieve this result (MIN-246). We don't referee it
 * not, we MEASURE it: which place to resolve, at what rank of the cascade, with
 * what similarity when it calculates one, and how many candidates were
 * discarded along the way. `exec-tool` aggregates it by calling tool and `agent-loop`
 * persists in the `tool_result` event — it NEVER leaves the model.
 *
 * On a failure, she travels to `ReplaceError`: it is the only place where
 * we know that a `not_found` saw twelve candidates pass or none.
 */
export interface ReplaceTrace {
  /** Name of the replacer who resolved (absent: none resolved). */
  replacer?: string;
  /** Rank 1-based in the cascade (1 = exact match). */
  rank?: number;
  /** Similarity of the retained block, when replacing it calculates one (anchoring). */
  similarity?: number;
  /** Candidates examined, all replacers combined. */
  candidates: number;
  /** Candidates rejected because their scope was disproportionate. */
  rejectedDisproportionate: number;
  /** Candidates excluded because they appeared several times. */
  rejectedAmbiguous: number;
}

function emptyTrace(): ReplaceTrace {
  return { candidates: 0, rejectedDisproportionate: 0, rejectedAmbiguous: 0 };
}

export class ReplaceError extends Error {
  readonly reason: ReplaceFailure;
  /** What the waterfall had seen when giving up (MIN-246). */
  readonly trace: ReplaceTrace;
  constructor(reason: ReplaceFailure, message: string, trace: ReplaceTrace = emptyTrace()) {
    super(message);
    this.name = "ReplaceError";
    this.reason = reason;
    this.trace = trace;
  }
}

// ── Fins de ligne ────────────────────────────────────────────────────────────

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function detectLineEnding(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function convertToLineEnding(text: string, ending: "\n" | "\r\n"): string {
  if (ending === "\n") return text;
  return text.replaceAll("\n", "\r\n");
}

// ── Similarity ─────────────────────────────── ────────────────────────────────

/** Similarity threshold (0..1) of internal lines to accept an anchored block. */
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.65;
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.65;

/** Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length);
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

// ── Replacers (cascade) ──────────────────────────────────────────────────────
// Each replacer is a generator that yields CANDIDATES substrings of the
// content (potential matches of `find`). `replace()` tries them in order.

/**
 * A candidate. The long form is used for replacers which CALCULATE a similarity
 * to decide (block anchoring): it takes it back to the trace, where
 * it is the only measure that tells how far the model had drifted.
 */
type Candidate = string | { text: string; similarity: number };

type Replacer = (content: string, find: string) => Generator<Candidate, void, unknown>;

/** 1. Match exact. */
const SimpleReplacer: Replacer = function* (_content, find) {
  yield find;
};

/** 2. Match line for line ignoring leading/trailing spaces. */
const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines[searchLines.length - 1] === "") searchLines.pop();

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    let matchStartIndex = 0;
    for (let k = 0; k < i; k++) matchStartIndex += originalLines[k].length + 1;
    let matchEndIndex = matchStartIndex;
    for (let k = 0; k < searchLines.length; k++) {
      matchEndIndex += originalLines[i + k].length;
      if (k < searchLines.length - 1) matchEndIndex += 1;
    }
    yield content.substring(matchStartIndex, matchEndIndex);
  }
};

/** 3. First/last line anchors + Levenshtein similarity on the middle. */
const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines.length < 3) return;
  if (searchLines[searchLines.length - 1] === "") searchLines.pop();

  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();
  const searchBlockSize = searchLines.length;
  const maxLineDelta = Math.max(1, Math.floor(searchBlockSize * 0.25));

  const candidates: Array<{ startLine: number; endLine: number }> = [];
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) continue;
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        const actualBlockSize = j - i + 1;
        if (Math.abs(actualBlockSize - searchBlockSize) <= maxLineDelta) {
          candidates.push({ startLine: i, endLine: j });
        }
        break;
      }
    }
  }
  if (candidates.length === 0) return;

  const spanOf = (startLine: number, endLine: number): string => {
    let matchStartIndex = 0;
    for (let k = 0; k < startLine; k++) matchStartIndex += originalLines[k].length + 1;
    let matchEndIndex = matchStartIndex;
    for (let k = startLine; k <= endLine; k++) {
      matchEndIndex += originalLines[k].length;
      if (k < endLine) matchEndIndex += 1;
    }
    return content.substring(matchStartIndex, matchEndIndex);
  };

  if (candidates.length === 1) {
    const { startLine, endLine } = candidates[0];
    const actualBlockSize = endLine - startLine + 1;
    let similarity = 0;
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2);
    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim();
        const searchLine = searchLines[j].trim();
        const maxLen = Math.max(originalLine.length, searchLine.length);
        if (maxLen === 0) continue;
        // The accumulation only increases: exit as soon as the threshold is reached (which
        // did the original code) gave the same DECISION but a number
        // truncated. Since MIN-246 the similarity is measured, so we calculate it
        // in full — the additional cost is bounded by the size of the block.
        similarity += (1 - levenshtein(originalLine, searchLine) / maxLen) / linesToCheck;
      }
    } else {
      similarity = 1.0;
    }
    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      yield { text: spanOf(startLine, endLine), similarity };
    }
    return;
  }

  let bestMatch: { startLine: number; endLine: number } | null = null;
  let maxSimilarity = -1;
  for (const candidate of candidates) {
    const { startLine, endLine } = candidate;
    const actualBlockSize = endLine - startLine + 1;
    let similarity = 0;
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2);
    if (linesToCheck > 0) {
      for (let j = 1; j < searchBlockSize - 1 && j < actualBlockSize - 1; j++) {
        const originalLine = originalLines[startLine + j].trim();
        const searchLine = searchLines[j].trim();
        const maxLen = Math.max(originalLine.length, searchLine.length);
        if (maxLen === 0) continue;
        similarity += 1 - levenshtein(originalLine, searchLine) / maxLen;
      }
      similarity /= linesToCheck;
    } else {
      similarity = 1.0;
    }
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = candidate;
    }
  }
  if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
    yield { text: spanOf(bestMatch.startLine, bestMatch.endLine), similarity: maxSimilarity };
  }
};

/** 4. Match en collapsant tout run d'espaces en un seul. */
const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();
  const normalizedFind = normalizeWhitespace(find);

  const lines = content.split("\n");
  for (const line of lines) {
    if (normalizeWhitespace(line) === normalizedFind) {
      yield line;
    } else if (normalizeWhitespace(line).includes(normalizedFind)) {
      const words = find.trim().split(/\s+/);
      if (words.length > 0) {
        const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
        try {
          const match = line.match(new RegExp(pattern));
          if (match) yield match[0];
        } catch {
          // regex invalide → on ignore
        }
      }
    }
  }

  const findLines = find.split("\n");
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length);
      if (normalizeWhitespace(block.join("\n")) === normalizedFind) yield block.join("\n");
    }
  }
};

/** 5. Match by removing the common indentation on both sides. */
const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndentation = (text: string) => {
    const lines = text.split("\n");
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length === 0) return text;
    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => line.match(/^(\s*)/)?.[1].length ?? 0),
    );
    return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join("\n");
  };

  const normalizedFind = removeIndentation(find);
  const contentLines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n");
    if (removeIndentation(block) === normalizedFind) yield block;
  }
};

/** 6. Match after un-escape of `\n`/`\t`/`\"`… (over-escape models). */
const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapeString = (str: string): string =>
    str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, ch) => {
      switch (ch) {
        case "n":
          return "\n";
        case "t":
          return "\t";
        case "r":
          return "\r";
        case "'":
          return "'";
        case '"':
          return '"';
        case "`":
          return "`";
        case "\\":
          return "\\";
        case "\n":
          return "\n";
        case "$":
          return "$";
        default:
          return match;
      }
    });

  const unescapedFind = unescapeString(find);
  if (content.includes(unescapedFind)) yield unescapedFind;

  const lines = content.split("\n");
  const findLines = unescapedFind.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    if (unescapeString(block) === unescapedFind) yield block;
  }
};

/** 7. Match after globally trimming `find`. */
const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim();
  if (trimmedFind === find) return;
  if (content.includes(trimmedFind)) yield trimmedFind;

  const lines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    if (block.trim() === trimmedFind) yield block;
  }
};

/** 8. First/last-line anchors plus ≥50% identical middle lines. */
const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n");
  if (findLines.length < 3) return;
  if (findLines[findLines.length - 1] === "") findLines.pop();

  const contentLines = content.split("\n");
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j].trim() !== lastLine) continue;
      const blockLines = contentLines.slice(i, j + 1);
      if (blockLines.length === findLines.length) {
        let matchingLines = 0;
        let totalNonEmptyLines = 0;
        for (let k = 1; k < blockLines.length - 1; k++) {
          const blockLine = blockLines[k].trim();
          const findLine = findLines[k].trim();
          if (blockLine.length > 0 || findLine.length > 0) {
            totalNonEmptyLines++;
            if (blockLine === findLine) matchingLines++;
          }
        }
        if (totalNonEmptyLines === 0 || matchingLines / totalNonEmptyLines >= 0.5) {
          yield blockLines.join("\n");
          break;
        }
      }
      break;
    }
  }
};

/**
 * Normalisation unicode : replie tirets typographiques (U+2010–2015, U+2212),
 * smart quotes (U+2018–201B / U+201C–201F) and non-breaking/typographic spaces to
 * ASCII on BOTH sides (models often emit an em dash or smart quote where the file
 * has ASCII, or the reverse).
 */
const UnicodeNormalizedReplacer: Replacer = function* (content, find) {
  const fold = (s: string) =>
    s
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[\u2018-\u201B]/g, "'")
      .replace(/[\u201C-\u201F]/g, '"')
      .replace(/[\u00A0\u2002-\u200A\u202F]/g, " ");
  const foldedFind = fold(find);
  const lines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    if (fold(block) === foldedFind) yield block;
  }
};

/** 10. All exact occurrences (replaceAll support). */
const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  let startIndex = 0;
  for (;;) {
    const index = content.indexOf(find, startIndex);
    if (index === -1) break;
    yield find;
    startIndex = index + find.length;
  }
};

/**
 * The waterfall, NAMED (MIN-246): the rank alone says nothing to anyone reading a statement
 * six months later, and the order has already moved once (unicode inserted in 6ᵉ).
 * The names are those of the replacers, and they are the ones who land at base.
 */
const REPLACERS: Array<{ name: string; run: Replacer }> = [
  { name: "simple", run: SimpleReplacer },
  { name: "line_trimmed", run: LineTrimmedReplacer },
  { name: "block_anchor", run: BlockAnchorReplacer },
  { name: "whitespace_normalized", run: WhitespaceNormalizedReplacer },
  { name: "indentation_flexible", run: IndentationFlexibleReplacer },
  { name: "unicode_normalized", run: UnicodeNormalizedReplacer },
  { name: "escape_normalized", run: EscapeNormalizedReplacer },
  { name: "trimmed_boundary", run: TrimmedBoundaryReplacer },
  { name: "context_aware", run: ContextAwareReplacer },
  { name: "multi_occurrence", run: MultiOccurrenceReplacer },
];

/**
 * Refuses a match whose scope is disproportionate vs `oldString` (safeguard:
 * a tolerant replacer can otherwise capture a block much larger than desired).
 */
function isDisproportionateMatch(search: string, oldString: string): boolean {
  const oldLines = oldString.split("\n").length;
  const searchLines = search.split("\n").length;
  if (searchLines >= Math.max(oldLines + 3, oldLines * 2)) return true;
  if (oldLines === 1) return false;
  return search.trim().length > Math.max(oldString.trim().length + 500, oldString.trim().length * 4);
}

/**
 * Boundary newline realignment: tolerant replacers yield un
 * span WITHOUT the final `\n` of the last line. If this `\n` remains in the content
 * (just after the match) and `newString` is also wearing one, we would insert a
 * stray empty line. We absorb this `\n` from BOTH sides → exactly one jump of
 * line preserved (never duplicate, never merge lines).
 */
function realignBoundary(
  content: string,
  index: number,
  search: string,
  newString: string,
): { span: string; replacement: string } {
  if (!search.endsWith("\n") && content[index + search.length] === "\n") {
    return {
      span: `${search}\n`,
      replacement: newString.endsWith("\n") ? newString : `${newString}\n`,
    };
  }
  return { span: search, replacement: newString };
}

/**
 * Applies the substitution `oldString` → `newString` on `content` via the
 * cascade. Raised if not found, ambiguous (multiple matches without replaceAll), or
 * if the match is disproportionate. Returns the new content.
 *
 * `firstMatch` lifts the refusal of ambiguity and takes the FIRST match: reserved for
 * `apply_patch` (MIN-115), whose hunks are POSITIONAL and ordered — two
 * identical hunks designate two successive occurrences, and
 * [patch.ts](./patch.ts) only calls with this flag after advancing its
 * cursor past the previous hunk. On `edit_file`/`apply_edits`, where
 * `old_string` is supposed to be unique by itself, ambiguity remains a refusal.
 */
export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
  firstMatch = false,
): string {
  return replaceTraced(content, oldString, newString, replaceAll, firstMatch).content;
}

/**
 * `replace()` which ALSO renders what the waterfall did (MIN-246). It's the real one
 * function ; `replace()` is only the historical facade.
 */
export function replaceTraced(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
  firstMatch = false,
): { content: string; trace: ReplaceTrace } {
  const trace = emptyTrace();
  if (oldString === newString) {
    throw new ReplaceError(
      "identical",
      "No changes to apply: oldString and newString are identical.",
      trace,
    );
  }
  if (oldString === "") {
    throw new ReplaceError(
      "empty_old",
      "oldString cannot be empty when editing an existing file. Provide the exact text to replace, or use write_file for an intentional full-file replacement.",
      trace,
    );
  }

  const done = (next: string, name: string, rank: number, similarity?: number) => {
    trace.replacer = name;
    trace.rank = rank;
    if (similarity !== undefined) trace.similarity = similarity;
    return { content: next, trace };
  };

  let notFound = true;
  for (const [rank, replacer] of REPLACERS.entries()) {
    for (const candidate of replacer.run(content, oldString)) {
      const search = typeof candidate === "string" ? candidate : candidate.text;
      const similarity = typeof candidate === "string" ? undefined : candidate.similarity;
      const index = content.indexOf(search);
      if (index === -1) continue;
      notFound = false;
      trace.candidates++;
      if (isDisproportionateMatch(search, oldString)) {
        // We MOVE ON to the next candidate (MIN-246). Getting up here killed all the
        // cascade: a tolerant replacer which captures a block too large was
        // fail an edit that a lower replacer resolved cleanly — not
        // of corruption, but a burnt round. Failure remains noisy if no one
        // does not resolve: the refusal is returned at the end, with the same message.
        trace.rejectedDisproportionate++;
        continue;
      }
      if (replaceAll) {
        // Replaces EVERY literal occurrence of `search`, realigning `\n`
        // border at each (like the single-match path) — otherwise a
        // new_string ending with `\n` inserts a stray empty line after each block.
        let result = "";
        let pos = 0;
        for (;;) {
          const idx = content.indexOf(search, pos);
          if (idx === -1) break;
          const { span, replacement } = realignBoundary(content, idx, search, newString);
          result += content.slice(pos, idx) + replacement;
          pos = idx + span.length;
        }
        return done(result + content.slice(pos), replacer.name, rank + 1, similarity);
      }
      if (!firstMatch && index !== content.lastIndexOf(search)) {
        trace.rejectedAmbiguous++;
        continue; // ambigu → candidat suivant
      }
      const { span, replacement } = realignBoundary(content, index, search, newString);
      return done(
        content.substring(0, index) + replacement + content.substring(index + span.length),
        replacer.name,
        rank + 1,
        similarity,
      );
    }
  }

  if (notFound) {
    throw new ReplaceError(
      "not_found",
      "Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.",
      trace,
    );
  }
  // A candidate was found but none could be applied. The refusal
  // plus actionnable prime : « ton oldString ne couvre pas ce que tu vises »
  // before “your oldString is not unique”.
  if (trace.rejectedDisproportionate > 0) {
    throw new ReplaceError(
      "disproportionate",
      "Refusing replacement because the matched span is much larger than oldString. Re-read the file and provide the full exact oldString for the intended replacement.",
      trace,
    );
  }
  throw new ReplaceError(
    "ambiguous",
    "Found multiple matches for oldString. Provide more surrounding context to make the match unique.",
    trace,
  );
}

// ── Telemetry (MIN-246) ────────────────────────── ───────────────────────────

/** A substitution which was successful, as it starts at base. */
export interface EditTelemetryMatch {
  replacer: string;
  rank: number;
  similarity?: number;
  /** `apply_patch` only: rank of the anchoring attempt which passed. */
  attempt?: number;
  rejected_disproportionate?: number;
  rejected_ambiguous?: number;
}

/** A substitution refused: the reason, and what the waterfall had seen. */
export interface EditTelemetryFailure {
  reason: string;
  candidates: number;
  rejected_disproportionate?: number;
}

/**
 * What ONE call from an editing tool made go through the cascade. Aggregated by
 * `exec-tool`, persisted by `agent-loop` in the event payload
 * `tool_result` — never returned to the model. The run model can be read next to it, on
 * `agent_runs.model`: this is what gives “by model and by path”.
 */
export interface EditTelemetry {
  tool: "edit_file" | "apply_edits" | "apply_patch";
  matched: EditTelemetryMatch[];
  failed: EditTelemetryFailure[];
  /** `apply_patch`: the envelope itself was unreadable (FORMAT failure). */
  parse_error?: string;
  /** Present ONLY when the list has been completed: a statement which includes
   * Substitutions should not take a cap for a total. */
  matched_total?: number;
  failed_total?: number;
}

/** Entries kept per call — a batch of 40 files does not have to weigh in base. */
const TELEMETRY_CAP = 20;

/** Rounding: three decimal places are enough to compare a similarity to a threshold. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function telemetryMatch(trace: ReplaceTrace & { attempt?: number }): EditTelemetryMatch {
  return {
    replacer: trace.replacer ?? "unknown",
    rank: trace.rank ?? 0,
    ...(trace.similarity !== undefined ? { similarity: round3(trace.similarity) } : {}),
    ...(trace.attempt !== undefined ? { attempt: trace.attempt } : {}),
    ...(trace.rejectedDisproportionate > 0
      ? { rejected_disproportionate: trace.rejectedDisproportionate }
      : {}),
    ...(trace.rejectedAmbiguous > 0 ? { rejected_ambiguous: trace.rejectedAmbiguous } : {}),
  };
}

/**
 * Failure as it counts. `reason` comes from `ReplaceError` when it is
 * waterfall who refused; any other failure (missing file, unreadable hunk)
 * aggregates under a separate pattern — it is not the same measure.
 */
export function telemetryFailure(err: unknown): EditTelemetryFailure {
  if (err instanceof ReplaceError) {
    return {
      reason: err.reason,
      candidates: err.trace.candidates,
      ...(err.trace.rejectedDisproportionate > 0
        ? { rejected_disproportionate: err.trace.rejectedDisproportionate }
        : {}),
    };
  }
  return { reason: "other", candidates: 0 };
}

/** Cape lists a telemetry and returns it, or `undefined` if empty. */
export function sealTelemetry(t: EditTelemetry): EditTelemetry | undefined {
  if (t.matched.length === 0 && t.failed.length === 0 && !t.parse_error) return undefined;
  return {
    ...t,
    matched: t.matched.slice(0, TELEMETRY_CAP),
    failed: t.failed.slice(0, TELEMETRY_CAP),
    ...(t.matched.length > TELEMETRY_CAP ? { matched_total: t.matched.length } : {}),
    ...(t.failed.length > TELEMETRY_CAP ? { failed_total: t.failed.length } : {}),
  };
}

/** Removes common indentation from content lines of a diff (readability). */
export function trimDiff(diff: string): string {
  const isContent = (line: string) =>
    (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
    !line.startsWith("---") &&
    !line.startsWith("+++");

  const lines = diff.split("\n");
  const contentLines = lines.filter(isContent);
  if (contentLines.length === 0) return diff;

  let min = Infinity;
  for (const line of contentLines) {
    const content = line.slice(1);
    if (content.trim().length > 0) {
      const indent = content.match(/^(\s*)/)?.[1].length ?? 0;
      min = Math.min(min, indent);
    }
  }
  if (min === Infinity || min === 0) return diff;
  return lines.map((line) => (isContent(line) ? line[0] + line.slice(1).slice(min) : line)).join("\n");
}

export interface EditResult {
  /** Nouveau contenu complet du fichier. */
  content: string;
  /** Unified diff (common indentation removed), ready to display. */
  diff: string;
  additions: number;
  deletions: number;
  /** What the waterfall did to get there (MIN-246). */
  trace: ReplaceTrace;
}

/**
 * Unified diff between two contents, formatted like that of `applyEdit`. THE
 * paths that apply MULTIPLE substitutions in the same file
 * (`apply_edits`, `apply_patch`) en ont besoin sans repasser par `applyEdit` :
 * what is worth returning to the model is the diff of the file once all
 * the substitutions made, not a diff by substitution.
 */
export function diffFiles(path: string, before: string, after: string): string {
  return trimDiff(
    createTwoFilesPatch(path, path, normalizeLineEndings(before), normalizeLineEndings(after)),
  );
}

/** Lines added/deleted between two contents (neutralized line endings). */
export function countLineChanges(
  before: string,
  after: string,
): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const change of diffLines(normalizeLineEndings(before), normalizeLineEndings(after))) {
    if (change.added) additions += change.count || 0;
    if (change.removed) deletions += change.count || 0;
  }
  return { additions, deletions };
}

/**
 * Applies an edit and returns the new content + a counted unified diff.
 * Handles line endings from the original file (CRLF preserved). Get up like
 * `replace()` on failure.
 */
export function applyEdit(
  path: string,
  original: string,
  oldString: string,
  newString: string,
  replaceAll = false,
  firstMatch = false,
): EditResult {
  const ending = detectLineEnding(original);
  const old = convertToLineEnding(normalizeLineEndings(oldString), ending);
  const replacement = convertToLineEnding(normalizeLineEndings(newString), ending);
  const { content, trace } = replaceTraced(original, old, replacement, replaceAll, firstMatch);

  return { content, diff: diffFiles(path, original, content), trace, ...countLineChanges(original, content) };
}
