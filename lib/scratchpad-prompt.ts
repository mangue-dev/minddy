// “Copy the prompt” for the scratchpad — same spirit as lib/issue-prompt.ts:
// a prompt ready to paste into any agent (Claude Code, Cursor…).
// ALWAYS in English, regardless of the UI locale. The text of the note
// is reproduced as is (raw format assumed); everything around it is
// English and warns the agent that the notes are unclear → ask if necessary.
// The note is short: we inline it directly (unlike the issue plan).
//
// Same structure for numo's CARNET run (MIN-84): the agent's boot passes
// by this wrapper with `mcp: false` — the MCP block has no meaning for it, its
// native tools (read_scratchpad / update_scratchpad_task) replace it, but
// framing “these are notes, not a spec; ask before guessing” is the
// same as for an external agent.
//
// Scope A TASK: the task — and its subtasks, if any — arrives
// preceded by the titles of its section (the only channel for the agent, cf.
// splitTaskSection); the prompt takes them out of the <notes> block and names them in plain text —
// without them, an isolated task loses its context.

import { stripScratchpadSpacers } from "@/lib/scratchpad";

const HEADING_LINE = /^ {0,3}(#{1,6})\s+(.*)$/;
const TASK_LINE = /^\s*[-*+]\s+\[[ xX~-]\]\s+\S/;

/** What separates the titles of a string of sections, once named in plain text. */
const SECTION_SEPARATOR = " > ";

/**
 * The title string that CONTAINS a task, from widest to narrowest, read
 * in the titles that precede it (document order, level + raw text).
 * Returns markdown title lines ready to precede the task.
 *
 * A task lives in its section AND in all those that include it: exit
 * from the notebook with the only closest title, "## Sidebar" does not say what
 * — "# Pull requests" above says so. We therefore go back from title to title in
 * keeping only those of rank STRICTLY higher than the last retained: a
 * title of the same rank (or deeper) is a brother, or the content of a brother,
 * and does not include anything.
 *
 * An EMPTY title does not does not name himself, but still closes his rank: what he carries
 * has no section at this level, only the titles above him.
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

/** Indent width of a line, tab counted for four columns —
 * the same reading as `parsePlan` (lib/plan.ts). */
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
 * A task copied or launched from the travel notebook WITH its sections: the
 * markdown carried is the title chain which contains it (as is, levels
 * included, see sectionHeadingChain) followed by the task and ITS SUB-TASKS —
 * see scratchpad-task.tsx. We redivide it here to name it clearly in the
 * prompt: "- [ ] restart the cron" is not the same task depending on whether it lives
 * under "Deployment" or under "Ideas", and "Sidebar" means nothing without
 * the "Pull requests" which includes it - hence the entire path, joined by " >".
 *
 * This is the only channel available for numo's CARNET run: its note is a
 * simple text (editable in the composer, stored in `agent_runs.prompt`), so
 * the section must travel in it — and the server recuts it with this same
 * function. Copied prompt and agent prompt are thus identical.
 *
 * The head titles must NEST (strictly increasing ranks): this is
 * what a chain of sections produces, and two titles of the same rank describe,
 * them, a real piece of note.
 *
 * The following must be ONE task — in the sense of the notebook hierarchy: a
 * task line, plus, optionally, its subtasks, all indented MORE
 * DEEP than it. Two tasks of the same level are not a task, they are
 * a piece of note: they emerge unchanged, without section, like any other
 * subject (no title, prose).
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
 * Is this text ALREADY a packed notebook prompt? Since MIN-84 the composer
 * of the Agents page is pre-filled with the COMPLETE prompt (and no longer the raw
 * note): what we read before sending is exactly what the agent receives.
 * The server always packages the request for a run notebook — it must therefore
 * let it pass which already is, otherwise the prompt would end up nested
 * twice.
 */
export function isScratchpadPrompt(text: string): boolean {
  return BUILT_PROMPT_OPENING.test(text.trim());
}

export function buildScratchpadPrompt(
  notes: string,
  opts?: { section?: boolean; mcp?: boolean }
): string {
  // Wrapping an already wrapped prompt adds nothing and confuses everything: we return the
  // text as is. This is what makes the function safe to call from both sides
  // (compose client AND lib/server/agent/execute.ts) without coordinating.
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
  // The section is NOT left in <notes>: the block remains the task alone, and
  // its membership is clearly stated immediately after.
  const sectionNote = section
    ? `\nThis task is from the section named "${section}".\n`
    : "";

  // The MCP is a PLUS, never a prerequisite. For one section, we prohibit
  // blind replacement (set overwrites the WHOLE document): reread first.
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
