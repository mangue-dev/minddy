import { formatServedInstructions, REPO_INSTRUCTION_FILES, type RepoInstructionFile } from "../repo-instructions";
import { PR_BASE_TAG, readFileAtRef, readWorkFile, type RepoHost } from "../repo-host";

/** Review conventions come from the immutable base, never a contributor's head. */
export async function nativeRepositoryInstructions(host: RepoHost, review: boolean): Promise<string> {
  const inventory = await host.exec(review ? `git ls-tree -r --name-only ${PR_BASE_TAG}` : "git ls-files --cached --others --exclude-standard", { timeoutMs: 15_000 });
  if (inventory.exitCode !== 0) return "";
  const files = [...new Set(inventory.stdout.split("\n"))].filter((path) => path.split("/").length <= 6 && REPO_INSTRUCTION_FILES.includes(path.split("/").at(-1) as typeof REPO_INSTRUCTION_FILES[number])).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)).slice(0, 20);
  const read = await Promise.all(files.map(async (path): Promise<RepoInstructionFile | null> => {
    const content = await (review ? readFileAtRef(host, PR_BASE_TAG, path) : readWorkFile(host, path)).catch(() => null);
    return content?.trim() ? { path, content } : null;
  }));
  return formatServedInstructions(read.filter((file): file is RepoInstructionFile => file !== null)) ?? "";
}
