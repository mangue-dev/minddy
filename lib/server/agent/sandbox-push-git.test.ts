import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { commitAndPush } from "./repo-host";
// The fake remains a SANDBOX and goes through `sandboxHost`: since MIN-224 this test
// therefore also covers the RPC adapter, i.e. the real path of the old
// form — the logic of `commitAndPush` is now common to both.
import { sandboxHost, type Sandbox } from "./sandbox";
import { cloudLayout } from "./harness-layout";

/**
 * `commitAndPush` against a REAL git repository (MIN-123). The only test in this folder
 * that is out of the pure: here the question is not our logic (covered by
 * sandbox-push.test.ts, in dummy sandbox) but the behavior of git — the
 * promise of the outcome is "no branch appears on the repository", and it does not hold
 * only by looking at a remote repository afterwards.
 *
 * The decor reproduces that of the microVM: `git clone --depth 1 --branch <base>`
 * (shallow, single-branch) then `git checkout -b <branche de travail>`. It is from this
 * clone that `refs/remotes/origin/<base>`, the detector's marker, comes: if one day
 * `cloneRepo` changes shape and makes it disappear, this is where it shows.
 */

const run = promisify(execFile);

/** “Remote” repository (that of the user) and working clone (the microVM). */
let root: string;
let origin: string;
let repo: string;

const sh = (cmd: string, cwd: string) => run("sh", ["-c", cmd], { cwd });

/** Branches that REALLY exist on the remote repository. */
async function remoteHeads(): Promise<string[]> {
  const { stdout } = await sh(`git ls-remote --heads ${origin}`, origin);
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t")[1] ?? "");
}

/**
 * REAL Sandbox: same contract as the microVM (`sh -c` in the repository), wired to
 * the local clone. The `cwd` requested is REPO_DIR, a microVM path — we replace it
 * with that of the clone.
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
/** Git identity + cut signature: the test repository owes nothing to the global config. */
const GIT_IDENTITY = `git config user.email numo@minddy.app && git config user.name numo && git config commit.gpgsign false`;
/**
 * The identity that the HARNESS sets, and it is NOT that of the repository (MIN-358):
 * the clone keeps `numo`, the commit must exit under this one. This is what
 * distinguishes a `git -c user.email=…` from a `git config user.email` — and what
 * ensures that in current deposit mode the user's identity remains theirs.
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
  // The decoration of the harness. `file://` and not a bare path: without it git ignores
  // `--depth` locally and the clone would not be shallow.
  await sh(`git clone -q --depth 1 --branch main file://${origin} repo`, root);
  await sh(`${GIT_IDENTITY} && git checkout -q -b ${WORK_BRANCH}`, repo);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A push at the end of the turn, with the message that the harness would have. */
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
 * MIN-358 — identity comes from CALL, not repository. The clone is configured
 * under `numo` and the commit still comes out under the bot: this is proof that
 * `git -c` does the work that `git config` did, without writing to the
 * `.git/config` of person.
 */
  it("commite sous l'identité passée, sans toucher à celle du dépôt", async () => {
    const { stdout: author } = await sh(`git log -1 --format='%an <%ae>'`, repo);
    expect(author.trim()).toBe(`${COMMITTER.name} <${COMMITTER.email}>`);
    const { stdout: configured } = await sh(`git config user.email`, repo);
    expect(configured.trim()).toBe("numo@minddy.app");
  });

  it("tour suivant sans changement → push no-op, branche et travail conservés", async () => {
    const res = await push("wip(MIN-123): agent update");

    // The branch exists: we push (nothing new, so `remoteUpdated` false — not
    // reopening of PR refused on a turn which brought nothing).
    expect(res).toMatchObject({ committed: false, pushed: true, remoteUpdated: false });
    expect(await remoteHeads()).toContain(`refs/heads/${WORK_BRANCH}`);
  });
});
