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

/**
 * Pourquoi une substitution a été refusée. Le message reste celui que l'agent
 * de code lit depuis toujours (`execute.ts` n'en connaît que `.message`) ; ce
 * `reason` s'ajoute à côté pour les appelants qui doivent RÉÉCRIRE le message —
 * le tool MCP `minddy_edit_issue_text` édite un plan de ticket, pas un fichier,
 * et n'a ni « the file » ni `write_file` à proposer (MIN-186).
 */
export type ReplaceFailure =
  | "identical"
  | "empty_old"
  | "disproportionate"
  | "not_found"
  | "ambiguous";

/**
 * Ce que la cascade a fait pour arriver à ce résultat (MIN-246). On ne l'arbitre
 * pas, on la MESURE : quel replacer a résolu, à quel rang de la cascade, avec
 * quelle similarité quand il en calcule une, et combien de candidats ont été
 * écartés en chemin. `exec-tool` l'agrège par appel de tool et `agent-loop` la
 * persiste dans l'event `tool_result` — elle ne part JAMAIS au modèle.
 *
 * Sur un échec, elle voyage sur la `ReplaceError` : c'est le seul endroit où
 * l'on sache qu'un `not_found` a vu passer douze candidats ou aucun.
 */
export interface ReplaceTrace {
  /** Nom du replacer qui a résolu (absent : aucun n'a résolu). */
  replacer?: string;
  /** Rang 1-based dans la cascade (1 = match exact). */
  rank?: number;
  /** Similarité du bloc retenu, quand le replacer en calcule une (ancrage). */
  similarity?: number;
  /** Candidats examinés, tous replacers confondus. */
  candidates: number;
  /** Candidats écartés parce que leur étendue était disproportionnée. */
  rejectedDisproportionate: number;
  /** Candidats écartés parce qu'ils apparaissaient plusieurs fois. */
  rejectedAmbiguous: number;
}

function emptyTrace(): ReplaceTrace {
  return { candidates: 0, rejectedDisproportionate: 0, rejectedAmbiguous: 0 };
}

