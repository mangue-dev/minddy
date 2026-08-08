import { applyEdit, countLineChanges, type ReplaceTrace } from "./edit";

/**
 * La trace de la cascade (MIN-246), plus ce que ce format ajoute : le rang de la
 * tentative qui a fini par passer. Un hunk peut être retenté depuis l'ancre,
 * depuis le curseur, depuis le début du fichier, puis les trois en `firstMatch`
 * — six tentatives, et savoir laquelle a marché est ce qui dit si le contexte
 * `@@` porte quelque chose.
 */
export type PatchTrace = ReplaceTrace & { attempt: number };

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
  /**
   * Ancres qui PRÉCÈDENT le hunk : les hunks sans `-` ni `+` que le modèle
   * intercale pour dire OÙ (cf. `parseUpdateChunks`). Appliquées dans l'ordre,
   * avant `context`, chacune ne faisant qu'avancer le curseur.
   */
  anchors?: string[];
}

/** Une section de fichier du patch. */
export type PatchOp =
  | { op: "add"; path: string; content: string }
  | { op: "delete"; path: string }
  | { op: "update"; path: string; moveTo?: string; edits: PatchEdit[] }
  /**
   * Section illisible. Elle ne fait plus tomber l'enveloppe entière : un patch
   * de 7 fichiers dont UN hunk était mal formé revenait en erreur nue, les 6
   * bons fichiers avec — et le modèle rejouait tout. Le défaut voyage jusqu'au
   * rapport par fichier, à côté des sections qui, elles, ont abouti.
   */
  | { op: "invalid"; path: string; error: string };

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

/**
 * Hunks d'une section `*** Update File:` → substitutions.
 *
 * **Un hunk qui ne change rien n'est pas une faute : c'est une ancre.** Le
 * format admet d'empiler des `@@` pour cerner l'endroit, et les modèles en usent
 * de deux façons que rien ne distingue à la lecture :
 *
 * ```
 * @@                                    @@
 *  export async function restoreItem(   -  if (type === "project") {
 * @@                                    +  if (type === "project") {
 * -  } else {                           @@
 * +  } else if (…) {                    -  } else {
 * ```
 *
 * À gauche l'ancre est une ligne de contexte sous un `@@` nu, à droite une
 * ligne retirée puis remise à l'identique. Les deux disaient « le hunk suivant,
 * c'est ICI » ; les deux étaient refusées (« carries no '-' or '+' line »,
 * « removes and re-adds the same lines »), et le refus emportait l'enveloppe.
 * Sur un vrai run, 9 patchs sur 22 sont morts là. On les lit donc pour ce
 * qu'ils sont : elles rejoignent `anchors` du hunk qui suit.
 */
function parseUpdateChunks(
  lines: string[],
  start: number,
  stop: number,
  path: string,
): { edits: PatchEdit[]; next: number } {
  const edits: PatchEdit[] = [];
  /** Ancres lues depuis le dernier vrai hunk, consommées par le prochain. */
  const pending: string[] = [];
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
      // Hunk de contexte pur → ancre(s) pour le hunk suivant.
      if (context) pending.push(context);
      const anchor = oldLines.join("\n");
      if (anchor.trim()) pending.push(anchor);
      continue;
    }

    trimSharedBlanks(oldLines, newLines);
    const oldString = oldLines.join("\n");
    const newString = newLines.join("\n");
    if (oldString === newString) {
      // `-x` puis `+x` : la même ancre, écrite autrement.
      if (context) pending.push(context);
      if (oldString.trim()) pending.push(oldString);
      continue;
    }
    edits.push({
      oldString,
      newString,
      ...(context ? { context } : {}),
      ...(pending.length > 0 ? { anchors: pending.splice(0, pending.length) } : {}),
    });
  }

  return { edits, next: i };
}

