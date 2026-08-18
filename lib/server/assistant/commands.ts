// ── Commandes « / » du composer de Numo (MIN-159) ────────────────────
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

const COMMAND_NOTES: Record<AssistantCommandId, string> = {
  "create-issue": CREATE_ISSUE_NOTE,
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
