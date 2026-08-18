// “Copy prompt” / “launch an agent” from a PAGE TASK (MIN-274)
// — the counterpart of lib/scratchpad-prompt.ts, for the other surface which carries
// tasks.
//
// The skeleton is the same, and it remains that way voluntarily: a task is the
// same object on both sides, and its prompt should read the same. Three things
// only change, and these are the three that the page knows and that the notebook
// ignore :
//
// - the document has a NAME, and the name is in context: “restart cron”
// in “Post-mortem of March 3” is not the same task as in
// “Ideas”;
// - a page is not a personal draft. The framing of the notebook
// (“fuzzy notes, ask rather than guess”) would say wrong here: a page
// project is written to be read;
// - MCP tools are not the same — `minddy_get_page` and
//    `minddy_edit_page_text` (MIN-273), pas `minddy_get_scratchpad`.
//
// THE OPENING is identical to the notebook (“Work through…” then the block
// `<notes>`), and it's not cosmetic: it's the signature that reads
// `isScratchpadPrompt`, so what prevents the server from packing a second
// once a prompt is already packaged when it leaves by composing it from the Agents page.

import { isScratchpadPrompt, splitTaskSection } from "@/lib/scratchpad-prompt";

export interface PageTaskPromptOptions {
  /** The title of the page from which the task comes. */
  page: string;
  /** The MCP block. `false` for the Numo run, which already has its page tools. */
  mcp?: boolean;
}

/**
 * The prompt of a page task — ready to paste into any agent, and
 * ALWAYS in English regardless of the UI locale (same rule as
 * lib/issue-prompt.ts and lib/scratchpad-prompt.ts).
 *
 * `markdown` is what the task carries when it leaves the page: the titles
 * of the sections that contain it, then the task and its subtasks. We recut them with `splitTaskSection` to remove the section from the block `<notes>` and name it in plain text — a section title is not work to be done.
 */
export function buildPageTaskPrompt(
  markdown: string,
  opts: PageTaskPromptOptions
): string {
  // Wrapping an already wrapped prompt adds nothing and confuses everything: we return the
  // text as is, like `buildScratchpadPrompt` does.
  if (isScratchpadPrompt(markdown)) return markdown.trim();

  const page = opts.page.trim();
  const withMcp = opts.mcp !== false;
  const { section, body, isTask } = splitTaskSection(markdown.trim());

  const from = page ? ` from the page “${page}”` : " from a page";
  const target = isTask
    ? `the following task${from} of my project`
    : `the following excerpt${from} of my project`;
  // The section is NOT left in <notes>: the block remains the task alone, and
  // its membership is clearly stated immediately after.
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