/** Prochaine section de fichier à partir de `from` (ou `stop` s'il n'y en a plus). */
function nextSection(lines: string[], from: number, stop: number): number {
  for (let i = from; i < stop; i++) {
    const line = lines[i];
    if (
      line.startsWith(ADD_HEADER) ||
      line.startsWith(DELETE_HEADER) ||
      line.startsWith(UPDATE_HEADER)
    ) {
      return i;
    }
  }
  return stop;
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
      try {
        const { content, next } = parseAddFile(lines, i + 1, end, path);
        ops.push({ op: "add", path, content });
        i = next;
      } catch (err) {
        ops.push({ op: "invalid", path, error: err instanceof Error ? err.message : String(err) });
        i = nextSection(lines, i + 1, end);
      }
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
      try {
        const { edits, next } = parseUpdateChunks(lines, cursor, end, path);
        // Une section sans hunk n'a de sens que pour un renommage sec.
        if (edits.length === 0 && !moveTo) {
          throw new Error(
            `Invalid patch for ${path}: '${UPDATE_HEADER} ${path}' carries no hunk. Add at least one '@@' hunk with '-'/'+' lines, or use '${DELETE_HEADER}'.`,
          );
        }
        ops.push({ op: "update", path, ...(moveTo ? { moveTo } : {}), edits });
        i = next;
      } catch (err) {
        ops.push({ op: "invalid", path, error: err instanceof Error ? err.message : String(err) });
        i = nextSection(lines, cursor, end);
      }
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
 * Index du DÉBUT de l'ancre dans `content`, à partir de `from`, ou -1. Trois
 * passes : le bloc tel quel, puis l'égalité ligne à ligne du texte élagué (le
 * cas normal, l'indentation en moins), puis l'inclusion sur une ancre d'une
 * seule ligne (le modèle raccourcit volontiers la signature qu'il cite).
 */
function anchorIndex(content: string, anchor: string, from = 0): number {
  const needle = anchor.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  if (needle.length === 0) return -1;
  const direct = content.indexOf(anchor, from);
  if (direct !== -1) return direct;

  const lines = content.split("\n");
  let offset = 0;
  let loose = -1;
  for (let i = 0; i < lines.length; i++) {
    const at = offset;
    offset += lines[i].length + 1;
    if (at < from) continue;
    let all = true;
    for (let j = 0; j < needle.length; j++) {
      if ((lines[i + j] ?? "").trim() !== needle[j]) {
        all = false;
        break;
      }
    }
    if (all) return at;
    if (loose === -1 && needle.length === 1 && lines[i].trim().includes(needle[0])) loose = at;
  }
  return loose;
}

/** Insertion pure (hunk sans ligne `-` ni contexte) : après l'ancre, sinon en fin. */
function insertLines(content: string, newString: string, at: number): string {
  const ending = content.includes("\r\n") ? "\r\n" : "\n";
  const block = newString.split("\n").join(ending);
  if (at !== -1) {
    const eol = content.indexOf("\n", at);
    const cut = eol === -1 ? content.length : eol + 1;
    return `${content.slice(0, cut)}${block}${ending}${content.slice(cut)}`;
  }
  const separator = content === "" || content.endsWith("\n") ? "" : ending;
  return `${content}${separator}${block}${ending}`;
}

/**
 * Fin de la zone modifiée entre deux contenus — le curseur du hunk suivant.
 * Se lit sur les préfixe et suffixe communs : aucune des stratégies d'`edit.ts`
 * ne dit où elle a frappé, et c'est la seule mesure qui vaille pour toutes.
 */
function changedEnd(before: string, after: string, fallback: number): number {
  if (before === after) return fallback;
  const max = Math.min(before.length, after.length);
  let head = 0;
  while (head < max && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) {
    tail++;
  }
  return after.length - tail;
}

/**
 * Applique un hunk et rend le curseur — la position juste après ce qu'il a
 * changé, d'où partira le hunk suivant.
 *
 * Les hunks d'un patch sont ORDONNÉS : chacun se cherche à partir de `from`, pas
 * du début du fichier. C'est ce qui fait qu'un même hunk répété deux fois vise
 * deux occurrences successives — l'écriture qu'emploie le modèle pour changer
 * les deux `} else {` d'un fichier, et qui revenait jusqu'ici en « Found
 * multiple matches ». D'où aussi la deuxième passe en `firstMatch` : sur un
 * patch, plusieurs matchs ne sont pas une ambiguïté, c'est une position. La
 * passe stricte garde la main tant qu'elle trouve un match unique.
 */
function applyOne(
  path: string,
  content: string,
  edit: PatchEdit,
  from: number,
): { content: string; cursor: number; trace?: PatchTrace } {
  let at = from;
  let anchored = false;
  for (const anchor of [...(edit.anchors ?? []), ...(edit.context ? [edit.context] : [])]) {
    const found = anchorIndex(content, anchor, at);
    // Une ancre introuvable APRÈS le curseur reste un indice, jamais une
    // exigence : on ne recule pas pour elle, on l'ignore.
    if (found !== -1) {
      at = found;
      anchored = true;
    }
  }

  if (edit.oldString === "") {
    const next = insertLines(content, edit.newString, anchored ? at : -1);
    return { content: next, cursor: changedEnd(content, next, from) };
  }

  const starts = [...new Set([at, from, 0])];
  let last: unknown;
  /** Tentatives (couples start × firstMatch) épuisées avant celle qui passe. */
  let attempt = 0;
  for (const firstMatch of [false, true]) {
    for (const start of starts) {
      attempt++;
      try {
        const tail = applyEdit(
          path,
          content.slice(start),
          edit.oldString,
          edit.newString,
          false,
          firstMatch,
        );
        const next = content.slice(0, start) + tail.content;
        return {
          content: next,
          cursor: changedEnd(content, next, from),
          // `attempt: 1` = la passe stricte, depuis l'ancre, a suffi. Au-delà,
          // l'ancre `@@` n'a pas servi (ou a mal servi) : c'est exactement ce
          // qu'on cherche à savoir de ce format (MIN-246).
          trace: { ...tail.trace, attempt },
        };
      } catch (err) {
        last = err;
      }
    }
  }
  throw last;
}

/**
 * Applique les hunks d'un fichier, dans l'ordre, en mémoire — l'appelant écrit
 * UNE fois. Lève au premier hunk qui ne s'applique pas (message d'`edit.ts`).
 */
export function applyPatchEdits(
  path: string,
  original: string,
  edits: PatchEdit[],
): { content: string; additions: number; deletions: number; traces: PatchTrace[] } {
  let content = original;
  let cursor = 0;
  // Une trace par hunk PASSÉ par la cascade : une insertion pure (`oldString`
  // vide) n'en a pas, elle ne cherche rien.
  const traces: PatchTrace[] = [];
  for (const edit of edits) {
    const applied = applyOne(path, content, edit, cursor);
    content = applied.content;
    cursor = applied.cursor;
    if (applied.trace) traces.push(applied.trace);
  }
  return { content, traces, ...countLineChanges(original, content) };
}
