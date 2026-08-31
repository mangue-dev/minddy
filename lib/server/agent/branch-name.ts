/**
 * Convention for work branches created by the agent.
 *
 * A ticket is identified by its key (`MIN-42`). A conversation without a ticket
 * does not have an equivalent key: its title, then its first prompt, gives the
 * human label. The account chooses the prefix; the default is `numo/`.
 */

const MAX_LABEL_LENGTH = 72;
export const DEFAULT_AGENT_BRANCH_PREFIX = "numo/";
const MAX_PREFIX_LENGTH = 128;

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

/**
 * Canonical account-level prefix. A trailing slash is implied so the setting
 * remains pleasant to type while every generated name has the same shape.
 */
export function normalizeAgentBranchPrefix(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const prefix = `${trimmed.replace(/\/+$/g, "")}/`;
  if (prefix.length > MAX_PREFIX_LENGTH) return null;
  return isValidGitBranchName(`${prefix}branch`) ? prefix : null;
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
  branchPrefix?: string | null;
}): string {
  const label =
    input.issueIdentifier?.trim() ||
    input.conversationTitle?.trim() ||
    input.prompt?.trim() ||
    "agent";
  const prefix = normalizeAgentBranchPrefix(input.branchPrefix) ?? DEFAULT_AGENT_BRANCH_PREFIX;
  return `${prefix}${slugForAgentBranch(label)}-${input.runId.slice(0, 8)}`;
}
