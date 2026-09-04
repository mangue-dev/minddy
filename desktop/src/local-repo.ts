import { dialog, type BrowserWindow } from "electron";
import { execFileSync } from "node:child_process";

import { readGitFacts, realRepoPath } from "@/lib/desktop/git-config";
import {
  localRepoFolderName,
  localRepoVerdict,
  withLocalRepo,
  withoutLocalRepo,
  type ExpectedRepo,
  type LocalRepoState,
} from "@/lib/desktop/local-repo";
import type { LocalProject, LocalTurnProject } from "@/lib/desktop/local-turn";
import {
  listLocalRepositorySkills,
  loadLocalRepositorySkill,
} from "@/lib/desktop/repository-skills";
import type {
  RepositorySkill,
  RepositorySkillSummary,
} from "@/lib/repository-skills";
import { readLocalRepos, writeLocalRepos } from "./repo-store";

/**
 * ATTACH A MACHINE FOLDER TO A PROJECT (MIN-359) — wiring.
 *
 * What the page may request: open the system panel, reread
 * the attachment, forget it. **It can never NAME a folder** — the bridge
 * does not take a path as input (see lib/desktop/bridge.ts). A path only goes back down to be displayed, and it only goes back up with a `NSOpenPanel`,
 *, that is to say with a human gesture. This is the only form that makes remote code
 * incapable of denoting `~/.ssh` by writing a string.
 *
 * Everything that decides lives elsewhere, and it is deliberate: the verdicts in
 * [lib/desktop/local-repo.ts](../../lib/desktop/local-repo.ts) (pure), reading
 * from disk in [lib/desktop/git-config.ts](../../lib/desktop/git-config.ts) —
 * out of `desktop/src/`, where the test suite is going wrong. All that remains here is the
 * panel, the storage, and the question “what state to return to”.
 */

/** The state of a given path, revalidated against the repository linked to the project.
 *
 * `expected` is `null` for a project with no linked repository: the folder must
 * be a git repository, but no remote is required (see `localRepoVerdict`). */
function stateFor(dirPath: string, expected: ExpectedRepo | null): LocalRepoState {
  const verdict = localRepoVerdict(readGitFacts(dirPath), expected);
  return verdict.ok
    ? { status: "ready", path: dirPath, folder: localRepoFolderName(dirPath) }
    : { status: "invalid", path: dirPath, reason: verdict.reason };
}

/**
 * The attachment of a project, **revalidated on each reading**.
 *
 * A chosen path proves nothing: the folder could have been moved, the disk
 * unmounted, the project repository re-linked elsewhere in the meantime. Answering “attached”
 * based on the file would send a run to a folder that no longer exists,
 * and the failure would only appear on the first run, on the machine, without log.
 */
export function describeLocalRepo(
  projectId: string,
  expected: ExpectedRepo | null,
): LocalRepoState {
  const stored = readLocalRepos()[projectId];
  if (!stored) return { status: "none" };
  return stateFor(stored, expected);
}

/**
 * Ready folders among the projects known to the launcher. This revalidation is
 * important: an old attachment must not make the model believe that it
 * can open a folder that has been moved, unmounted or linked to another repository.
 *
 * A project WITHOUT a linked repository is validated too — as a plain git
 * checkout, remote optional: a local-only project (no forge attached) is exactly
 * the case the folder attachment exists for.
 */
export function localProjectsFor(projects: readonly LocalTurnProject[]): LocalProject[] {
  return projects.map((project) => {
    const state = describeLocalRepo(
      project.id,
      project.repoFullName
        ? { fullName: project.repoFullName, aliases: project.repoPreviousNames ?? [] }
        : null,
    );
    return {
      ...project,
      localPath: state.status === "ready" ? state.path : null,
    };
  });
}

/**
 * Opens the system panel and attaches the chosen folder.
 *
 * **A rejected folder is not stored**: the verdict is given so that the screen says
 *, and the previous attachment — if there was one — remains in place. Se
 * cheating on a folder should not cost the one that worked.
 *
 * A cancellation returns the state to current, as if nothing had happened.
 *
 * The path is **resolved** before being put away (`realRepoPath`): cf. the
 * comment of this function, this is what prevents a symbolic link from causing
 * to fail the first round on a string comparison.
 */
export async function attachLocalRepo(
  projectId: string,
  expected: ExpectedRepo | null,
  window: BrowserWindow | null,
): Promise<LocalRepoState> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openDirectory"],
    message: expected
      ? `Choisir le dossier local de ${expected.fullName}`
      : "Choisir le dossier local du projet",
    buttonLabel: "Attacher",
  };
  const picked = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  const chosen = picked.canceled ? null : (picked.filePaths[0] ?? null);
  if (!chosen) return describeLocalRepo(projectId, expected);

  const resolved = realRepoPath(chosen);
  if (!resolved) return { status: "invalid", path: chosen, reason: "missing" };

  const state = stateFor(resolved, expected);
  if (state.status !== "ready") return state;

  writeLocalRepos(withLocalRepo(readLocalRepos(), projectId, resolved));
  return state;
}

/** Detaches the folder. Returns the next state, which is always “none”. */
export function detachLocalRepo(projectId: string): LocalRepoState {
  writeLocalRepos(withoutLocalRepo(readLocalRepos(), projectId));
  return { status: "none" };
}

/** Local branches, read without letting the page designate a disk path. */
export function localBranches(
  projectId: string,
  expected: ExpectedRepo | null,
): string[] {
  const state = describeLocalRepo(projectId, expected);
  if (state.status !== "ready") return [];
  try {
    return execFileSync(
      "git",
      ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
      { cwd: state.path, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\n")
      .map((branch) => branch.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Skills from the attached checkout, revalidated before every synchronization. */
export async function localSkills(
  projectId: string,
  expected: ExpectedRepo | null,
): Promise<RepositorySkillSummary[]> {
  const state = describeLocalRepo(projectId, expected);
  return state.status === "ready" ? listLocalRepositorySkills(state.path) : [];
}

/** One full skill from the attached checkout, revalidated before reading. */
export function localSkill(
  projectId: string,
  expected: ExpectedRepo | null,
  skillPath: string,
): RepositorySkill | null {
  const state = describeLocalRepo(projectId, expected);
  return state.status === "ready"
    ? loadLocalRepositorySkill(state.path, skillPath)
    : null;
}
