// ── Slash commands of Numo's composer (MIN-159) ─────────────────────
//
// A command is chosen in the slash menu of the composer; its CANONICAL id
// travel through the query (the label is localized — “/create issue” /
// “/create ticket”) and persists on `metadata.command` of the message
// user. When building the model messages, the route unfolds
// the instruction block id hooked to THIS message — exactly the mechanics
// mentionsNote: the block survives in history since it is recalculated
// from the metadata, and the response turn to ask_user therefore keeps the
// command context.

import type { AssistantCommandId } from "@/lib/assistant-types";

// The instructions only impose the PROCEDURE of the guided flow: the content of the
// fields (estimated priority/effort, no status, categories, etc.) fall under
// issue creation rules already present in the system prompt.
const CREATE_ISSUE_NOTE = `[Command: the user invoked the guided issue-creation flow (the "/create issue" slash command). For THIS request:
1. Draft ONE issue from the text after the command and from the page context, filling every field your issue-creation rules let you justify.
2. If something essential is missing or ambiguous — no clear goal to title the issue, or several plausible scopes — collect it with ONE bundled ask_user call (goal, priority, effort, objective… only what is actually missing). Skip anything the message or context already answers; if nothing essential is missing, ask nothing and create directly.
3. Without a project scope (global mode), resolve the target project first via list_projects; if ambiguous, make the project one of the ask_user questions.
4. Then call create_issue and confirm with the issue's identifier.]`;

// MIN-932: Numo looks for what fell through the cracks, as a ready-made task.
// The tool gives candidates; the note keeps the answer a short, useful list.
const FIND_ISOLATED_NOTE = `[Command: the user asked you to find isolated items (the "/find isolated" slash command). For THIS request:
1. Scope: the project in context; in global mode, the projects the text names, otherwise the user's projects from list_projects (at most 5, the most recently active first).
2. Call find_isolated_items for each project in scope.
3. Keep only real findings: the forgotten issues it lists, and the pages whose excerpt describes work to do (a fix, a problem, a task). Drop notes, references and finished specs.
4. Answer with a short list grouped by project: each item a typed mention and a few words on why it is isolated ("idle for 45 days", "describes a login bug, no issue"). Eight items at most in all; no statistics, no audit. When nothing is isolated, say so in one sentence.
5. Offer to create issues for the pages, or to plan or close the forgotten issues, and do nothing until the user agrees.]`;

const COMMAND_NOTES: Record<AssistantCommandId, string> = {
  "create-issue": CREATE_ISSUE_NOTE,
  "find-isolated": FIND_ISOLATED_NOTE,
};

/** The order id sent by the client, strictly validated — everything else
 * of the request body is already free text, not him. */
export function parseCommand(raw: unknown): AssistantCommandId | undefined {
  return typeof raw === "string" && raw in COMMAND_NOTES
    ? (raw as AssistantCommandId)
    : undefined;
}

/** The instruction block attached to the message carrying the command, recalculated
 * from its persisted metadata (same contract as mentionsNote). */
export function commandNote(metadata: unknown): string {
  const command = parseCommand(
    (metadata as { command?: unknown } | null)?.command
  );
  return command ? `\n\n${COMMAND_NOTES[command]}` : "";
}
