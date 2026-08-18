import { posix as posixPath } from "node:path";

/**
 * Code Agent path validation (MIN-46). PURE and testable — the
 * logic is safety-critical (prevents a `../../x` path from leaving the cloned repository).
 */

/**
 * Resolves `relPath` under `baseDir` by normalizing `..`, and RISES if the result leaves
 * of `baseDir`. `baseDir` must be a POSIX absolute path without trailing slash.
 */
export function resolveWithin(baseDir: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+/, "");
  const resolved = posixPath.normalize(`${baseDir}/${cleaned}`);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}/`)) {
    throw new Error(`Path escapes the repository: ${relPath}`);
  }
  return resolved;
}

/**
 * Resolves a READ path (MIN-107): either in the repository (`resolveWithin`),
 * or under one of the `readableDirs` — microVM folders outside the repository where the
 * harness deposits things to be reread (the long outputs of `run_command`).
 * The path must be given ABSOLUTE to target a `readableDir`: everything else
 * remains relative to the repository, as before. A `..` which would come out of the targeted folder LEAVE
 * — we never open the filesystem, we name exceptions.
 * WRITINGs never pass through here (cf. `assertNotGit` / `writablePath`).
 */
export function resolveReadable(
  baseDir: string,
  readableDirs: string[],
  path: string,
): string {
  for (const dir of readableDirs) {
    if (path !== dir && !path.startsWith(`${dir}/`)) continue;
    const resolved = posixPath.normalize(path);
    if (resolved !== dir && !resolved.startsWith(`${dir}/`)) {
      throw new Error(`Path escapes the readable directory: ${path}`);
    }
    return resolved;
  }
  return resolveWithin(baseDir, path);
}

/**
 * Raises if `absPath` (already resolved under `baseDir`) targets a `.git/` — writes
 * prohibited.
 *
 * ─────────────────────── ─────────────────────── ───────────────────────────────
 * TWO ENLARGEMENTS THAT THE ACTUAL DISK IMPOSES (MIN-360)
 *
 * The comparison was a raw prefix on the root of the repository, and it held as long as
 * that the repository was a disposable clone on a microVM ext4:
 *
 * - **case.** APFS is case insensitive: `.GIT/hooks/pre-commit` designates
 * exactly the same file as `.git/hooks/pre-commit`, and was not recognized.
 * We therefore fold the two sides before comparing;
 * - **the depth.** Only the `.git` of the ROOT was kept. A repository carries
 * others (submodules, nested repository, test fixture), and a hook has
 * exactly the same power. A `.git` segment is therefore refused **wherever it is**
 * in the path.
 *
 * Which is NOT here, and which must be said: the symbolic link. `ln -s` is not seen
 * by any guardrail, and a link created IN the repository satisfies this validation
 * while pointing elsewhere. It requires the disk, so `realpath`, therefore an asynchronous function — it lives in [vm/local-guard.ts](vm/local-guard.ts), and
 * is applied by the supervisor. This remains pure.
 */
export function assertNotGit(baseDir: string, absPath: string, relPath: string): void {
  const base = baseDir.toLowerCase();
  const target = absPath.toLowerCase();
  // We only inspect what is UNDER the deposit: the root is given by
  // the harness, and a `.git` that would be there would not come from the model.
  const inside =
    target === base ? "" : target.startsWith(`${base}/`) ? target.slice(base.length + 1) : target;
  if (inside.split("/").includes(".git")) {
    throw new Error(`Refusing to write inside .git: ${relPath}`);
  }
}
