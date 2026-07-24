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

import { stripScratchpadSpacers } from "@/lib/scratchpad";

export function buildScratchpadPrompt(
  notes: string,
  opts?: { section?: boolean; mcp?: boolean }
): string {
  const isSection = opts?.section === true;
  const withMcp = opts?.mcp !== false;
  const target = isSection
    ? "the following section of my working notes"
    : "my working notes below";

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
${stripScratchpadSpacers(notes).trim()}
</notes>

These are rough, personal working notes — a quick to-do list I jotted down, not a formal spec. Checkbox lines are to-do items: '- [ ]' means to do, '- [~]' in progress, '- [x]' done, '- [-]' dropped. Some items may be terse or ambiguous. If anything is unclear or you need more detail before acting, ask me first rather than guessing.${withMcp ? `\n\n${mcpBlock}` : ""}`;
}
