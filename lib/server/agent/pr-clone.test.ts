import { describe, it, expect } from "vitest";

import {
  anchorPullRequestBase,
  clonePullRequest,
  PR_BASE_TAG,
  type RepoHost,
} from "./repo-host";
import { cloudLayout } from "./harness-layout";

/**
 * The clone of a REVIEW session (MIN-168), and especially what MIN-258 has in it
 * added: the ANCHOR of the diff.
 *
 * The defect repaired: both sides of the clone are at depth 1, therefore without
 * ancestor common, and the prompt fell back to `git diff origin/<base>` en
 * calling it “the change, in full”. `origin/<base>` is the LIVING tip of the
 * base: a commit merged into it since the opening of the PR comes out REVERSED, and
 * the reread publicly commented it as a removal of the PR. On
 * therefore brings the base of the diff served by the forge into the clone (a commit, at
 * depth 1) and we mark it with the stable review-base ref.
 *
 * The setting is a `RepoHost` in memory which does not execute anything: what matters here
 * is the SEQUENCE of commands issued, and the fact that an anchor failure does not cause
 * to drop an otherwise good clone.
 */
function fakeHost(opts: { fails?: (cmd: string) => boolean } = {}) {
  const commands: string[] = [];
  const host: RepoHost = {
    layout: cloudLayout(),
    processIsolation: "sandbox",
    async exec(command) {
      commands.push(command);
      const bad = opts.fails?.(command) === true;
      return { exitCode: bad ? 1 : 0, stdout: "", stderr: bad ? "boom" : "" };
    },
    async readFile() {
      return null;
    },
    async writeFile() {},
    async mkdir() {},
  };
  return { host, commands };
}

const BASE = {
  authUrl: "https://x-access-token:tok@github.com/acme/app.git",
  baseBranch: "main",
  headRef: "refs/pull/12/head",
  headBranch: "feat/search",
  localBranch: "pr-12",
};

const SHA = "9a1f0c2e5b7d4a3f8e6c1b0d9a8f7e6c5b4a3d2e";

describe("clonePullRequest — diff anchor", () => {
  it("fetches the forge base at depth 1 and marks the stable review ref", async () => {
    const { host, commands } = fakeHost();
    await clonePullRequest(host, { ...BASE, baseSha: SHA });

    const anchor = commands.at(-1) ?? "";
    expect(anchor).toContain(`git fetch --depth 1 '${BASE.authUrl}' '${SHA}'`);
    expect(anchor).toContain(`git tag -f '${PR_BASE_TAG}' '${SHA}'`);
    // AFTER the head checkout: the tag should not decide the position.
    expect(commands.findIndex((c) => c.includes("git checkout"))).toBeLessThan(
      commands.length - 1,
    );
  });

  it("can restore the review anchor after cloning an existing delivery branch", async () => {
    const { host, commands } = fakeHost();

    await anchorPullRequestBase(host, {
      authUrl: BASE.authUrl,
      baseSha: SHA,
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain("git rev-parse --verify");
    expect(commands[1]).toContain(
      `git fetch --depth 1 '${BASE.authUrl}' '${SHA}'`,
    );
    expect(commands[1]).toContain(`git tag -f '${PR_BASE_TAG}' '${SHA}'`);
  });

  it("does not refetch an already-correct review anchor", async () => {
    const commands: string[] = [];
    const host = fakeHost().host;
    host.exec = async (command) => {
      commands.push(command);
      return { exitCode: 0, stdout: `${SHA}\n`, stderr: "" };
    };

    await anchorPullRequestBase(host, {
      authUrl: BASE.authUrl,
      baseSha: SHA,
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("git rev-parse --verify");
  });

  it("ne fetche rien quand la forge n'a pas su donner la base", async () => {
    for (const baseSha of [
      null,
      undefined,
      "",
      "  ",
      "origin/main",
      "HEAD~1",
    ]) {
      const { host, commands } = fakeHost();
      await clonePullRequest(host, { ...BASE, baseSha });
      expect(commands.join("\n")).not.toContain("git tag");
    }
  });

  it("laisse le clone bon quand l'ancre échoue — la relecture tourne dégradée, pas jamais", async () => {
    const { host, commands } = fakeHost({
      fails: (cmd) => cmd.includes("git tag"),
    });
    await expect(
      clonePullRequest(host, { ...BASE, baseSha: SHA }),
    ).resolves.toBeUndefined();
    expect(commands.some((c) => c.includes("git tag"))).toBe(true);
  });

  it("échoue en revanche si la TÊTE n'a pas pu être récupérée", async () => {
    const { host } = fakeHost({ fails: (cmd) => cmd.includes("git checkout") });
    await expect(
      clonePullRequest(host, { ...BASE, baseSha: SHA }),
    ).rejects.toThrow(/pull request checkout failed/);
  });
});
