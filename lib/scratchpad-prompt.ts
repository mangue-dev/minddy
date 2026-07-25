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
// Portée UNE TÂCHE : la ligne arrive précédée du titre de sa section (le seul
// canal pour l'agent, cf. splitTaskSection) ; le prompt sort la section du bloc
// <notes> et la nomme en clair — sans elle, une tâche isolée perd son contexte.

import { stripScratchpadSpacers } from "@/lib/scratchpad";

const HEADING_LINE = /^ {0,3}(#{1,6})\s+(.*)$/;
const TASK_LINE = /^\s*[-*+]\s+\[[ xX~-]\]\s+\S/;

/**
 * Une tâche copiée ou lancée depuis le carnet voyage AVEC sa section : le
 * markdown porté est le titre de la section (tel quel, niveau compris) suivi de
 * la SEULE ligne de tâche — voir scratchpad-task.tsx. On le redécoupe ici pour
 * nommer la section en clair dans le prompt : « - [ ] relancer le cron » n'est
 * pas la même tâche selon qu'elle vit sous « Déploiement » ou sous « Idées ».
 *
 * C'est le seul canal disponible pour le run CARNET de numo : sa note est un
 * simple texte (éditable dans le composer, stocké en `agent_runs.prompt`), donc
 * la section doit voyager dedans — et le serveur la redécoupe avec cette même
 * fonction. Prompt copié et prompt de l'agent sont ainsi identiques.
 *
 * Tout autre contenu (pas de titre, de la prose, plusieurs tâches) ressort
 * inchangé, sans section.
 */
export function splitTaskSection(notes: string): {
  section: string | null;
  body: string;
  isTask: boolean;
} {
  const lines = notes.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first === -1) return { section: null, body: notes, isTask: false };

  const heading = lines[first].match(HEADING_LINE);
  if (!heading) {
    const only = lines.filter((line) => line.trim() !== "");
    return {
      section: null,
      body: notes,
      isTask: only.length === 1 && TASK_LINE.test(only[0]),
    };
  }

  const rest = lines.slice(first + 1).filter((line) => line.trim() !== "");
  const title = heading[2].trim();
  if (!title || rest.length !== 1 || !TASK_LINE.test(rest[0])) {
    return { section: null, body: notes, isTask: false };
  }
  return { section: title, body: rest[0], isTask: true };
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
