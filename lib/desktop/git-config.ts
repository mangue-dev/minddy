import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { parseGitDirPointer, type LocalRepoFacts } from "./local-repo";

/**
 * WHAT THE DISC SAYS ABOUT A CANDIDATE FILE (MIN-359).
 *
 * Separated from [local-repo.ts](local-repo.ts), which remains without IO, and also separated from
 * `desktop/src/`, which matters `electron`: **it is this placement which makes this
 * testable file.** `vitest.config.ts` only collects `lib/**`, and a module
 * which imports `electron` does not matter — but the reading below is
 * precisely the part that no rereading validates (see the double jump of the
 * worktree). It therefore has its test against real deposits,
 * [git-config.git.test.ts](git-config.git.test.ts).
 *
 * ⚠ **This module imports `node:fs`: it has nothing to do in a component
 * client.** It is only called by the main process of the shell.
 *
 * ## On lit `.git/config`, on ne lance pas `git`
 *
 * On a Mac without Command Line Tools, the slightest invocation of `git` brings up
 * the Xcode installation window. In the middle of an adjustment gesture, no one
 * doesn't understand where it's coming from — and the app has no way to close it. THE
 * file is enough, it is there by construction, and its reading does not depend on anything.
 *
 * ## The `.git` is not always a folder
 *
 * In a **worktree** and in a **submodule**, `.git` is a FILE carrying
 * `gitdir: <chemin>` — and in a worktree, the configuration does not live there: the
 * file `commondir` refers to `.git` of the main repository, the only place where
 * remotes are declared. We therefore follow the two jumps. Without them, attach a
 * worktree — exactly what someone who works on two branches does
 * both — would be rejected as “not a deposit”.
 */

/** The state of a file, as `localRepoVerdict` wants it to be. */
export function readGitFacts(dir: string): LocalRepoFacts {
  try {
    if (!statSync(dir).isDirectory()) return { isDirectory: false, gitConfig: null };
  } catch {
    return { isDirectory: false, gitConfig: null };
  }
  return { isDirectory: true, gitConfig: readGitConfig(dir) };
}

/** The `.git/config` of the folder, following worktree and submodule. */
export function readGitConfig(dir: string): string | null {
  const dotGit = path.join(dir, ".git");
  let gitDir: string;
  try {
    if (statSync(dotGit).isDirectory()) {
      gitDir = dotGit;
    } else {
      const pointer = parseGitDirPointer(readFileSync(dotGit, "utf8"));
      if (!pointer) return null;
      gitDir = path.resolve(dir, pointer);
    }
  } catch {
    return null;
  }

  // `commondir` ONLY exists in a worktree.
  let configDir = gitDir;
  try {
    const common = readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
    if (common) configDir = path.resolve(gitDir, common);
  } catch {
    // Not a worktree: the configuration is in the gitdir itself.
  }

  try {
    return readFileSync(path.join(configDir, "config"), "utf8");
  } catch {
    return null;
  }
}

/**
 * The PHYSICAL path of a folder — symbolic links resolved.
 *
 * This is not coquetry, and the deposit has already paid for it once: the
 * preparation of the current repository compares the path given to it to what is rendered
 * `git rev-parse --show-toplevel`, **which is physical**
 * ([current-repo.git.test.ts](../server/agent/current-repo.git.test.ts) says so
 * in full). Arrange the path as the system panel rendered it —
 * `/tmp/…` while the real one is `/private/tmp/…`, or any shortcut
 * that someone did in his home — would cause the first round to fail on
 * a string comparison, and the message would not talk about links
 * symboliques.
 */
export function realRepoPath(dir: string): string | null {
  try {
    return realpathSync(dir);
  } catch {
    return null;
  }
}
