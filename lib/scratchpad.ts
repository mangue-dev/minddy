// Scratchpad (Notes) — pure, server-safe helpers (no React, no I/O).
//
// The scratchpad is ONE personal markdown note. Its content reuses the plan
// format (lib/plan.ts): '##' section titles + checkbox tasks. Here we only add
// what the plan module doesn't cover: a hard size cap, splitting the note into
// sections, and appending new tasks (used by the WYSIWYG editor and the MCP).

import { diff3Merge } from "node-diff3";
import {
  diffPlanTasks,
  parsePlan,
  type PlanTask,
  type PlanTaskState,
} from "@/lib/plan";

/** Hard cap on the stored scratchpad markdown (aligned with plans). */
export const MAX_SCRATCHPAD_LENGTH = 65_536;

/**
 * Three-way LINE merge for concurrent scratchpad edits — your open editor vs the
 * agent via the MCP writing against a stale version. Combines both sides'
 * changes against the common ancestor `base`:
 *
 *   - edits on DIFFERENT lines from each side are both kept;
 *   - when the SAME region was changed on both sides (a true conflict), YOUR
 *     version (`ours`) wins — the user's work is never silently dropped.
 *
 * Line-oriented (the note is markdown tasks/sections) via node-diff3. Pure and
 * server-safe, shared by the client save path and any server-side reconcile.
 */
export function mergeScratchpad(
  base: string,
  ours: string,
  theirs: string
): string {
  if (ours === theirs) return ours;
  if (base === theirs) return ours; // only you changed
  if (base === ours) return theirs; // only the other side changed
  const regions = diff3Merge(
    ours.split("\n"),
    base.split("\n"),
    theirs.split("\n"),
    { excludeFalseConflicts: true }
  );
  const out: string[] = [];
  for (const region of regions) {
    // `ok` = a stretch both sides agree on (incl. one-sided changes); on a real
    // conflict keep `a` (ours) so your version wins.
    if (region.ok) out.push(...region.ok);
    else if (region.conflict) out.push(...region.conflict.a);
  }
  return out.join("\n");
}

/** Full checkbox marker (with brackets) for each task state. */
export const TASK_MARKER_BY_STATE: Record<PlanTaskState, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
  cancelled: "[-]",
};

/** Une ligne de tâche markdown : une puce (`-`, `*`, `+`) puis l'un des quatre
 *  marqueurs du carnet. Le `m` fait porter `^`/`$` sur chaque ligne. */
const MARKDOWN_TASK_LINE = /^[ \t]*[-*+][ \t]+\[[ xX~-]\](?=[ \t]|$)/m;

/**
 * Le texte porte-t-il au moins une ligne de tâche markdown ?
 *
 * Sert au COLLAGE dans le carnet (components/scratchpad/paste-markdown.ts) : un
 * presse-papier qui porte ces marqueurs porte du markdown, quoi qu'en dise sa
 * version HTML — et c'est en markdown qu'il faut le relire.
 */
export function containsMarkdownTaskLine(text: string): boolean {
  return MARKDOWN_TASK_LINE.test(text);
}

/** How a deliberate empty line (spacer) is stored. Markdown collapses runs of
 *  blank lines, so an empty paragraph the user typed for spacing would vanish on
 *  the WYSIWYG round-trip. A lone non-breaking space renders blank but is NOT a
 *  Markdown blank line, so consecutive spacers survive close/reopen. The editor
 *  (scratchpad-paragraph.ts) writes this on serialize and re-empties it on parse. */
export const SPACER_LINE = "\u00A0";

/** A line that is only a spacer (nbsp + optional spaces/tabs). Matched WITHOUT
 *  String.trim(), which itself strips U+00A0 and would hide the sentinel. */
const SPACER_LINE_RE = /^[ \t]*\u00A0[ \t\u00A0]*$/;

/**
 * Drop the invisible spacer lines (see SPACER_LINE) and collapse the blank runs
 * they leave behind. Used on every "copy as prompt" / export path so the on-screen
 * spacing never leaks non-breaking spaces into an agent prompt.
 */
