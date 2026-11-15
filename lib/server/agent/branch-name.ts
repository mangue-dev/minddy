/**
 * Pure equivalent of `git check-ref-format --branch` for a branch name an
 * untrusted caller supplies (the skills routes take a ref from the request).
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
