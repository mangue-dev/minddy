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
  type RepoHost,
} from "./repo-host";
import { cloudLayout, layoutForRoot } from "./harness-layout";

const exec = promisify(execFile);

/**
 * L'HISTORIQUE DU CLONE DE TRAVAIL (MIN-267).
 *
 * The fault repaired: the clone was at `--depth 1`. A run whose work IS
 * the history — “audits what has changed since the last report” — found
 * a repository of ONE grafted commit, without parent, and returned an empty report believing
 * that nothing had been delivered. This is exactly what the audit routine did
 * security, and the report was sincere: in this microVM, there was nothing.
 *
 * Two tests, two borders:
 * - the SEQUENCE of commands issued (host in memory), because it is she who
 * carries the window — and that a working branch resumption at `--depth 1` y
 * would rest a graft on the tip, canceling the depth of the base;
 * - the behavior of TRUE git on a disposable repository, because `--shallow-since`
 * is not reread: it is verified on a `git log`.
 */

function fakeHost() {
  const commands: string[] = [];
  const host: RepoHost = {
    layout: cloudLayout(),
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
    // `--depth` implied `--single-branch`; `resolveBaseRef` is based on the
    // means that there is ONLY ONE remote ref, so it is said in the command.
    expect(clone).toContain("--single-branch");
  });

  it("reprend la branche de travail avec la MÊME borne", async () => {
    const { host, commands } = fakeHost();
    await cloneRepo(host, OPTS);

    // A `--depth 1` here grafts the tip of the work branch: `git log` is there
    // would stop at the first commit, even though the base is deep.
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

  /**
   * Local host: `sh -c` on a real disk, under a REAL run root.
   *
   * This host rewrote the paths by hand (`command.replace(REPO_DIR, …)`)
   * to return `/vercel/sandbox` to a temporary folder — the workaround
   * correct that MIN-354 removes. It now receives a layout, and the code under
   * test works for good outside of `/vercel`: it's the same verification,
   * but it finally exercises the path that a workstation will take.
   */
  function localHost(root: string): RepoHost {
    const layout = layoutForRoot(root, join(root, "oc"));
    return {
      layout,
      async exec(command, opts) {
        try {
          const { stdout, stderr } = await exec("sh", ["-c", command], {
            cwd: opts?.cwd ?? layout.repoDir,
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
      async mkdir(absPath) {
        await exec("mkdir", ["-p", absPath]);
      },
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
    // Four commits spread out: two IN the window, two well before.
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
    // The two window commits are there — that's the whole point of the change.
    expect(subjects).toContain("c3");
    expect(subjects).toContain("c2");
    // And the clone remains stubborn: the oldest did not come with it.
    expect(subjects).not.toContain("c0");
  }, 60_000);
});
