import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGitConfig, readGitFacts, realRepoPath } from "./git-config";
import { localRepoVerdict } from "./local-repo";

/**
 * MIN-359 — READING A CANDIDATE FILE AGAINST REAL DEPOSITS.
 *
 * Same purpose as [current-repo.git.test.ts](../server/agent/current-repo.git.test.ts) :
 * what is at stake here is not our logic (the parser is covered purely by
 * [local-repo.test.ts](local-repo.test.ts)) but **the way git stores its
 * files**. The double jump of the worktree — `.git` file → `gitdir` →
 * `commondir` → the `config` of the main repository — is only verified by looking at
 * a real worktree; a code review would just declare it in both
 * sens.
 *
 * `realpathSync` on the temp folder: macOS's `/var/folders/…` is a symlink, and that's exactly the trap that `realRepoPath` exists for
 * close.
 */

const run = promisify(execFile);
const sh = (cmd: string, cwd: string) => run("sh", ["-c", cmd], { cwd });

const REMOTE = "git@github.com:mangue-dev/minddy.git";
const EXPECTED = { fullName: "mangue-dev/minddy" };

let root: string;
let repo: string;
let worktree: string;
let plain: string;

beforeAll(async () => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "minddy-local-repo-")));
  repo = path.join(root, "dépôt");
  worktree = path.join(root, "worktree");
  plain = path.join(root, "pas-un-dépôt");

  mkdirSync(repo, { recursive: true });
  await sh(
    [
      "git init -q -b main",
      `git remote add origin ${REMOTE}`,
      "git config user.email a@b.c && git config user.name a",
      "git config commit.gpgsign false",
      "printf x > f.txt && git add -A && git commit -qm base",
      // The worktree is created FROM the repository: this is how someone
      // works on two branches at the same time, and it is this folder that it
      // would attach to the project.
      `git worktree add -q -b autre ${worktree}`,
    ].join(" && "),
    repo,
  );

  mkdirSync(plain, { recursive: true });
  writeFileSync(path.join(plain, "README.md"), "rien\n");
}, 60_000);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("readGitConfig", () => {
  it("lit la config d'un dépôt ordinaire", () => {
    expect(readGitConfig(repo)).toContain(REMOTE);
  });

  it("lit celle du dépôt PRINCIPAL depuis un worktree", () => {
    // The `.git` of the worktree is a FILE, and its gitdir does not contain any
    // remote: without the jump by `commondir`, we would render a config without URL and
    // the file would be refused as “repository without remote”.
    expect(readGitConfig(worktree)).toContain(REMOTE);
  });

  it("rend null sur un dossier qui n'est pas un dépôt", () => {
    expect(readGitConfig(plain)).toBeNull();
  });

  it("rend null sur un dossier inexistant", () => {
    expect(readGitConfig(path.join(root, "nulle-part"))).toBeNull();
  });
});

describe("readGitFacts + localRepoVerdict", () => {
  it("accepte le dépôt et son worktree", () => {
    expect(localRepoVerdict(readGitFacts(repo), EXPECTED)).toEqual({ ok: true });
    expect(localRepoVerdict(readGitFacts(worktree), EXPECTED)).toEqual({ ok: true });
  });

  it("refuse un dossier ordinaire, et le DIT", () => {
    expect(localRepoVerdict(readGitFacts(plain), EXPECTED)).toEqual({
      ok: false,
      reason: "notGit",
    });
  });

  it("refuse un chemin absent", () => {
    expect(localRepoVerdict(readGitFacts(path.join(root, "nulle-part")), EXPECTED)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("refuse le dépôt d'un AUTRE projet", () => {
    expect(localRepoVerdict(readGitFacts(repo), { fullName: "mangue-dev/autre" })).toEqual({
      ok: false,
      reason: "wrongRepo",
    });
  });

  it("refuse un fichier passé pour un dossier", () => {
    expect(localRepoVerdict(readGitFacts(path.join(plain, "README.md")), EXPECTED)).toEqual({
      ok: false,
      reason: "missing",
    });
  });
});

describe("realRepoPath", () => {
  it("résout un lien symbolique vers le dépôt", () => {
    // The real case: a shortcut in the home, chosen in the system panel.
    // Storing the link path would cause the preparation of the current repository to fail,
    // qui compare au chemin PHYSIQUE rendu par `git rev-parse --show-toplevel`.
    const link = path.join(root, "raccourci");
    symlinkSync(repo, link);
    expect(realRepoPath(link)).toBe(repo);
    // And the targeted file remains perfectly valid by this path.
    expect(localRepoVerdict(readGitFacts(link), EXPECTED)).toEqual({ ok: true });
  });

  it("rend null sur un chemin qui n'existe pas", () => {
    expect(realRepoPath(path.join(root, "nulle-part"))).toBeNull();
  });
});
