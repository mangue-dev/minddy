import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { commitAndPush } from "./repo-host";
// Le fake reste une SANDBOX et passe par `sandboxHost` : depuis MIN-224 ce test
// couvre donc aussi l'adaptateur RPC, c'est-à-dire le chemin réel de l'ancienne
// forme — la logique de `commitAndPush`, elle, est désormais commune aux deux.
import { sandboxHost, type Sandbox } from "./sandbox";
import { cloudLayout } from "./harness-layout";

/**
 * `commitAndPush` contre un VRAI dépôt git (MIN-123). Le seul test de ce dossier
 * qui sorte du pur : ici la question n'est pas notre logique (couverte par
 * sandbox-push.test.ts, en sandbox factice) mais le comportement de git — la
 * promesse de l'issue est « aucune branche n'apparaît sur le dépôt », et elle ne
 * se vérifie qu'en regardant un dépôt distant après coup.
 *
 * Le décor reproduit celui de la microVM : `git clone --depth 1 --branch <base>`
 * (shallow, mono-branche) puis `git checkout -b <branche de travail>`. C'est de ce
 * clone que vient `refs/remotes/origin/<base>`, le repère du détecteur : si un jour
 * `cloneRepo` change de forme et le fait disparaître, c'est ici que ça se voit.
 */

const run = promisify(execFile);

/** Dépôt « distant » (celui de l'utilisateur) et clone de travail (la microVM). */
let root: string;
let origin: string;
let repo: string;

const sh = (cmd: string, cwd: string) => run("sh", ["-c", cmd], { cwd });

/** Branches qui existent VRAIMENT sur le dépôt distant. */
async function remoteHeads(): Promise<string[]> {
  const { stdout } = await sh(`git ls-remote --heads ${origin}`, origin);
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t")[1] ?? "");
}

/**
 * Sandbox RÉELLE : même contrat que la microVM (`sh -c` dans le dépôt), câblée sur
 * le clone local. Le `cwd` demandé est REPO_DIR, un chemin de microVM — on le
 * remplace par celui du clone.
 */
const sandbox = {
  runCommand: async ({ args }: { args: string[] }) => {
    try {
      const { stdout, stderr } = await run("sh", ["-c", args[1] ?? ""], { cwd: repo });
      return { exitCode: 0, stdout: async () => stdout, stderr: async () => stderr };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      return {
        exitCode: e.code ?? 1,
        stdout: async () => e.stdout ?? "",
        stderr: async () => e.stderr ?? "",
      };
    }
  },
} as unknown as Sandbox;

const WORK_BRANCH = "minddy/agent/min-123-abcd1234";
/** Identité git + signature coupée : le dépôt du test ne doit rien à la config globale. */
const GIT_IDENTITY = `git config user.email numo@minddy.app && git config user.name numo && git config commit.gpgsign false`;
/**
 * L'identité que le HARNESS pose, et elle n'est PAS celle du dépôt (MIN-358) :
 * le clone garde `numo`, le commit doit sortir sous celle-ci. C'est ce qui
 * distingue un `git -c user.email=…` d'un `git config user.email` — et ce qui
 * fait qu'en mode dépôt courant l'identité de l'utilisateur reste la sienne.
 */
const COMMITTER = { name: "minddy[bot]", email: "42+minddy[bot]@users.noreply.github.com" };

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "minddy-agent-push-"));
  origin = path.join(root, "origin");
  repo = path.join(root, "repo");

  await sh(`mkdir origin`, root);
  await sh(
    `git init -q --initial-branch=main . && ${GIT_IDENTITY} && echo one > f.txt && git add -A && git commit -qm one`,
    origin,
  );
  // Le décor du harnais. `file://` et pas un chemin nu : sans lui git ignore
  // `--depth` en local et le clone ne serait pas shallow.
  await sh(`git clone -q --depth 1 --branch main file://${origin} repo`, root);
  await sh(`${GIT_IDENTITY} && git checkout -q -b ${WORK_BRANCH}`, repo);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Un push de fin de tour, avec le message qu'aurait le harnais. */
const push = (message: string) =>
  commitAndPush(sandboxHost(sandbox, cloudLayout()), {
    authUrl: `file://${origin}`,
    workBranch: WORK_BRANCH,
    baseBranch: "main",
    message,
    committer: COMMITTER,
  });

describe("commitAndPush sur un vrai dépôt git", () => {
  it("session qui ne change aucun fichier → AUCUNE branche sur le dépôt", async () => {
    const res = await push("wip(MIN-123): agent update");

    expect(res.pushed).toBe(false);
    expect(res.committed).toBe(false);
    expect(await remoteHeads()).toEqual(["refs/heads/main"]);
  });

  it("premier fichier changé → la branche est créée sur le dépôt", async () => {
    await sh(`echo two >> f.txt`, repo);

    const res = await push("feat(MIN-123): du vrai travail");

    expect(res).toMatchObject({ committed: true, pushed: true, remoteUpdated: true });
    expect(await remoteHeads()).toContain(`refs/heads/${WORK_BRANCH}`);
  });

  /**
   * MIN-358 — l'identité vient de l'APPEL, pas du dépôt. Le clone est configuré
   * sous `numo` et le commit sort quand même sous le bot : c'est la preuve que
   * `git -c` fait le travail que `git config` faisait, sans écrire dans le
   * `.git/config` de personne.
   */
  it("commite sous l'identité passée, sans toucher à celle du dépôt", async () => {
    const { stdout: author } = await sh(`git log -1 --format='%an <%ae>'`, repo);
    expect(author.trim()).toBe(`${COMMITTER.name} <${COMMITTER.email}>`);
    const { stdout: configured } = await sh(`git config user.email`, repo);
    expect(configured.trim()).toBe("numo@minddy.app");
  });

  it("tour suivant sans changement → push no-op, branche et travail conservés", async () => {
    const res = await push("wip(MIN-123): agent update");

    // La branche existe : on pousse (rien de neuf, donc `remoteUpdated` faux — pas
    // de réouverture de PR refusée sur un tour qui n'a rien apporté).
    expect(res).toMatchObject({ committed: false, pushed: true, remoteUpdated: false });
    expect(await remoteHeads()).toContain(`refs/heads/${WORK_BRANCH}`);
  });
});
