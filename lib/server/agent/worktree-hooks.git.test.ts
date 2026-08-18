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
 * MIN-362 — USER HOOKS, SEEN FROM A WORKTREE.
 *
 * The audit of 2026-08-14 left the question open, and it is not
 * theoretical: local run in a dedicated worktree (MIN-293) commit in the
 * repository of someone who maybe has husky, lefthook or a homemade `pre-commit` —
 * placed not in `.git/hooks` but by `core.hooksPath`, as all
 * of these tools do. A worktree has its own `.git`, which suggests that it starts
 * from a blank slate.
 *
 * MEASURED, git 2.45: **it does not start from there.** `core.hooksPath` lives in the
 * `config` from the main repository, and this file is SHARED by all worktrees
 * (only `extensions.worktreeConfig` cuts it out). A `git commit` launched from the
 * worktree therefore executes the user's hook — with its `exit 1`, its
 * suite of 40 s tests, and its access to everything the shell can reach.
 *
 * What this test guard, so it's BOTH halves:
 * 1. the hook applies from a worktree — the answer to the question of
 * auditing, and the reason why "we are in a worktree" does not
 * protect against anything;
 * 2. our end of turn path does not trigger it — not by a
 * `--no-verify` that you should have thought about putting, but because
 * `commitTurnAndPush` is PLUMBING (`write-tree` + `commit-tree`),
 * which does not call any hook. The property therefore also fits in a worktree,
 * and this is what we check rather than assuming it.
 *
 * Same family as [current-repo.git.test.ts](current-repo.git.test.ts): what
 * is at stake is not our logic, this is the behavior of git.
 */

const exec = promisify(execFile);
const IDENTITY = `git config user.email humain@example.com && git config user.name Humain`;
const COMMITTER = { name: "minddy", email: "agent@minddy.app" };
const RUN_ID = "11111111-2222-4333-8444-555555555555";

let root = "";
let origin = "";
let main = "";
let worktree = "";
/** The witness: each execution of the hook adds a line to it. */
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

  // The user's setting: a `core.hooksPath` outside of `.git/hooks`, like
  // husky and lefthook post it, with a hook that REFUSES the commit.
  const hooks = path.join(root, "hooks");
  await sh(`mkdir -p ${hooks}`, root);
  writeFileSync(path.join(hooks, "pre-commit"), `#!/bin/sh\necho passé >> ${trace}\nexit 1\n`, {
    mode: 0o755,
  });
  await sh(`git config core.hooksPath ${hooks}`, main);

  // The run worktree, on a branch of ours.
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
      // The worktree does not carry ANY config of its own: it reads that of the main.
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
    // Under the load of the other 400 files, the Git processes can wait
    // more than the default Vitest delay. Isolated, this test completes in less than 1 s.
    15_000,
  );

  it(
    "ne s'applique PAS à notre fin de tour, qui est de la plomberie",
    async () => {
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
    },
    15_000,
  );
});
