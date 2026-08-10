// « Copier le prompt » pour le scratchpad — même esprit que lib/issue-prompt.ts :
// un prompt prêt à coller dans n'importe quel agent (Claude Code, Cursor…).
// TOUJOURS en anglais, quelle que soit la locale de l'UI. Le texte de la note
// est repris tel quel (format brut assumé) ; tout ce qui l'entoure est en
// anglais et prévient l'agent que les notes sont floues → demander si besoin.
// La note est courte : on l'inline directement (contrairement au plan d'issue).
//
// Même structure pour le run CARNET de numo (MIN-84) : l'amorce de l'agent passe
// par ce wrapper avec `mcp: false` — le bloc MCP n'a pas de sens pour lui, ses
// tools natifs (read_scratchpad / update_scratchpad_task) le remplacent, mais le
// cadrage « ce sont des notes, pas une spec ; demande avant de deviner » est le
// même que pour un agent externe.
//
// Portée UNE TÂCHE : la tâche — et ses sous-tâches, s'il y en a — arrive
// précédée des titres de sa section (le seul canal pour l'agent, cf.
// splitTaskSection) ; le prompt les sort du bloc <notes> et les nomme en clair —
// sans eux, une tâche isolée perd son contexte.

import { stripScratchpadSpacers } from "@/lib/scratchpad";

