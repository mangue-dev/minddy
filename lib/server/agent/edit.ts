import { createTwoFilesPatch, diffLines } from "diff";

/**
 * Moteur d'édition par remplacement de chaîne de l'agent de code (MIN-46) — le
 * cœur du « vrai éditeur ». Porté depuis le `edit` tool d'opencode
 * (https://github.com/sst/opencode, MIT), lui-même dérivé des approches de
 * Cline et gemini-cli. On garde la logique PURE (aucune I/O, aucun Effect/LSP/
 * permission) : `replace()` applique une substitution robuste, `applyEdit()`
 * renvoie le nouveau contenu + un diff unifié.
 *
 * Principe : le modèle fournit `oldString` (le texte exact à remplacer) et
 * `newString`. Un remplacement exact échoue dès que le modèle dérive d'un espace,
 * d'une indentation, d'un échappement ou d'une fin de ligne — fréquent sur les
 * modèles éco. On tente donc une CASCADE de stratégies de matching, de la plus
 * stricte à la plus tolérante, jusqu'à ce que l'une localise le bloc. L'échec
 * reste BRUYANT (throw) : jamais de corruption silencieuse.
 */

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

// ── Similarité ───────────────────────────────────────────────────────────────

/** Seuil de similarité (0..1) des lignes internes pour accepter un bloc ancré. */
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.65;
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.65;

/** Distance de Levenshtein entre deux chaînes. */
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
// Chaque replacer est un générateur qui yield des sous-chaînes CANDIDATES du
// contenu (des matchs potentiels de `find`). `replace()` les essaie dans l'ordre.

type Replacer = (content: string, find: string) => Generator<string, void, unknown>;

/** 1. Match exact. */
const SimpleReplacer: Replacer = function* (_content, find) {
  yield find;
};

/** 2. Match ligne à ligne en ignorant les espaces de début/fin. */
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

/** 3. Ancres première/dernière ligne + similarité Levenshtein sur le milieu. */
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
        similarity += (1 - levenshtein(originalLine, searchLine) / maxLen) / linesToCheck;
        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) break;
      }
    } else {
      similarity = 1.0;
    }
    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) yield spanOf(startLine, endLine);
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
    yield spanOf(bestMatch.startLine, bestMatch.endLine);
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

/** 5. Match en retirant l'indentation commune des deux côtés. */
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

/** 6. Match après dés-échappement de `\n`/`\t`/`\"`… (modèles sur-échappent). */
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

/** 7. Match après trim global de `find`. */
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

/** 8. Ancres première/dernière ligne + ≥50 % des lignes du milieu identiques. */
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

/** 9. Toutes les occurrences exactes (support de replaceAll). */
const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  let startIndex = 0;
  for (;;) {
    const index = content.indexOf(find, startIndex);
    if (index === -1) break;
    yield find;
    startIndex = index + find.length;
  }
};

const REPLACERS: Replacer[] = [
  SimpleReplacer,
  LineTrimmedReplacer,
  BlockAnchorReplacer,
  WhitespaceNormalizedReplacer,
  IndentationFlexibleReplacer,
  EscapeNormalizedReplacer,
  TrimmedBoundaryReplacer,
  ContextAwareReplacer,
  MultiOccurrenceReplacer,
];

/**
 * Refuse un match dont l'étendue est disproportionnée vs `oldString` (garde-fou :
 * un replacer tolérant peut sinon capturer un bloc bien plus grand que voulu).
 */
function isDisproportionateMatch(search: string, oldString: string): boolean {
  const oldLines = oldString.split("\n").length;
  const searchLines = search.split("\n").length;
  if (searchLines >= Math.max(oldLines + 3, oldLines * 2)) return true;
  if (oldLines === 1) return false;
  return search.trim().length > Math.max(oldString.trim().length + 500, oldString.trim().length * 4);
}

/**
 * Applique la substitution `oldString` → `newString` sur `content` via la
 * cascade. Lève si introuvable, ambigu (plusieurs matchs sans replaceAll), ou
 * si le match est disproportionné. Renvoie le nouveau contenu.
 */
export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }
  if (oldString === "") {
    throw new Error(
      "oldString cannot be empty when editing an existing file. Provide the exact text to replace, or use write_file for an intentional full-file replacement.",
    );
  }

  let notFound = true;
  for (const replacer of REPLACERS) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search);
      if (index === -1) continue;
      notFound = false;
      if (isDisproportionateMatch(search, oldString)) {
        throw new Error(
          "Refusing replacement because the matched span is much larger than oldString. Re-read the file and provide the full exact oldString for the intended replacement.",
        );
      }
      if (replaceAll) return content.replaceAll(search, newString);
      if (index !== content.lastIndexOf(search)) continue; // ambigu → replacer suivant

      // Réalignement du saut de ligne de frontière : les replacers tolérants
      // yield un span SANS le `\n` final de la dernière ligne. Si ce `\n` subsiste
      // dans le contenu et que `newString` en porte un aussi, on insérerait une
      // ligne vide parasite. On absorbe ce `\n` des DEUX côtés → exactement un saut
      // de ligne préservé (jamais de doublon, jamais de fusion de lignes).
      let span = search;
      let replacement = newString;
      if (!span.endsWith("\n") && content[index + span.length] === "\n") {
        span += "\n";
        replacement = replacement.endsWith("\n") ? replacement : `${replacement}\n`;
      }
      return content.substring(0, index) + replacement + content.substring(index + span.length);
    }
  }

  if (notFound) {
    throw new Error(
      "Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.",
    );
  }
  throw new Error(
    "Found multiple matches for oldString. Provide more surrounding context to make the match unique.",
  );
}

/** Retire l'indentation commune des lignes de contenu d'un diff (lisibilité). */
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
  /** Diff unifié (indentation commune retirée), prêt à afficher. */
  diff: string;
  additions: number;
  deletions: number;
}

/**
 * Applique une édition et renvoie le nouveau contenu + un diff unifié compté.
 * Gère les fins de ligne du fichier d'origine (CRLF préservé). Lève comme
 * `replace()` en cas d'échec.
 */
export function applyEdit(
  path: string,
  original: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): EditResult {
  const ending = detectLineEnding(original);
  const old = convertToLineEnding(normalizeLineEndings(oldString), ending);
  const replacement = convertToLineEnding(normalizeLineEndings(newString), ending);
  const content = replace(original, old, replacement, replaceAll);

  const diff = trimDiff(
    createTwoFilesPatch(path, path, normalizeLineEndings(original), normalizeLineEndings(content)),
  );
  let additions = 0;
  let deletions = 0;
  for (const change of diffLines(normalizeLineEndings(original), normalizeLineEndings(content))) {
    if (change.added) additions += change.count || 0;
    if (change.removed) deletions += change.count || 0;
  }
  return { content, diff, additions, deletions };
}
