// « Copier le prompt » / « lancer un agent » depuis une TÂCHE DE PAGE (MIN-274)
// — le pendant de lib/scratchpad-prompt.ts, pour l'autre surface qui porte des
// tâches.
//
// Le squelette est le même, et il le reste volontairement : une tâche est le
// même objet des deux côtés, et son prompt doit se lire pareil. Trois choses
// seulement changent, et ce sont les trois que la page sait et que le carnet
// ignore :
//
//  - le document a un NOM, et le nom est du contexte : « relancer le cron »
//    dans « Post-mortem du 3 mars » n'est pas la même tâche que dans
//    « Idées » ;
//  - une page n'est pas un brouillon personnel. Le cadrage du carnet
//    (« notes floues, demande plutôt que deviner ») dirait faux ici : une page
//    de projet est écrite pour être lue ;
//  - les outils MCP ne sont pas les mêmes — `minddy_get_page` et
//    `minddy_edit_page_text` (MIN-273), pas `minddy_get_scratchpad`.
//
// L'OUVERTURE, elle, est identique au carnet (« Work through … » puis le bloc
// `<notes>`), et ce n'est pas cosmétique : c'est la signature que lit
// `isScratchpadPrompt`, donc ce qui empêche le serveur d'emballer une seconde
// fois un prompt déjà emballé quand il part par le composer de la page Agents.

import { isScratchpadPrompt, splitTaskSection } from "@/lib/scratchpad-prompt";

export interface PageTaskPromptOptions {
  /** Le titre de la page d'où sort la tâche. */
  page: string;
  /** Le bloc MCP. `false` pour le run Numo, qui a déjà ses outils de page. */
  mcp?: boolean;
}

/**
 * Le prompt d'une tâche de page — prêt à coller dans n'importe quel agent, et
 * TOUJOURS en anglais quelle que soit la locale de l'UI (même règle que
 * lib/issue-prompt.ts et lib/scratchpad-prompt.ts).
 *
 * `markdown` est ce que porte la tâche quand elle sort de la page : les titres
 * des sections qui la contiennent, puis la tâche et ses sous-tâches. On les
 * redécoupe avec `splitTaskSection` pour sortir la section du bloc `<notes>` et
 * la nommer en clair — un titre de section n'est pas du travail à faire.
 */
export function buildPageTaskPrompt(
  markdown: string,
  opts: PageTaskPromptOptions
): string {
  // Emballer un prompt déjà emballé n'ajoute rien et brouille tout : on rend le
  // texte tel quel, comme le fait `buildScratchpadPrompt`.
  if (isScratchpadPrompt(markdown)) return markdown.trim();

  const page = opts.page.trim();
  const withMcp = opts.mcp !== false;
  const { section, body, isTask } = splitTaskSection(markdown.trim());

  const from = page ? ` from the page “${page}”` : " from a page";
  const target = isTask
    ? `the following task${from} of my project`
    : `the following excerpt${from} of my project`;
  // La section n'est PAS laissée dans <notes> : le bloc reste la tâche seule, et
  // son appartenance est dite en clair juste après.
  const sectionNote = section
    ? `\nThis task is under the heading "${section}" of that page.\n`
    : "";

  const mcpBlock = `Optionally, if the minddy MCP tools are available in your environment:
- This task comes from a page of a minddy project. Read the whole, current page with \`minddy_get_page\` before changing anything — it may have moved on since this was copied, and the rest of the page is the context this task was written in.
- As you finish items, tick them off on the page itself with \`minddy_edit_page_text\` (\`- [ ]\` → \`- [x]\`, \`- [~]\` while you are on it) so the page stays in sync.
If the minddy MCP tools are not available, that's fine — just work from the task above.`;

  return `Work through ${target}.

<notes>
${body}
</notes>
${sectionNote}
This comes from a project page — a written document, not a formal spec, so some of it may be shorthand between people who share the context. Checkbox lines are to-do items: '- [ ]' means to do, '- [~]' in progress, '- [x]' done, '- [-]' dropped. An indented checkbox line is a sub-task of the line above it, at any depth: finishing a parent means finishing everything nested under it. If anything is unclear or you need more detail before acting, ask me first rather than guessing.${withMcp ? `\n\n${mcpBlock}` : ""}`;
}
