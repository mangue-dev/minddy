/**
 * Convention for work branches created by the agent.
 *
 * A ticket is identified by its key (`MIN-42`). A conversation without a ticket
 * does not have an equivalent key: its title, then its first prompt, gives the
 * human label. The prefix always remains `agent`, never `note` — the notebook
 * is just an entry point into Numo's conversations.
 */

const MAX_LABEL_LENGTH = 72;

export function slugForAgentBranch(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/-+$/g, "");
  return slug || "agent";
}

export function generatedAgentBranchName(input: {
  runId: string;
  issueIdentifier?: string | null;
  conversationTitle?: string | null;
  prompt?: string | null;
}): string {
  const label =
    input.issueIdentifier?.trim() ||
    input.conversationTitle?.trim() ||
    input.prompt?.trim() ||
    "agent";
  return `minddy/agent/${slugForAgentBranch(label)}-${input.runId.slice(0, 8)}`;
}