export function stripScratchpadSpacers(content: string): string {
  return content
    .split("\n")
    .filter((line) => !SPACER_LINE_RE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export interface ScratchpadSection {
  /** Heading text with markers stripped, or null for the preamble before any
      heading. */
  title: string | null;
  /** Raw markdown of the section, INCLUDING its heading line. */
  markdown: string;
  /** 0-based index of the section's first line in the full document — added to
      a section-relative task line to address the task in the whole note. */
  startLine: number;
}

const HEADING = /^ {0,3}#{1,6}\s+(.*)$/;
const HEADING_LEVEL = /^ {0,3}(#{1,6})\s+/;
const THEMATIC_BREAK = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Split the note into sections at top-of-line markdown headings (`#`…`######`),
 * ignoring headings inside fenced code blocks. Content before the first heading
 * is a section with `title: null`. Blank sections are dropped. `startLine` is
 * preserved on absolute line numbers so callers can map a section-relative task
 * back to the whole document.
 */
export function splitScratchpadSections(content: string): ScratchpadSection[] {
  const lines = content.split("\n");
  const sections: ScratchpadSection[] = [];
  let start = 0;
  let fence: string | null = null;

  const push = (end: number) => {
    const markdown = lines.slice(start, end).join("\n");
    const headingMatch = lines[start]?.match(HEADING);
    sections.push({
      title: headingMatch ? headingMatch[1].trim() : null,
      markdown,
      startLine: start,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length)
        fence = null;
    }
    if (!fence && HEADING.test(line) && i > start) {
      push(i);
      start = i;
    }
  }
  push(lines.length);

  return sections.filter((s) => s.markdown.trim() !== "");
}

/**
 * La section du `headingIndex`-ième titre du carnet (0-based, dans l'ordre du
 * document ; un `#` en bloc de code n'est pas un titre et ne compte pas) —
 * SOUS-SECTIONS COMPRISES : du titre jusqu'au prochain titre de rang égal ou
 * supérieur, ou la fin de la note.
 *
 * `splitScratchpadSections` coupe à CHAQUE titre : c'est ce qu'il faut pour
 * ranger les tâches par titre (l'aperçu de l'accueil, la liste des sections
 * connues du MCP), mais pas pour les gestes qui prennent « cette section » —
 * copier en prompt, lancer un agent. Un `# Pull requests` qui n'a que des
 * `## …` en dessous en ressortait vide, et le geste ne portait alors sur rien.
 * Ici la section est un SOUS-ARBRE, comme dans `removeSettledTasks`.
 *
 * Null si le carnet n'a pas autant de titres.
 */
export function scratchpadSectionSubtree(
  content: string,
  headingIndex: number
): ScratchpadSection | null {
  const lines = content.split("\n");
  let fence: string | null = null;
  let seen = -1;
  let start = -1;
  let rank = 0;

  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      )
        fence = null;
      continue;
    }
    if (fence) continue;

    const heading = lines[i].match(HEADING_LEVEL);
    if (!heading) continue;
    if (start === -1) {
      seen += 1;
      if (seen === headingIndex) {
        start = i;
        rank = heading[1].length;
      }
      continue;
    }
    // Un titre plus profond appartient à la section ; un titre de même rang (ou
    // plus haut) la ferme.
    if (heading[1].length <= rank) return sectionSlice(lines, start, i);
  }

  return start === -1 ? null : sectionSlice(lines, start, lines.length);
}

function sectionSlice(
  lines: string[],
  start: number,
  end: number
): ScratchpadSection {
  const headingMatch = lines[start]?.match(HEADING);
  return {
    title: headingMatch ? headingMatch[1].trim() : null,
    markdown: lines.slice(start, end).join("\n").replace(/\s+$/, ""),
    startLine: start,
  };
}

export interface ScratchpadPreviewSection {
  /** Titre de la section, ou null pour ce qui précède le premier titre. */
  title: string | null;
  /** Ses tâches encore à faire, dans l'ordre du carnet. */
  tasks: PlanTask[];
}

/**
 * Ce qui RESTE à faire dans la note, groupé par section — de quoi en donner un
 * aperçu court sans l'ouvrir. Sans consommateur depuis que l'accueil s'est
 * réduit au salut et au composer ; gardé (et couvert) pour la prochaine surface
 * qui voudra résumer le carnet.
 *
 * « Reste » = ni terminé, ni annulé, ni une question : sous un titre
 * `## Questions`, une case cochée répond à une question, elle ne livre pas un
 * travail, et `parsePlan` la marque comme telle (lib/plan.ts). Les sections
 * vidées de leurs tâches tombent : un titre seul ne dit rien à qui passe.
 *
 * La note est parsée UNE fois, entière, puis les tâches sont rangées dans leur
 * section par numéro de ligne — et non chaque section parsée pour elle-même.
 * C'est ce qui garde le compte de l'aperçu égal à celui de la pastille du header
 * (`planProgress`) : une section `## Questions` porte jusqu'à ses sous-titres, et
 * un `### Détail` parsé isolément aurait recompté ses questions comme du travail.
 */
