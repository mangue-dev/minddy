import { describe, expect, it } from "vitest";

import { commitAndPush } from "./repo-host";
// The fake remains a SANDBOX and goes through `sandboxHost`: since MIN-224 this test
// therefore also covers the RPC adapter, i.e. the real path of the old
// form — the logic of `commitAndPush` is now common to both.
import { sandboxHost, type Sandbox } from "./sandbox";
import { cloudLayout } from "./harness-layout";

/**
 * End of turn on the git side (MIN-123): WHEN does the harness touch the repository?
 *
 * `git push HEAD:refs/heads/<branche>` CREATES the remote branch, even when the tree
 * is clean — therefore a session that has not changed anything (question, plan, check)
 * left an empty branch on the user's repository. What is tested here is
 * this decision, and it alone: ​​the branch only reaches the remote from the
 * first commit, and in case of doubt we push (never keep work outside
 * of the remote). Hands in real git are covered by the microVM.
 */

/** A shell command seen by the dummy sandbox, and what it should respond to. */
interface Reply {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

const BASE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WORK_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/**
 * Dummy sandbox: routes each command to the first key that prefixes it and
 * logs everything that was issued. An unexpected command is a test failure
 * (an unexpected git command should not go unnoticed), except `git status`
 * and `git rev-parse` whose faults describe the nominal case "nothing changed".
 */
function fakeSandbox(routes: Record<string, Reply | ((call: number) => Reply)>): {
  sandbox: Sandbox;
  commands: string[];
} {
  const commands: string[] = [];
  const counts = new Map<string, number>();
  const sandbox = {
    runCommand: async ({ args }: { args: string[] }) => {
      const command = args[1] ?? "";
      commands.push(command);
      const key = Object.keys(routes)
        .sort((a, b) => b.length - a.length)
        .find((prefix) => command.startsWith(prefix));
      if (!key) throw new Error(`unexpected command: ${command}`);
      const seen = (counts.get(key) ?? 0) + 1;
      counts.set(key, seen);
      const route = routes[key];
      const reply = typeof route === "function" ? route(seen) : route;
      return {
        exitCode: reply.exitCode ?? 0,
        stdout: async () => reply.stdout ?? "",
        stderr: async () => reply.stderr ?? "",
      };
    },
  } as unknown as Sandbox;
  return { sandbox, commands };
}

const OPTS = {
  authUrl: "https://x-access-token:tok@github.com/acme/app.git",
  workBranch: "minddy/agent/min-123-abcd1234",
  baseBranch: "main",
  message: "wip(MIN-123): agent update",
  // MIN-358: the identity travels to the commit and is set by `git -c`, it
  // is no longer written in the clone's `.git/config`.
  committer: { name: "minddy agent", email: "agent@minddy.app" },
};

describe("commitAndPush", () => {
  it("ne pousse RIEN quand le tour n'a rien changé (aucune branche créée)", async () => {
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: "" },
      "git rev-parse HEAD": { stdout: `${BASE_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res).toEqual({
      committed: false,
      remoteUpdated: false,
      headSha: BASE_SHA,
      pushed: false,
    });
    // Neither push, nor even ls-remote: the repository is not affected at all.
    expect(commands.some((c) => c.startsWith("git push"))).toBe(false);
    expect(commands.some((c) => c.startsWith("git ls-remote"))).toBe(false);
  });

  it("commite puis pousse dès qu'un fichier a changé", async () => {
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: " M lib/foo.ts\n" },
      "git add -A": {},
      // MIN-358: the commit has its identity at the top (`git -c user.email=…`).
      "git -c 'user.email=": {},
      // The commit advances HEAD: it is HE who makes the branch pushable.
      "git rev-parse HEAD": { stdout: `${WORK_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
      "git ls-remote": { stdout: "" },
      "git push": {},
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res).toEqual({
      committed: true,
      remoteUpdated: true,
      headSha: WORK_SHA,
      pushed: true,
    });
    expect(commands).toContain(`git add -A`);
    expect(commands.some((c) => c.startsWith("git push"))).toBe(true);
  });

  it("pousse une branche héritée même sur un tour purement conversationnel", async () => {
    // Session which resumes a branch already pushed: HEAD is ahead of the base,
    // the remote is already up to date → push no-op, but the branch exists and remains so.
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: "" },
      "git rev-parse HEAD": { stdout: `${WORK_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
      "git ls-remote": { stdout: `${WORK_SHA}\trefs/heads/${OPTS.workBranch}\n` },
      "git push": {},
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res.pushed).toBe(true);
    expect(res.committed).toBe(false);
    // The remote has not ADVANCED: no PR reopening refused on this round.
    expect(res.remoteUpdated).toBe(false);
    expect(commands.some((c) => c.startsWith("git push"))).toBe(true);
  });

  it("pousse quand le sha de la base est illisible (défaut sûr)", async () => {
    const { sandbox, commands } = fakeSandbox({
      "git status --porcelain": { stdout: "" },
      "git rev-parse HEAD": { stdout: `${BASE_SHA}\n` },
      "git rev-parse --verify": { exitCode: 128, stderr: "fatal: Needed a single revision" },
      "git ls-remote": { stdout: "" },
      "git push": {},
    });

    const res = await commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS);

    expect(res.pushed).toBe(true);
    expect(commands.some((c) => c.startsWith("git push"))).toBe(true);
  });

  it("remonte l'échec d'un push (le tour doit le signaler)", async () => {
    const { sandbox } = fakeSandbox({
      "git status --porcelain": { stdout: " M lib/foo.ts\n" },
      "git add -A": {},
      // MIN-358: the commit has its identity at the top (`git -c user.email=…`).
      "git -c 'user.email=": {},
      "git rev-parse HEAD": { stdout: `${WORK_SHA}\n` },
      "git rev-parse --verify": { stdout: `${BASE_SHA}\n` },
      "git ls-remote": { stdout: "" },
      "git push": { exitCode: 1, stderr: "! [rejected] non-fast-forward" },
    });

    await expect(commitAndPush(sandboxHost(sandbox, cloudLayout()), OPTS)).rejects.toThrow(/non-fast-forward/);
  });
});