export class ReplaceError extends Error {
  readonly reason: ReplaceFailure;
  /** Ce que la cascade avait vu au moment de renoncer (MIN-246). */
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

/**
 * Un candidat. La forme longue sert aux replacers qui CALCULENT une similarité
 * pour décider (l'ancrage de bloc) : elle la fait remonter jusqu'à la trace, où
 * elle est la seule mesure qui dise à quel point le modèle avait dérivé.
 */
type Candidate = string | { text: string; similarity: number };

type Replacer = (content: string, find: string) => Generator<Candidate, void, unknown>;

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
        // Le cumul ne fait que croître : sortir dès le seuil atteint (ce que
        // faisait le code d'origine) donnait la même DÉCISION mais un chiffre
        // tronqué. Depuis MIN-246 la similarité est mesurée, donc on la calcule
        // en entier — le surcoût est borné par la taille du bloc.
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

/**
 * Normalisation unicode : replie tirets typographiques (U+2010–2015, U+2212),
 * guillemets courbes (U+2018–201B / U+201C–201F) et espaces insécables/typo vers
 * l'ASCII des DEUX côtés (les modèles émettent souvent un em-dash/une quote courbe
 * là où le fichier a de l'ASCII, ou l'inverse).
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

/** 10. Toutes les occurrences exactes (support de replaceAll). */
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
 * La cascade, NOMMÉE (MIN-246) : le rang seul ne dit rien à qui lit un relevé
 * six mois plus tard, et l'ordre a déjà bougé une fois (unicode inséré en 6ᵉ).
 * Les noms sont ceux des replacers, et ce sont eux qui atterrissent en base.
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
 * Réalignement du saut de ligne de frontière : les replacers tolérants yield un
 * span SANS le `\n` final de la dernière ligne. Si ce `\n` subsiste dans le contenu
 * (juste après le match) et que `newString` en porte un aussi, on insérerait une
 * ligne vide parasite. On absorbe ce `\n` des DEUX côtés → exactement un saut de
 * ligne préservé (jamais de doublon, jamais de fusion de lignes).
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
 * Applique la substitution `oldString` → `newString` sur `content` via la
 * cascade. Lève si introuvable, ambigu (plusieurs matchs sans replaceAll), ou
 * si le match est disproportionné. Renvoie le nouveau contenu.
 *
 * `firstMatch` lève le refus d'ambiguïté et prend le PREMIER match : réservé à
 * `apply_patch` (MIN-115), dont les hunks sont POSITIONNELS et ordonnés — deux
 * hunks identiques y désignent deux occurrences successives, et
 * [patch.ts](./patch.ts) n'appelle avec ce drapeau qu'après avoir avancé son
 * curseur au-delà du hunk précédent. Sur `edit_file`/`apply_edits`, où
 * `old_string` est censé être unique par lui-même, l'ambiguïté reste un refus.
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
 * `replace()` qui rend AUSSI ce que la cascade a fait (MIN-246). C'est la vraie
 * fonction ; `replace()` n'en est que la façade historique.
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
        // On PASSE au candidat suivant (MIN-246). Lever ici tuait toute la
        // cascade : un replacer tolérant qui capture un bloc trop grand faisait
        // échouer une édition qu'un replacer plus bas résolvait proprement — pas
        // de corruption, mais un round brûlé. L'échec reste bruyant si personne
        // ne résout : le refus est rendu à la fin, avec le même message.
        trace.rejectedDisproportionate++;
        continue;
      }
      if (replaceAll) {
        // Remplace CHAQUE occurrence littérale de `search`, en réalignant le `\n`
        // de frontière à chacune (comme le chemin single-match) — sinon un
        // new_string terminé par `\n` insère une ligne vide parasite après chaque bloc.
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
  // Un candidat a bien été trouvé mais aucun n'a pu être appliqué. Le refus le
  // plus actionnable prime : « ton oldString ne couvre pas ce que tu vises »
  // avant « ton oldString n'est pas unique ».
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

// ── Télémétrie (MIN-246) ─────────────────────────────────────────────────────

/** Une substitution qui a abouti, telle qu'elle part en base. */
export interface EditTelemetryMatch {
  replacer: string;
  rank: number;
  similarity?: number;
  /** `apply_patch` seulement : rang de la tentative d'ancrage qui a passé. */
  attempt?: number;
  rejected_disproportionate?: number;
  rejected_ambiguous?: number;
}

/** Une substitution refusée : le motif, et ce que la cascade avait vu. */
export interface EditTelemetryFailure {
  reason: string;
  candidates: number;
  rejected_disproportionate?: number;
}

/**
 * Ce qu'UN appel d'un tool d'édition a fait passer par la cascade. Agrégé par
 * `exec-tool`, persisté par `agent-loop` dans le payload de l'event
 * `tool_result` — jamais rendu au modèle. Le modèle du run se lit à côté, sur
 * `agent_runs.model` : c'est ce qui donne « par modèle et par chemin ».
 */
export interface EditTelemetry {
  tool: "edit_file" | "apply_edits" | "apply_patch";
  matched: EditTelemetryMatch[];
  failed: EditTelemetryFailure[];
  /** `apply_patch` : l'enveloppe elle-même était illisible (échec de FORMAT). */
  parse_error?: string;
  /** Présents SEULEMENT quand la liste a été capée : un relevé qui compte des
   *  substitutions ne doit pas prendre un plafond pour un total. */
  matched_total?: number;
  failed_total?: number;
}

/** Entrées gardées par appel — un batch de 40 fichiers n'a pas à peser en base. */
const TELEMETRY_CAP = 20;

/** Arrondi : trois décimales suffisent à comparer une similarité à un seuil. */
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
 * L'échec tel qu'il se compte. `reason` vient de `ReplaceError` quand c'est la
 * cascade qui a refusé ; tout autre échec (fichier absent, hunk illisible)
 * s'agrège sous un motif à part — ce n'est pas la même mesure.
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

/** Cape les listes d'une télémétrie et la rend, ou `undefined` si elle est vide. */
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
  /** Ce que la cascade a fait pour y arriver (MIN-246). */
  trace: ReplaceTrace;
}

/**
 * Diff unifié entre deux contenus, mis en forme comme celui d'`applyEdit`. Les
 * chemins qui appliquent PLUSIEURS substitutions dans un même fichier
 * (`apply_edits`, `apply_patch`) en ont besoin sans repasser par `applyEdit` :
 * ce qui vaut d'être rendu au modèle, c'est le diff du fichier une fois toutes
 * les substitutions posées, pas un diff par substitution.
 */
export function diffFiles(path: string, before: string, after: string): string {
  return trimDiff(
    createTwoFilesPatch(path, path, normalizeLineEndings(before), normalizeLineEndings(after)),
  );
}

/** Lignes ajoutées / supprimées entre deux contenus (fins de ligne neutralisées). */
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
  firstMatch = false,
): EditResult {
  const ending = detectLineEnding(original);
  const old = convertToLineEnding(normalizeLineEndings(oldString), ending);
  const replacement = convertToLineEnding(normalizeLineEndings(newString), ending);
  const { content, trace } = replaceTraced(original, old, replacement, replaceAll, firstMatch);

  return { content, diff: diffFiles(path, original, content), trace, ...countLineChanges(original, content) };
}
