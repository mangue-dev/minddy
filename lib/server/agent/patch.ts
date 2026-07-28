import { applyEdit, countLineChanges } from "./edit";

/**
 * Format `apply_patch` (MIN-115) — le dialecte d'édition de Codex, repris par
 * OpenCode. PUR et testable : `execute.ts` ne fait qu'appeler `parsePatch` puis
 * `applyPatchEdits`, fichier par fichier.
 *
 * Pourquoi un deuxième format d'édition : 10 de nos 15 runs tournent sur
 * `openai/gpt-5.6-luna`, et c'est le format sur lequel cette famille est
 * entraînée. OpenCode le sert donc AUX SEULS modèles `gpt-*` (cf.
 * `usesApplyPatch` plus bas), à la PLACE d'`edit_file`/`apply_edits`/`write_file` :
 * deux façons de faire la même chose dans un même prompt, c'est un modèle qui
 * hésite.
 *
 * Ce qu'il apporte : le hunk porte du CONTEXTE (`@@ def greet():`, plus les lignes
 * inchangées) là où `old_string` porte une chaîne exacte — il tolère mieux une
 * lecture approximative du fichier.
 *
 * **Un seul moteur d'édition.** Ce module ne réimplémente PAS l'application : il
 * traduit chaque hunk en `{ oldString, newString }` et le fait passer par la
 * cascade de [edit.ts](./edit.ts). L'ancre `@@` sert seulement à RESTREINDRE la
 * zone de recherche (et n'est jamais bloquante : si elle n'aide pas, on retente
 * sur le fichier entier).
 *
 * Les erreurs de parsing sont volontairement explicites : c'est le modèle qui les
 * lit, et une erreur actionnable lui coûte un round au lieu d'un tour.
 */

// ── Format ───────────────────────────────────────────────────────────────────

const BEGIN_MARKER = "*** Begin Patch";
const END_MARKER = "*** End Patch";
const ADD_HEADER = "*** Add File:";
const DELETE_HEADER = "*** Delete File:";
const UPDATE_HEADER = "*** Update File:";
const MOVE_HEADER = "*** Move to:";
const EOF_MARKER = "*** End of File";

/** Une substitution d'un hunk, prête pour la cascade d'`edit.ts`. */
export interface PatchEdit {
  /** Lignes attendues (contexte + supprimées). Vide = insertion pure. */
  oldString: string;
  /** Lignes de remplacement (contexte + ajoutées). */
  newString: string;
  /** Ancre `@@ …` du hunk, quand le modèle en donne une. Indice, pas exigence. */
  context?: string;
}

/** Une section de fichier du patch. */
export type PatchOp =
  | { op: "add"; path: string; content: string }
  | { op: "delete"; path: string }
  | { op: "update"; path: string; moveTo?: string; edits: PatchEdit[] };

/**
 * La règle d'OpenCode (`packages/opencode/src/tool/registry.ts`) : la famille GPT
 * — hors `gpt-oss` (poids ouverts, pas le même entraînement) et hors `gpt-4`
 * (génération précédente) — reçoit `apply_patch` ; tout le reste garde
 * `edit_file` / `apply_edits` / `write_file`. Marche telle quelle sur nos ids
 * préfixés par le provider (`openai/gpt-5.6-luna`).
 */
