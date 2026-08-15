import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { commitTurnAndPush, prepareCurrentRepo } from "./current-repo";
import { layoutForCurrentRepo } from "./harness-layout";
import { localHost } from "./vm/local-host";

/**
 * MIN-362 — LES HOOKS DE L'UTILISATEUR, VUS DEPUIS UN WORKTREE.
 *
 * L'audit du 2026-08-14 laissait la question ouverte, et elle n'est pas
 * théorique : le run local dans un worktree dédié (MIN-293) commite dans le
 * dépôt de quelqu'un qui a peut-être husky, lefthook ou un `pre-commit` maison —
 * posé non pas dans `.git/hooks` mais par `core.hooksPath`, comme le font tous
 * ces outils. Un worktree a son propre `.git`, ce qui laisse croire qu'il part
 * d'une ardoise vierge.
 *
 * MESURÉ, git 2.45 : **il n'en part pas.** `core.hooksPath` vit dans le
 * `config` du dépôt principal, et ce fichier est PARTAGÉ par tous les worktrees
 * (seul `extensions.worktreeConfig` le découpe). Un `git commit` lancé depuis le
 * worktree exécute donc le hook de l'utilisateur — avec son `exit 1`, sa suite
 * de tests de 40 s, et son accès à tout ce que le shell peut atteindre.
 *
 * Ce que ce test garde, c'est donc les DEUX moitiés :
 *  1. le hook s'applique bien depuis un worktree — la réponse à la question de
 *     l'audit, et la raison pour laquelle « on est dans un worktree » ne
 *     protège de rien ;
 *  2. notre chemin de fin de tour, lui, ne le déclenche pas — pas par un
 *     `--no-verify` qu'il aurait fallu penser à mettre, mais parce que
 *     `commitTurnAndPush` est de la PLOMBERIE (`write-tree` + `commit-tree`),
 *     qui n'appelle aucun hook. La propriété tient donc aussi dans un worktree,
 *     et c'est ce qu'on vérifie plutôt que de le supposer.
 *
 * Même famille que [current-repo.git.test.ts](current-repo.git.test.ts) : ce qui
 * est en jeu n'est pas notre logique, c'est le comportement de git.
 */

const exec = promisify(execFile);
const IDENTITY = `git config user.email humain@example.com && git config user.name Humain`;
const COMMITTER = { name: "minddy", email: "agent@minddy.app" };
const RUN_ID = "11111111-2222-4333-8444-555555555555";

let root = "";
let origin = "";
let main = "";
let worktree = "";
/** Le témoin : chaque exécution du hook y ajoute une ligne. */
let trace = "";

async function sh(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  return await exec("/bin/sh", ["-c", command], { cwd, maxBuffer: 10 * 1024 * 1024 });
}

function traceLines(): number {
  try {
    return readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

beforeAll(async () => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "minddy-worktree-hooks-")));
  origin = path.join(root, "origin");
  main = path.join(root, "checkout");
  worktree = path.join(root, "worktree");
  trace = path.join(root, "hook-trace");

  await sh(`mkdir origin`, root);
  await sh(
    `git init -q --initial-branch=main . && ${IDENTITY} && printf 'un\n' > f.txt && ` +
      `git add -A && git commit -qm un`,
    origin,
  );
  await sh(`git clone -q file://${origin} checkout`, root);
  await sh(`${IDENTITY}`, main);

  // Le décor de l'utilisateur : un `core.hooksPath` hors de `.git/hooks`, comme
  // husky et lefthook le posent, avec un hook qui REFUSE le commit.
  const hooks = path.join(root, "hooks");
  await sh(`mkdir -p ${hooks}`, root);
  writeFileSync(path.join(hooks, "pre-commit"), `#!/bin/sh\necho passé >> ${trace}\nexit 1\n`, {
    mode: 0o755,
  });
  await sh(`git config core.hooksPath ${hooks}`, main);

  // Le worktree du run, sur une branche à nous.
  await sh(`git worktree add -q ${worktree} -b travail-agent`, main);
  await sh(`${IDENTITY}`, worktree);
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("un `core.hooksPath` posé sur le dépôt principal", () => {
  it(
    "s'applique au `git commit` d'un WORKTREE — le worktree n'isole rien",
    async () => {
      // Le worktree ne porte AUCUNE config à lui : il lit celle du principal.
      const { stdout } = await sh(`git config --get core.hooksPath`, worktree);
      expect(stdout.trim()).toBe(path.join(root, "hooks"));

      const before = traceLines();
      await sh(`printf 'travail\n' > b.txt && git add -A`, worktree);
      await expect(
        sh(`git commit -qm "depuis le worktree"`, worktree),
        "le hook de l'utilisateur ne s'est PAS exécuté depuis le worktree — reprendre §9 de l'audit",
      ).rejects.toThrow();
      expect(traceLines(), "le hook n'a pas laissé sa trace").toBe(before + 1);
    },
    // Sous la charge des 400 autres fichiers, les processus Git peuvent attendre
    // plus que le délai Vitest par défaut. Isolé, ce test termine en moins de 1 s.
    15_000,
  );

  it("ne s'applique PAS à notre fin de tour, qui est de la plomberie", async () => {
    const host = localHost(
      layoutForCurrentRepo(path.join(root, "run"), worktree, path.join(root, "oc")),
    );
    const prepared = await prepareCurrentRepo(host, {
      runId: RUN_ID,
      authUrl: `file://${origin}`,
      workBranch: "travail-agent",
    });

    const before = traceLines();
    const pushed = await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: `file://${origin}`,
      workBranch: "travail-agent",
      message: "feat(MIN-362): un tour de l'agent",
      committer: COMMITTER,
      fallbackParent: prepared.parent,
      scope: { paths: ["b.txt"], carried: [] },
    });

    expect(pushed.committed, "le tour n'a rien commité : le test ne prouve rien").toBe(true);
    expect(
      traceLines(),
      "le `pre-commit` de l'utilisateur s'est exécuté sur un commit de l'agent",
    ).toBe(before);
  });
});