export function scratchpadPreview(content: string): ScratchpadPreviewSection[] {
  const left = parsePlan(content).tasks.filter(
    (task) =>
      !task.question && (task.state === "pending" || task.state === "in_progress")
  );
  if (left.length === 0) return [];

  const sections = splitScratchpadSections(content);
  return sections
    .map((section, i) => {
      const end = sections[i + 1]?.startLine ?? Number.POSITIVE_INFINITY;
      return {
        title: section.title,
        tasks: left.filter(
          (task) => task.line >= section.startLine && task.line < end
        ),
      };
    })
    .filter((section) => section.tasks.length > 0);
}

/**
 * Normalize ONE line of task text coming from a model (the dictation step of
 * the notebook, /api/me/scratchpad/dictate-task). The notebook draws the
 * checkbox itself, so a marker, a bullet or a heading level the model wrote
 * anyway is stripped rather than left to show up as literal text; newlines are
 * flattened, since an entry is one line. `max` caps the result.
 */
export function cleanDictatedTaskLine(value: string, max = 1000): string {
  return value
    .replace(/^\s*(?:[-*+]\s*)?(?:\[[ x~-]\]\s*)?/i, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export interface NewTask {
  text: string;
  state: PlanTaskState;
  /** Profondeur d'imbrication (0 = premier niveau). Voir TASK_INDENT. */
  depth?: number;
}

/**
 * Ce qui sépare un niveau d'imbrication du suivant dans le markdown du carnet :
 * DEUX espaces, l'unité que lit `parsePlan` (`indentDepth`) et celle que produit
 * l'éditeur (`renderList` de prosemirror-markdown, cf. task-nodes.ts). Une
 * sous-tâche écrite avec un autre pas se relit à la mauvaise profondeur.
 */
export const TASK_INDENT = "  ";

/** Une ligne de tâche, telle qu'elle s'écrit dans le carnet. */
export interface ScratchpadTaskLine {
  /** 0 = premier niveau. Voir TASK_INDENT. */
  depth: number;
  state: PlanTaskState;
  text: string;
}

/**
 * Le markdown d'un bout d'arbre de tâches — la brique commune à tous les gestes
 * qui SORTENT une tâche du carnet (copier en prompt, lancer un agent, promouvoir
 * en ticket) et à ceux qui en AJOUTENT une. Les profondeurs sont écrites telles
 * quelles ; c'est à l'appelant de les avoir ramenées à 0 s'il le faut
 * (`taskSubtreeLines` le fait).
 */
export function taskLinesMarkdown(lines: ScratchpadTaskLine[]): string {
  return lines
    .map(
      (line) =>
        `${TASK_INDENT.repeat(Math.max(0, Math.trunc(line.depth) || 0))}- ${
          TASK_MARKER_BY_STATE[line.state]
        } ${line.text.replace(/\s*\r?\n\s*/g, " ").trim()}`
    )
    .join("\n");
}

/**
 * La tâche `index` ET tout ce qu'elle porte, en profondeur : ses sous-tâches,
 * les leurs, sans limite de niveau. Les tâches d'un plan sont dans l'ordre du
 * document, donc le sous-arbre est la tranche qui suit la racine tant que la
 * profondeur reste STRICTEMENT plus grande que la sienne.
 *
 * Tableau vide si l'index ne désigne aucune tâche.
 */
export function taskSubtree(tasks: PlanTask[], index: number): PlanTask[] {
  const at = tasks.findIndex((task) => task.index === index);
  if (at === -1) return [];
  const out = [tasks[at]];
  for (let i = at + 1; i < tasks.length; i++) {
    if (tasks[i].depth <= tasks[at].depth) break;
    out.push(tasks[i]);
  }
  return out;
}

/**
 * Le sous-arbre de la tâche `index`, prêt à SORTIR du carnet.
 *
 * La règle de la hiérarchie : **le parent emporte ses enfants, l'enfant
 * n'emporte pas son parent.** Plus le geste est haut dans l'arbre, plus il
 * emporte ; il ne remonte jamais. D'où la renormalisation des profondeurs sur la
 * racine : une sous-tâche copiée seule part à plat, comme une tâche à elle
 * seule, sans traîner l'indentation de l'endroit d'où elle vient — qui, hors de
 * son parent, ne veut plus rien dire (et à partir de quatre espaces se relit
 * comme un bloc de code).
 *
 * `map` permet de sortir les tâches dans leur état d'APRÈS le geste (une
 * passation démarre le travail, racine et descendance comprises).
 */
export function taskSubtreeLines(
  tasks: PlanTask[],
  index: number,
  map?: (state: PlanTaskState) => PlanTaskState
): ScratchpadTaskLine[] {
  const subtree = taskSubtree(tasks, index);
  if (subtree.length === 0) return [];
  const base = subtree[0].depth;
  return subtree.map((task) => ({
    depth: Math.max(0, task.depth - base),
    state: map ? map(task.state) : task.state,
    text: task.text,
  }));
}

/**
 * Append task lines to the note. With `section`, they go at the END of the
 * matching '##' section (before the next heading); returns `null` when that
 * section doesn't exist so the caller can report it. Without `section`, they go
 * at the end of the document. Task text is flattened to a single line.
 *
 * `depth` imbrique la tâche sous celle qui la précède (0 = premier niveau) —
 * la seule façon d'AJOUTER une sous-tâche sans réécrire le carnet entier.
 */
export function appendScratchpadTasks(
  content: string,
  tasks: NewTask[],
  section?: string | null
): string | null {
  const block = taskLinesMarkdown(
    tasks.map((task) => ({
      // Pas de renormalisation ici : les profondeurs sont celles voulues par
      // l'appelant, et une première tâche à `depth: 1` reste une sous-tâche de
      // ce qui la précède DÉJÀ dans le carnet.
      depth: Math.max(0, Math.trunc(task.depth ?? 0)),
      state: task.state,
      text: task.text,
    }))
  ).split("\n");
  const lines = content.split("\n");

  if (section && section.trim()) {
    const wanted = section.trim().toLowerCase();
    let fence: string | null = null;
    let headingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const fm = lines[i].match(FENCE);
      if (fm) {
        if (!fence) fence = fm[1];
        else if (fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      }
      if (fence) continue;
      const hm = lines[i].match(HEADING);
      if (hm && hm[1].trim().toLowerCase() === wanted) {
        headingIdx = i;
        break;
      }
    }
    if (headingIdx === -1) return null;

    // Insert before the next heading after this one (fence-aware), else at EOF.
    let insertAt = lines.length;
    fence = null;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      const fm = lines[i].match(FENCE);
      if (fm) {
        if (!fence) fence = fm[1];
        else if (fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      }
      if (fence) continue;
      if (HEADING.test(lines[i])) {
        insertAt = i;
        break;
      }
    }
    // Drop the section's trailing blank lines so the block sits tight under it.
    let end = insertAt;
    while (end > headingIdx + 1 && lines[end - 1].trim() === "") end--;
    return [...lines.slice(0, end), ...block, ...lines.slice(end)].join("\n");
  }

  if (!content.trim()) return block.join("\n") + "\n";
  return content.replace(/\n+$/, "") + "\n" + block.join("\n") + "\n";
}

/**
 * Drop every SETTLED task line — completed ('- [x]') and cancelled ('- [-]'),
 * les deux façons d'en avoir fini avec une tâche — AND collapse any heading
 * section that clearing those tasks leaves empty, so vider une section retire
 * son titre au lieu d'y laisser un intertitre orphelin.
 *
 * MÊME RÈGLE POUR LES SOUS-TÂCHES, un cran plus bas : une tâche cochée qui
 * porte encore du travail RESTE. La retirer laisserait ses sous-tâches
 * suspendues dans le vide — indentées sous plus rien, donc relues au niveau du
 * dessus, ou pire, à partir de quatre espaces, comme un bloc de code. Une tâche
 * ne s'en va donc que si TOUT son sous-arbre est réglé, et elle s'en va alors
 * avec lui. C'est la règle de la hiérarchie, prise par l'autre bout : le parent
 * emporte ses enfants, y compris quand il s'agit de les effacer.
 *
 * A heading is dropped whole (heading + its emptied sub-headings + their blank
 * lines and '---' separators) only when its ENTIRE subtree — down to the next
 * heading of the same or a shallower level — has nothing left worth keeping: no
 * surviving task (pending or in progress), no prose, no code. So a parent with
 * a still-live subsection stays, an emptied subsection goes, and a section with
 * notes under it keeps its title. Fence-aware (a '#' inside a code block is not
 * a heading). `removed` counts the settled TASKS actually dropped (0 → content
 * unchanged).
 */
export function removeSettledTasks(content: string): {
  content: string;
  removed: number;
} {
  const parsed = parsePlan(content);
  const settled = (task: PlanTask) =>
    task.state === "completed" || task.state === "cancelled";
  const settledLines = new Set<number>();
  for (let i = 0; i < parsed.tasks.length; i++) {
    const task = parsed.tasks[i];
    if (!settled(task)) continue;
    // Le sous-arbre entier doit être réglé, sinon la tâche reste : elle porte
    // encore le travail de ses enfants.
    let clear = true;
    for (
      let j = i + 1;
      j < parsed.tasks.length && parsed.tasks[j].depth > task.depth;
      j++
    ) {
      if (!settled(parsed.tasks[j])) {
        clear = false;
        break;
      }
    }
    if (clear) settledLines.add(task.line);
  }
  if (settledLines.size === 0) return { content, removed: 0 };

  const lines = content.split("\n");
  const taskLines = new Set(parsed.tasks.map((task) => task.line));
  const toRemove = new Set<number>(settledLines);

  // Classify each line: is it a heading (and at what level), and does it "keep
  // a section alive" (a surviving task, prose, or code — not a heading, blank,
  // spacer or '---').
  const isHeading: boolean[] = [];
  const level: number[] = [];
  const survives: boolean[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(FENCE);
    if (fm) {
      if (!fence) fence = fm[1];
      else if (fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      isHeading[i] = false;
      level[i] = 0;
      survives[i] = true; // a fence line is real content
      continue;
    }
    if (fence) {
      isHeading[i] = false;
      level[i] = 0;
      survives[i] = true; // inside a code block
      continue;
    }
    const hm = line.match(HEADING_LEVEL);
    if (hm) {
      isHeading[i] = true;
      level[i] = hm[1].length;
      survives[i] = false; // a heading alone keeps nothing alive
      continue;
    }
    isHeading[i] = false;
    level[i] = 0;
    if (taskLines.has(i)) survives[i] = !settledLines.has(i);
    else survives[i] = line.trim() !== "" && !THEMATIC_BREAK.test(line);
  }

  for (let i = 0; i < lines.length; i++) {
    if (!isHeading[i]) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (isHeading[j] && level[j] <= level[i]) {
        end = j;
        break;
      }
    }
    let hasSurvivor = false;
    for (let j = i; j < end; j++) {
      if (survives[j]) {
        hasSurvivor = true;
        break;
      }
    }
    if (!hasSurvivor) for (let j = i; j < end; j++) toRemove.add(j);
  }

  const kept = lines.filter((_, i) => !toRemove.has(i));
  return { content: kept.join("\n"), removed: settledLines.size };
}

/**
 * Labels of the tasks that went from unchecked to CHECKED between two versions
 * of the note — what the stats ledger records (lib/server/scratchpad.ts).
 *
 * The note keeps no history and is deliberately volatile: tasks are added,
 * ticked, then cleared away. So a tick is only ever visible in the transition
 * between two versions, and it has to be told apart from the churn around it:
 *   - a task added ALREADY checked (a pasted list, an agent writing '- [x]')
 *     is not a tick — nobody completed anything;
 *   - deleting a checked task is not an un-tick, and re-adding it later is not
 *     a second one;
 *   - moving a task across sections leaves its state alone.
 * Pairing is by label (the plan module's rule), so renaming a task while
 * ticking it reads as a delete + an already-checked add, and is not counted.
 */
export function tasksCheckedOff(
  before: string | null | undefined,
  after: string | null | undefined
): string[] {
  return diffPlanTasks(before, after)
    .filter((t) => t.to === "completed")
    .map((t) => t.text);
}