export function usesApplyPatch(model: string | null | undefined): boolean {
  const id = (model ?? "").toLowerCase();
  return id.includes("gpt-") && !id.includes("oss") && !id.includes("gpt-4");
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function excerpt(line: string): string {
  return JSON.stringify(line.length > 80 ? `${line.slice(0, 80)}…` : line);
}

/** Certains modèles emballent le patch dans un heredoc shell — on le déballe. */
function stripHeredoc(input: string): string {
  const m = input.match(/^(?:[a-z_]+\s+)?<<-?['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/);
  return m ? m[2] : input;
}

/**
 * Lignes vides communes au début ET à la fin des deux versions : elles n'ancrent
 * rien et durcissent le matching pour rien (un modèle laisse volontiers une ligne
 * vide avant l'en-tête suivant). Les retirer ne change pas la substitution.
 */
function trimSharedBlanks(oldLines: string[], newLines: string[]): void {
  while (
    oldLines.length > 0 &&
    newLines.length > 0 &&
    oldLines[0] === "" &&
    newLines[0] === ""
  ) {
    oldLines.shift();
    newLines.shift();
  }
  while (
    oldLines.length > 0 &&
    newLines.length > 0 &&
    oldLines[oldLines.length - 1] === "" &&
    newLines[newLines.length - 1] === ""
  ) {
    oldLines.pop();
    newLines.pop();
  }
}

/** Contenu d'une section `*** Add File:` : chaque ligne est préfixée `+`. */
function parseAddFile(
  lines: string[],
  start: number,
  stop: number,
  path: string,
): { content: string; next: number } {
  const out: string[] = [];
  let i = start;
  for (; i < stop && !lines[i].startsWith("***"); i++) {
    const line = lines[i];
    if (line.startsWith("+")) out.push(line.slice(1));
    // Une ligne vide nue = une ligne vide du fichier : le modèle oublie souvent
    // le `+` sur celles-là, et la jeter silencieusement corromprait le fichier.
    else if (line === "") out.push("");
    else {
      throw new Error(
        `Invalid patch for ${path}: every line of an added file must start with '+' (got ${excerpt(line)}).`,
      );
    }
  }
  return { content: out.length > 0 ? `${out.join("\n")}\n` : "", next: i };
}

/** Hunks d'une section `*** Update File:` → substitutions. */
function parseUpdateChunks(
  lines: string[],
  start: number,
  stop: number,
  path: string,
): { edits: PatchEdit[]; next: number } {
  const edits: PatchEdit[] = [];
  let i = start;

  while (i < stop && !lines[i].startsWith("***")) {
    let context: string | undefined;
    if (lines[i].startsWith("@@")) {
      context = lines[i].slice(2).trim() || undefined;
      i++;
    }

    const oldLines: string[] = [];
    const newLines: string[] = [];
    let changed = false;
    for (; i < stop; i++) {
      const line = lines[i];
      // Ancre « jusqu'à la fin du fichier » de Codex : elle ne porte pas de
      // contenu, et notre cascade n'en a pas besoin — on la consomme.
      if (line.trim() === EOF_MARKER) {
        i++;
        break;
      }
      if (line.startsWith("@@") || line.startsWith("***")) break;
      if (line.startsWith(" ")) {
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      } else if (line === "") {
        // Ligne vide nue = ligne de contexte vide (même raison que dans un Add).
        oldLines.push("");
        newLines.push("");
      } else if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
        changed = true;
      } else if (line.startsWith("+")) {
        newLines.push(line.slice(1));
        changed = true;
      } else {
        throw new Error(
          `Invalid patch for ${path}: a hunk line must start with ' ' (context), '-' (removed) or '+' (added) (got ${excerpt(line)}).`,
        );
      }
    }

    if (!changed) {
      // Un `@@` seul avant l'en-tête suivant : rien à faire, pas une erreur.
      if (oldLines.length === 0 && newLines.length === 0) continue;
      throw new Error(
        `Invalid patch for ${path}: a hunk${context ? ` (@@ ${context})` : ""} carries no '-' or '+' line — it changes nothing.`,
      );
    }

    trimSharedBlanks(oldLines, newLines);
    const oldString = oldLines.join("\n");
    const newString = newLines.join("\n");
    if (oldString === newString) {
      throw new Error(
        `Invalid patch for ${path}: a hunk${context ? ` (@@ ${context})` : ""} removes and re-adds the same lines — it changes nothing.`,
      );
    }
    edits.push({ oldString, newString, ...(context ? { context } : {}) });
  }

  return { edits, next: i };
}

/**
 * Enveloppe `*** Begin Patch` … `*** End Patch` → opérations par fichier. Lève
 * avec un message que le modèle peut corriger tel quel.
 */
export function parsePatch(patchText: string): PatchOp[] {
  const normalized = patchText.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = stripHeredoc(normalized.trim()).split("\n");

  const begin = lines.findIndex((l) => l.trim() === BEGIN_MARKER);
  if (begin === -1) {
    throw new Error(
      `Invalid patch: it must open with '${BEGIN_MARKER}' on its own line and close with '${END_MARKER}'.`,
    );
  }
  const end = lines.findIndex((l, idx) => idx > begin && l.trim() === END_MARKER);
  if (end === -1) {
    throw new Error(`Invalid patch: '${END_MARKER}' is missing — the envelope is never closed.`);
  }

  const ops: PatchOp[] = [];
  let i = begin + 1;
  while (i < end) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith(ADD_HEADER)) {
      const path = line.slice(ADD_HEADER.length).trim();
      if (!path) throw new Error(`Invalid patch: '${ADD_HEADER}' has no file path.`);
      const { content, next } = parseAddFile(lines, i + 1, end, path);
      ops.push({ op: "add", path, content });
      i = next;
    } else if (line.startsWith(DELETE_HEADER)) {
      const path = line.slice(DELETE_HEADER.length).trim();
      if (!path) throw new Error(`Invalid patch: '${DELETE_HEADER}' has no file path.`);
      ops.push({ op: "delete", path });
      i += 1;
    } else if (line.startsWith(UPDATE_HEADER)) {
      const path = line.slice(UPDATE_HEADER.length).trim();
      if (!path) throw new Error(`Invalid patch: '${UPDATE_HEADER}' has no file path.`);
      let moveTo: string | undefined;
      let cursor = i + 1;
      if (cursor < end && lines[cursor].startsWith(MOVE_HEADER)) {
        moveTo = lines[cursor].slice(MOVE_HEADER.length).trim() || undefined;
        cursor += 1;
      }
      const { edits, next } = parseUpdateChunks(lines, cursor, end, path);
      // Une section sans hunk n'a de sens que pour un renommage sec.
      if (edits.length === 0 && !moveTo) {
        throw new Error(
          `Invalid patch for ${path}: '${UPDATE_HEADER} ${path}' carries no hunk. Add at least one '@@' hunk with '-'/'+' lines, or use '${DELETE_HEADER}'.`,
        );
      }
      ops.push({ op: "update", path, ...(moveTo ? { moveTo } : {}), edits });
      i = next;
    } else if (line.startsWith("***")) {
      throw new Error(
        `Invalid patch: unknown directive ${excerpt(line.trim())}. Expected '${ADD_HEADER}', '${UPDATE_HEADER}' or '${DELETE_HEADER}'.`,
      );
    } else {
      throw new Error(
        `Invalid patch: line ${excerpt(line)} sits outside any file section — every change must follow an '${ADD_HEADER}', '${UPDATE_HEADER}' or '${DELETE_HEADER}' header.`,
      );
    }
  }

  if (ops.length === 0) {
    throw new Error("Invalid patch: the envelope is empty — it carries no file section.");
  }
  return ops;
}

