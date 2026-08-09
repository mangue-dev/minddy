import { describe, it, expect } from "vitest";

import { clonePullRequest, PR_BASE_TAG, type RepoHost } from "./repo-host";

/**
 * Le clone d'une session de RELECTURE (MIN-168), et surtout ce que MIN-258 y a
 * ajouté : l'ANCRE du diff.
 *
 * Le défaut réparé : les deux côtés du clone sont à profondeur 1, donc sans
 * ancêtre commun, et le prompt se rabattait sur `git diff origin/<base>` en
 * l'appelant « the change, in full ». `origin/<base>` est le tip VIVANT de la
 * base : un commit fusionné dedans depuis l'ouverture de la PR y sort INVERSÉ, et
 * la relecture le commentait publiquement comme une suppression de la PR. On
 * amène donc la base du diff servi par la forge dans le clone (un commit, à
 * profondeur 1) et on la marque `pr-base`.
 *
 * Le décor est un `RepoHost` en mémoire qui n'exécute rien : ce qui compte ici
 * est la SUITE de commandes émise, et le fait qu'un échec d'ancre ne fasse pas
 * tomber un clone par ailleurs bon.
 */
function fakeHost(opts: { fails?: (cmd: string) => boolean } = {}) {
  const commands: string[] = [];
  const host: RepoHost = {
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

describe("clonePullRequest — l'ancre du diff", () => {
  it("amène la base de la forge à profondeur 1 et la marque `pr-base`", async () => {
    const { host, commands } = fakeHost();
    await clonePullRequest(host, { ...BASE, baseSha: SHA });

    const anchor = commands.at(-1) ?? "";
    expect(anchor).toContain(`git fetch --depth 1 '${BASE.authUrl}' '${SHA}'`);
    expect(anchor).toContain(`git tag -f '${PR_BASE_TAG}' '${SHA}'`);
    // APRÈS le checkout de la tête : le tag ne doit pas décider de la position.
    expect(commands.findIndex((c) => c.includes("git checkout"))).toBeLessThan(
      commands.length - 1,
    );
  });

  it("ne fetche rien quand la forge n'a pas su donner la base", async () => {
    for (const baseSha of [null, undefined, "", "  ", "origin/main", "HEAD~1"]) {
      const { host, commands } = fakeHost();
      await clonePullRequest(host, { ...BASE, baseSha });
      expect(commands.join("\n")).not.toContain("git tag");
    }
  });

  it("laisse le clone bon quand l'ancre échoue — la relecture tourne dégradée, pas jamais", async () => {
    const { host, commands } = fakeHost({ fails: (cmd) => cmd.includes("git tag") });
    await expect(clonePullRequest(host, { ...BASE, baseSha: SHA })).resolves.toBeUndefined();
    expect(commands.some((c) => c.includes("git tag"))).toBe(true);
  });

  it("échoue en revanche si la TÊTE n'a pas pu être récupérée", async () => {
    const { host } = fakeHost({ fails: (cmd) => cmd.includes("git checkout") });
    await expect(clonePullRequest(host, { ...BASE, baseSha: SHA })).rejects.toThrow(
      /pull request checkout failed/,
    );
  });
});
