import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect, afterAll } from "vitest";

import {
  cloneRepo,
  historySince,
  HISTORY_WINDOW_DAYS,
  REPO_DIR,
  SANDBOX_HOME,
  type RepoHost,
} from "./repo-host";

const exec = promisify(execFile);

/**
 * L'HISTORIQUE DU CLONE DE TRAVAIL (MIN-267).
 *
 * Le défaut réparé : le clone était à `--depth 1`. Un run dont le travail EST
 * l'historique — « audite ce qui a changé depuis le dernier rapport » — trouvait
 * un dépôt d'UN commit greffé, sans parent, et rendait un rapport vide en croyant
 * que rien n'avait été livré. C'est exactement ce qu'a fait la routine d'audit de
 * sécurité, et le rapport était sincère : dans cette microVM, il n'y avait rien.
 *
 * Deux tests, deux frontières :
 *  - la SUITE de commandes émise (host en mémoire), parce que c'est elle qui
 *    porte la fenêtre — et qu'une reprise de branche de travail à `--depth 1` y
 *    reposerait une greffe sur le tip, annulant la profondeur de la base ;
 *  - le comportement de VRAI git sur un dépôt jetable, parce que `--shallow-since`
 *    ne se relit pas : il se vérifie sur un `git log`.
 */

function fakeHost() {
  const commands: string[] = [];
  const host: RepoHost = {
    async exec(command) {
      commands.push(command);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    async readFile() {
      return null;
    },
    async writeFile() {},
    async mkdir() {},
  };
  return { host, commands };
}

const OPTS = {
  authUrl: "https://x-access-token:tok@github.com/acme/app.git",
  baseBranch: "main",
  workBranch: "minddy/min-1",
  committer: { name: "minddy", email: "agent@minddy.app" },
};

describe("cloneRepo — la fenêtre d'historique", () => {
  it("clone sur une borne de temps, pas sur une profondeur", async () => {
    const { host, commands } = fakeHost();
    await cloneRepo(host, OPTS);

    const clone = commands.find((c) => c.includes("git clone")) ?? "";
    expect(clone).toContain(`--shallow-since='${historySince()}'`);
    expect(clone).not.toContain("--depth");
    // `--depth` impliquait `--single-branch` ; `resolveBaseRef` s'appuie sur le
    // fait qu'il n'y a QU'UNE ref distante, donc ça se dit dans la commande.
    expect(clone).toContain("--single-branch");
  });

  it("reprend la branche de travail avec la MÊME borne", async () => {
    const { host, commands } = fakeHost();
    await cloneRepo(host, OPTS);

    // Un `--depth 1` ici greffe le tip de la branche de travail : `git log` s'y
    // arrêterait au premier commit, alors même que la base est profonde.
    const setup = commands.find((c) => c.includes("git fetch")) ?? "";
    expect(setup).toContain(`git fetch --shallow-since='${historySince()}'`);
    expect(setup).not.toContain("--depth");
  });

  it("recule d'exactement la fenêtre annoncée", () => {
    const now = new Date("2026-08-10T09:30:00Z");
    const since = new Date(historySince(now) + "T00:00:00Z");
    const days = Math.round((now.getTime() - since.getTime()) / 86_400_000);
    expect(days).toBe(HISTORY_WINDOW_DAYS);
  });
});

describe("cloneRepo — ce que git en fait vraiment", () => {
  const roots: string[] = [];
  afterAll(async () => {
    for (const root of roots) await rm(root, { recursive: true, force: true });
  });

  /** Host local : `sh -c` sur un vrai disque, avec REPO_DIR replacé sous `root`. */
  function localHost(root: string): RepoHost {
    return {
      async exec(command, opts) {
        const local = (p: string) =>
          p.replace(REPO_DIR, join(root, "repo")).replace(SANDBOX_HOME, root);
        try {
          const { stdout, stderr } = await exec("sh", ["-c", local(command)], {
            cwd: local(opts?.cwd ?? REPO_DIR),
          });
          return { exitCode: 0, stdout, stderr };
        } catch (e) {
          const err = e as { code?: number; stdout?: string; stderr?: string };
          return { exitCode: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
        }
      },
      async readFile() {
        return null;
      },
      async writeFile() {},
      async mkdir() {},
    };
  }

  it("donne un `git log` qui remonte jusqu'à la borne, pas un commit greffé", async () => {
    const root = await mkdtemp(join(tmpdir(), "minddy-clone-"));
    roots.push(root);
    const origin = join(root, "origin");
    const seed = join(root, "seed");
    const sh = (cmd: string, cwd: string) => exec("sh", ["-c", cmd], { cwd });

    await sh(`git init -q --bare ${JSON.stringify(origin)}`, root);
    await sh(`git clone -q file://${origin} ${JSON.stringify(seed)}`, root);
    await sh(`git checkout -q -b main`, seed);
    // Quatre commits étalés : deux DANS la fenêtre, deux bien avant.
    const day = 86_400_000;
    const now = Date.now();
    const ages = [HISTORY_WINDOW_DAYS + 60, HISTORY_WINDOW_DAYS + 30, 5, 1];
    for (const [i, age] of ages.entries()) {
      const date = new Date(now - age * day).toISOString();
      await sh(
        `echo ${i} > f${i} && git add . && ` +
          `GIT_AUTHOR_DATE=${JSON.stringify(date)} GIT_COMMITTER_DATE=${JSON.stringify(date)} ` +
          `git -c user.email=a@b -c user.name=a commit -qm c${i}`,
        seed,
      );
    }
    await sh(`git push -q origin main`, seed);

    await cloneRepo(localHost(root), {
      ...OPTS,
      authUrl: `file://${origin}`,
      baseBranch: "main",
    });

    const repo = join(root, "repo");
    const { stdout } = await sh(`git log --format=%s origin/main`, repo);
    const subjects = stdout.trim().split("\n");
    // Les deux commits de la fenêtre sont là — c'est tout l'objet du changement.
    expect(subjects).toContain("c3");
    expect(subjects).toContain("c2");
    // Et le clone reste borné : le plus vieux n'est pas venu avec.
    expect(subjects).not.toContain("c0");
  }, 60_000);
});