// ── Application (via la cascade d'edit.ts) ───────────────────────────────────

/**
 * Index du DÉBUT de la ligne qui porte l'ancre `@@`, ou -1. Deux passes : égalité
 * exacte du texte élagué (le cas normal, l'indentation en moins), puis inclusion
 * (le modèle raccourcit volontiers la signature qu'il cite).
 */
function anchorIndex(content: string, context: string): number {
  const needle = context.trim();
  if (!needle) return -1;
  const lines = content.split("\n");
  let offset = 0;
  let loose = -1;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === needle) return offset;
    if (loose === -1 && trimmed.includes(needle)) loose = offset;
    offset += line.length + 1;
  }
  return loose;
}

/** Insertion pure (hunk sans ligne `-` ni contexte) : après l'ancre, sinon en fin. */
function insertLines(content: string, edit: PatchEdit): string {
  const ending = content.includes("\r\n") ? "\r\n" : "\n";
  const block = edit.newString.split("\n").join(ending);
  if (edit.context) {
    const at = anchorIndex(content, edit.context);
    if (at !== -1) {
      const eol = content.indexOf("\n", at);
      const cut = eol === -1 ? content.length : eol + 1;
      return `${content.slice(0, cut)}${block}${ending}${content.slice(cut)}`;
    }
  }
  const separator = content === "" || content.endsWith("\n") ? "" : ending;
  return `${content}${separator}${block}${ending}`;
}

function applyOne(path: string, content: string, edit: PatchEdit): string {
  if (edit.oldString === "") return insertLines(content, edit);
  if (edit.context) {
    const at = anchorIndex(content, edit.context);
    if (at !== -1) {
      try {
        // Recherche restreinte à partir de l'ancre : c'est ce qui lève
        // l'ambiguïté quand le même bloc existe deux fois dans le fichier.
        const tail = applyEdit(path, content.slice(at), edit.oldString, edit.newString);
        return content.slice(0, at) + tail.content;
      } catch {
        // L'ancre n'aide pas (mal placée, ou le bloc est au-dessus) : elle reste
        // un indice, jamais une exigence — on retente sur le fichier entier.
      }
    }
  }
  return applyEdit(path, content, edit.oldString, edit.newString).content;
}

/**
 * Applique les hunks d'un fichier, dans l'ordre, en mémoire — l'appelant écrit
 * UNE fois. Lève au premier hunk qui ne s'applique pas (message d'`edit.ts`).
 */
export function applyPatchEdits(
  path: string,
  original: string,
  edits: PatchEdit[],
): { content: string; additions: number; deletions: number } {
  let content = original;
  for (const edit of edits) content = applyOne(path, content, edit);
  return { content, ...countLineChanges(original, content) };
}
