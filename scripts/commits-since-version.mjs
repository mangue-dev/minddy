import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** `git <args>` in the repository, or `null` if the command fails (not a repository,
 * tag missing, truncated history…). Never throw: this measure is a
 * display comfort, it does not have to cause a build to fail. */
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The number of commits between the current version and HEAD — that is to say the
 * number of times the code has moved since the last public release.
 *
 * The result separates preview and production on its own, without knowing anything about
 * the environment: the public workflow tags `v<version>` on the promoted
 * `production` SHA. A
 * Cloud deployment can be placed on this tag (→ 0) or on more recent commits (→ 1, 2, 3…). It's the history of the built commit that responds, not
 * `VERCEL_ENV`.
 *
 * **On Vercel, it requires `VERCEL_DEEP_CLONE=1` in the project variables**
 * (preview AND production): the build clone is otherwise a `--depth=10`, where
 * neither the tag nor the bump commit are reachable beyond ten commits.
 * Without the variable, the measurement falls to 0 and the app displays the bare version —
 * the same screen as before this feature, never a false account.
 *
 * @param {string} [version] version read in package.json by default
 * @returns {number} 0 when the history does not allow to conclude
 */
export function commitsSinceVersion(version) {
  const v =
    version ??
    JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  if (!v) return 0;

  // The release tag first: the public workflow places it on the commit whose
  // package.json carries this version.
  let base = git(["rev-parse", "--verify", "--quiet", `refs/tags/v${v}`]);

  // Untagged — a clone that has not picked up the tags, a fresh repository
  // forked — bump's commit says the same thing: it's the one that introduced
  // this version number in package.json. The workflow tags it after
  // redo all the checks and the build.
  if (!base) {
    base = git([
      "log",
      "-1",
      "--format=%H",
      `-S"version": "${v}"`,
      "--",
      "package.json",
    ]);
  }
  if (!base) return 0;

  const count = git(["rev-list", "--count", `${base}..HEAD`]);
  const parsed = Number(count);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