const HEADING_LINE = /^ {0,3}(#{1,6})\s+(.*)$/;
const TASK_LINE = /^\s*[-*+]\s+\[[ xX~-]\]\s+\S/;

/** Ce qui sépare les titres d'une chaîne de sections, une fois nommée en clair. */
const SECTION_SEPARATOR = " > ";

/**
 * La chaîne de titres qui CONTIENT une tâche, du plus large au plus étroit, lue
 * dans les titres qui la précèdent (ordre du document, niveau + texte bruts).
 * Retourne des lignes de titre markdown prêtes à précéder la tâche.
 *
 * Une tâche vit dans sa section ET dans toutes celles qui l'englobent : sortie
 * du carnet avec le seul titre le plus proche, « ## Sidebar » ne dit pas de quoi
 * — « # Pull requests » au-dessus le dit. On remonte donc de titre en titre en
 * ne gardant que ceux de rang STRICTEMENT plus haut que le dernier retenu : un
 * titre de même rang (ou plus profond) est un frère, ou le contenu d'un frère,
 * et n'englobe rien.
 *
 * Un titre VIDE ne se nomme pas, mais ferme quand même son rang : ce qu'il porte
 * n'a pas de section à ce niveau-là, seulement les titres au-dessus de lui.
 */
export function sectionHeadingChain(
  headings: Array<{ level: number; text: string }>
): string[] {
  const chain: string[] = [];
  let deepest = 7;
  for (let i = headings.length - 1; i >= 0; i--) {
    const level = Math.min(6, Math.max(1, Math.trunc(headings[i].level) || 2));
    if (level >= deepest) continue;
    deepest = level;
    const text = headings[i].text.trim();
    if (text) chain.unshift(`${"#".repeat(level)} ${text}`);
    if (level === 1) break; // rien n'englobe un titre de premier rang
  }
  return chain;
}

/** Largeur d'indentation d'une ligne, tabulation comptée pour quatre colonnes —
 *  la même lecture que `parsePlan` (lib/plan.ts). */
function indentWidth(line: string): number {
  let cols = 0;
  for (const ch of line) {
    if (ch === " ") cols += 1;
    else if (ch === "\t") cols += 4;
    else break;
  }
  return cols;
}

/**
 * Une tâche copiée ou lancée depuis le carnet voyage AVEC ses sections : le
 * markdown porté est la chaîne de titres qui la contient (telle quelle, niveaux
 * compris, cf. sectionHeadingChain) suivie de la tâche et de SES SOUS-TÂCHES —
 * voir scratchpad-task.tsx. On la redécoupe ici pour la nommer en clair dans le
 * prompt : « - [ ] relancer le cron » n'est pas la même tâche selon qu'elle vit
 * sous « Déploiement » ou sous « Idées », et « Sidebar » ne veut rien dire sans
 * le « Pull requests » qui l'englobe — d'où le chemin entier, joint par « > ».
 *
 * C'est le seul canal disponible pour le run CARNET de numo : sa note est un
 * simple texte (éditable dans le composer, stocké en `agent_runs.prompt`), donc
 * la section doit voyager dedans — et le serveur la redécoupe avec cette même
 * fonction. Prompt copié et prompt de l'agent sont ainsi identiques.
 *
 * Les titres de tête doivent s'EMBOÎTER (rangs strictement croissants) : c'est
 * ce que produit une chaîne de sections, et deux titres de même rang décrivent,
 * eux, un vrai bout de note.
 *
 * Ce qui suit doit être UNE tâche — au sens de la hiérarchie du carnet : une
 * ligne de tâche, plus, éventuellement, ses sous-tâches, toutes indentées PLUS
 * PROFOND qu'elle. Deux tâches de même niveau ne sont pas une tâche, elles sont
 * un bout de note : elles ressortent inchangées, sans section, comme toute autre
 * matière (pas de titre, de la prose).
 */
export function splitTaskSection(notes: string): {
  section: string | null;
  body: string;
  isTask: boolean;
} {
  const lines = notes.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return { section: null, body: notes, isTask: false };

  const titles: string[] = [];
  let level = 0;
  let i = 0;
  for (; i < lines.length; i++) {
    const heading = lines[i].match(HEADING_LINE);
    if (!heading) break;
    const title = heading[2].trim();
    if (!title || heading[1].length <= level) {
      return { section: null, body: notes, isTask: false };
    }
    level = heading[1].length;
    titles.push(title);
  }

  const rest = lines.slice(i);
  const rootIndent = rest.length > 0 ? indentWidth(rest[0]) : 0;
  const isTask =
    rest.length > 0 &&
    rest.every((line) => TASK_LINE.test(line)) &&
    rest.slice(1).every((line) => indentWidth(line) > rootIndent);
  if (!isTask) return { section: null, body: notes, isTask: false };
  return {
    section: titles.length > 0 ? titles.join(SECTION_SEPARATOR) : null,
    body: rest.join("\n"),
    isTask: true,
  };
}

/**
 * L'ouverture que produit `buildScratchpadPrompt` : « Work through … » suivi du
 * bloc <notes>. Elle sert de SIGNATURE — voir l'idempotence ci-dessous.
 */
const BUILT_PROMPT_OPENING = /^Work through [^\n]*\n\n<notes>\n/;

/**
 * Ce texte est-il DÉJÀ un prompt de carnet emballé ? Depuis MIN-84 le composer
 * de la page Agents est pré-rempli avec le prompt COMPLET (et non plus la note
 * brute) : ce qu'on lit avant d'envoyer est exactement ce que l'agent reçoit.
 * Le serveur, lui, emballe toujours la demande d'un run carnet — il doit donc
 * laisser passer ce qui l'est déjà, sinon le prompt se retrouverait emboîté
 * deux fois.
 */
export function isScratchpadPrompt(text: string): boolean {
  return BUILT_PROMPT_OPENING.test(text.trim());
}

export function buildScratchpadPrompt(
  notes: string,
  opts?: { section?: boolean; mcp?: boolean }
): string {
  // Emballer un prompt déjà emballé n'ajoute rien et brouille tout : on rend le
  // texte tel quel. C'est ce qui rend la fonction sûre à appeler des deux côtés
  // (composer client ET lib/server/agent/execute.ts) sans se coordonner.
  if (isScratchpadPrompt(notes)) return notes.trim();

  const isSection = opts?.section === true;
  const withMcp = opts?.mcp !== false;
  const { section, body, isTask } = splitTaskSection(
    stripScratchpadSpacers(notes).trim()
  );
  const target = isTask
    ? "the following task from my working notes"
    : isSection
      ? "the following section of my working notes"
      : "my working notes below";
  // La section n'est PAS laissée dans <notes> : le bloc reste la tâche seule, et
  // son appartenance est dite en clair juste après.
  const sectionNote = section
    ? `\nThis task is from the section named "${section}".\n`
    : "";

  // Le MCP est un PLUS, jamais un prérequis. Pour une section, on interdit le
  // remplacement aveugle (set écrase TOUT le document) : relire d'abord.
  const mcpBlock = isSection
    ? `Optionally, if the minddy MCP tools are available in your environment:
- These notes are one section of a larger personal scratchpad. Read the full, current notes with \`minddy_get_scratchpad\` before changing anything.
- If you update them, save the WHOLE document with \`minddy_set_scratchpad\` and preserve every other section — only tick off what you finished here.
If the minddy MCP tools are not available, that's fine — just work from the section above.`
    : `Optionally, if the minddy MCP tools are available in your environment:
- Read the current version of these notes with \`minddy_get_scratchpad\` first — they may have changed since this was copied.
- As you finish items, tick them off and save the updated notes with \`minddy_set_scratchpad\` so the list stays in sync.
If the minddy MCP tools are not available, that's fine — just work from the notes above.`;

  return `Work through ${target}.

<notes>
${body}
</notes>
${sectionNote}
These are rough, personal working notes — a quick to-do list I jotted down, not a formal spec. Checkbox lines are to-do items: '- [ ]' means to do, '- [~]' in progress, '- [x]' done, '- [-]' dropped. An indented checkbox line is a sub-task of the line above it, at any depth: finishing a parent means finishing everything nested under it. Some items may be terse or ambiguous. If anything is unclear or you need more detail before acting, ask me first rather than guessing.${withMcp ? `\n\n${mcpBlock}` : ""}`;
}
