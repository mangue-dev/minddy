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
// Portée UNE TÂCHE : la ligne arrive précédée des titres de sa section (le seul
// canal pour l'agent, cf. splitTaskSection) ; le prompt les sort du bloc
// <notes> et les nomme en clair — sans eux, une tâche isolée perd son contexte.

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

/**
 * Une tâche copiée ou lancée depuis le carnet voyage AVEC ses sections : le
 * markdown porté est la chaîne de titres qui la contient (telle quelle, niveaux
 * compris, cf. sectionHeadingChain) suivie de la SEULE ligne de tâche — voir
 * scratchpad-task.tsx. On la redécoupe ici pour la nommer en clair dans le
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
 * eux, un vrai bout de note. Tout autre contenu (pas de titre, de la prose,
 * plusieurs tâches) ressort inchangé, sans section.
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
  if (rest.length !== 1 || !TASK_LINE.test(rest[0])) {
    return { section: null, body: notes, isTask: false };
  }
  return {
    section: titles.length > 0 ? titles.join(SECTION_SEPARATOR) : null,
    body: rest[0],
    isTask: true,
  };
}

export function buildScratchpadPrompt(
  notes: string,
  opts?: { section?: boolean; mcp?: boolean }
): string {
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
These are rough, personal working notes — a quick to-do list I jotted down, not a formal spec. Checkbox lines are to-do items: '- [ ]' means to do, '- [~]' in progress, '- [x]' done, '- [-]' dropped. Some items may be terse or ambiguous. If anything is unclear or you need more detail before acting, ask me first rather than guessing.${withMcp ? `\n\n${mcpBlock}` : ""}`;
}
