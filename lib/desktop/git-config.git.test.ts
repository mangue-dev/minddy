import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readGitConfig, readGitFacts, realRepoPath } from "./git-config";
import { localRepoVerdict } from "./local-repo";

/**
 * MIN-359 — LA LECTURE D'UN DOSSIER CANDIDAT CONTRE DE VRAIS DÉPÔTS.
 *
 * Même raison d'être que [current-repo.git.test.ts](../server/agent/current-repo.git.test.ts) :
 * ce qui se joue ici n'est pas notre logique (le parseur est couvert en pur par
 * [local-repo.test.ts](local-repo.test.ts)) mais **la façon dont git range ses
 * fichiers**. Le double saut du worktree — `.git` fichier → `gitdir` →
 * `commondir` → le `config` du dépôt principal — ne se vérifie qu'en regardant
 * un vrai worktree ; une relecture de code le déclarerait juste dans les deux
 * sens.
 *
 * `realpathSync` sur le dossier temporaire : `/var/folders/…` de macOS est un
 * lien symbolique, et c'est exactement le piège que `realRepoPath` existe pour
 * fermer.
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
      // Le worktree est créé DEPUIS le dépôt : c'est ainsi que quelqu'un
      // travaille sur deux branches à la fois, et c'est ce dossier-là qu'il
      // attacherait au projet.
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
    // Le `.git` du worktree est un FICHIER, et son gitdir ne contient aucun
    // remote : sans le saut par `commondir`, on rendrait une config sans URL et
    // le dossier serait refusé comme « dépôt sans remote ».
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
    // Le cas réel : un raccourci dans le home, choisi dans le panneau système.
    // Ranger le chemin du lien ferait échouer la préparation du dépôt courant,
    // qui compare au chemin PHYSIQUE rendu par `git rev-parse --show-toplevel`.
    const link = path.join(root, "raccourci");
    symlinkSync(repo, link);
    expect(realRepoPath(link)).toBe(repo);
    // Et le dossier visé reste parfaitement valide par ce chemin-là.
    expect(localRepoVerdict(readGitFacts(link), EXPECTED)).toEqual({ ok: true });
  });

  it("rend null sur un chemin qui n'existe pas", () => {
    expect(realRepoPath(path.join(root, "nulle-part"))).toBeNull();
  });
});
