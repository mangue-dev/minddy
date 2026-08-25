/**
 * Convention for work branches created by the agent.
 *
 * A ticket is identified by its key (`MIN-42`). A conversation without a ticket
 * does not have an equivalent key: its title, then its first prompt, gives the
 * human label. The prefix always remains `agent`, never `note` — the notebook
 * is just an entry point into Numo's conversations.
 */

const MAX_LABEL_LENGTH = 72;

/**
 * Pure equivalent of `git check-ref-format --branch` for an untrusted branch
 * received over the control plane. Keeping it pure makes the PR boundary
 * testable without asking the repository to interpret the candidate first.
 */
export function isValidGitBranchName(branch: string): boolean {
  if (!branch || branch.length > 255 || branch === "@" || branch.startsWith("-")) return false;
  if (branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".")) return false;
  if (branch.includes("//") || branch.includes("..") || branch.includes("@{")) return false;
  for (const char of branch) {
    const code = char.charCodeAt(0);
    if (code <= 32 || code === 127 || "~^:?*[\\".includes(char)) return false;
  }
  return branch
    .split("/")
    .every((part) => part && !part.startsWith(".") && !part.endsWith(".lock"));
}

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
