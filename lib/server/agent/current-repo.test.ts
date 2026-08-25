import { describe, expect, it } from "vitest";

import {
  commitTurnAndPush,
  dropIgnoredPaths,
  parseStatusZ,
  prepareCurrentRepo,
  runWorkRef,
  turnPaths,
  type RepoState,
} from "./current-repo";
import { layoutForCurrentRepo } from "./harness-layout";
import type { RepoHost, ShellOptions, ShellResult } from "./repo-host";

/**
 * MIN-358 — CURRENT DEPOSIT MODE, logic side.
 *
 * Git behavior is checked against a real repository
 * ([current-repo.git.test.ts](current-repo.git.test.ts)) ; ce qui se joue ICI
 * will no repository ever say on its own:
 *
 * 1. **what we decide to deliver** — the union of the two sources and, above all, this
 * that it DECLARE to take away from the user's work;
 * 2. **orders that are not sent**. The promise of the ticket is a
 *    absence : ni `git add -A`, ni `git commit`, ni `git checkout`, ni
 * `git config` should not leave in someone's repository. An absence
 * is not tested on a real repository — it is tested by looking at what comes out.
 */

const LAYOUT = layoutForCurrentRepo("/run/r-1", "/Users/x/Projets/app", "/opt/oc");
const RUN_ID = "11111111-2222-4333-8444-555555555555";
const COMMITTER = { name: "minddy[bot]", email: "42+minddy[bot]@users.noreply.github.com" };

/** A dummy repository that records everything sent to it, and responds by table. */
function fakeHost(replies: Array<[RegExp, Partial<ShellResult>]> = []): {
  host: RepoHost;
  commands: string[];
  envs: Array<Record<string, string> | undefined>;
  files: Map<string, string>;
} {
  const commands: string[] = [];
  const envs: Array<Record<string, string> | undefined> = [];
  const files = new Map<string, string>();
  const host: RepoHost = {
    layout: LAYOUT,
    processIsolation: "sandbox",
    exec: async (command: string, opts?: ShellOptions): Promise<ShellResult> => {
      commands.push(command);
      envs.push(opts?.env);
      const hit = replies.find(([pattern]) => pattern.test(command));
      return { exitCode: 0, stdout: "", stderr: "", ...hit?.[1] };
    },
    readFile: async (p) => files.get(p) ?? null,
    writeFile: async (p, content) => {
      files.set(p, content);
    },
    mkdir: async () => {},
  };
  return { host, commands, envs, files };
}

const state = (entries: Array<[string, string]>): RepoState => new Map(entries);

describe("l'état de l'arbre de travail", () => {
  it("relit le format `-z`, qui ne cite RIEN", () => {
    // The same content in bare `--porcelain` would give `"lib/\303\251t\303\251.ts"`,
    // and a poorly reread accented path is a file missing from the pull request.
    const parsed = parseStatusZ(" M lib/été.ts\0?? un fichier à espaces.md\0");
    expect([...parsed]).toEqual([
      ["lib/été.ts", " M"],
      ["un fichier à espaces.md", "??"],
    ]);
  });

  it("compte les DEUX chemins d'un renommage", () => {
    // `R  <arrivée>\0<départ>\0`: the arrival is a new path, the departure one
    // path gone, and a renaming ride must deliver both.
    const parsed = parseStatusZ("R  b.ts\0a.ts\0 M c.ts\0");
    expect([...parsed.keys()].sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("ne se laisse pas décaler par une sortie vide", () => {
    expect(parseStatusZ("").size).toBe(0);
    expect(parseStatusZ("\0\0").size).toBe(0);
  });
});

describe("le périmètre du tour", () => {
  it("unit les éditions notées et le delta des deux instantanés", () => {
    const scope = turnPaths({
      // What `edit` permissions saw…
      edited: ["lib/a.ts"],
      // …and what only the shell did (a regenerated lockfile, a deleted file).
      before: state([["humain.ts", " M"]]),
      after: state([
        ["humain.ts", " M"],
        ["pnpm-lock.yaml", " M"],
        ["parti.ts", " D"],
      ]),
    });
    expect(scope.paths).toEqual(["lib/a.ts", "parti.ts", "pnpm-lock.yaml"]);
  });

  it("laisse le WIP de l'utilisateur DEHORS", () => {
    // `humain.ts` was already modified at the start of the round and did not move again: neither
    // the agent nor the shell touched it, it has nothing to do in the PR.
    const before = state([["humain.ts", " M"]]);
    expect(turnPaths({ edited: [], before, after: before }).paths).toEqual([]);
  });

  it("withholds a path that already contained user changes", () => {
    const scope = turnPaths({
      edited: ["partagé.ts"],
      before: state([["partagé.ts", " M"]]),
      after: state([["partagé.ts", " M"]]),
    });
    expect(scope.paths).toEqual([]);
    expect(scope.carried).toEqual(["partagé.ts"]);
  });

  /**
   * THE TRAP OF THE SECOND ROUND. Our commits live on a ref, not on the HEAD of
   * the user: the work that the agent delivered in the previous round is therefore
   * AGAIN “edited” in the tree. Without `owned`, each agent file is
   * would denounce as human labor taken away, at every turn.
   */
  it("ne prend pas son propre travail d'hier pour celui de l'utilisateur", () => {
    const dirty = state([["lib/a.ts", " M"]]);
    const scope = turnPaths({
      edited: ["lib/a.ts"],
      owned: ["lib/a.ts"],
      before: dirty,
      after: dirty,
    });
    expect(scope.paths).toEqual(["lib/a.ts"]);
    expect(scope.carried).toEqual([]);
  });

  it("ignores empty paths from a malformed edit list", () => {
    expect(turnPaths({ edited: ["", "  "], before: state([]), after: state([]) }).paths).toEqual([]);
  });

  it("rejects pathspec magic and paths outside the repository", () => {
    const scope = turnPaths({
      edited: ["../secret", "/tmp/file", "src\\file.ts", "src/*.ts", ":(glob)**"],
      before: state([]),
      after: state([]),
    });
    // Glob characters are valid filename characters and remain one literal path;
    // traversal and platform separators are rejected.
    expect(scope.paths).toEqual([":(glob)**", "src/*.ts"]);
  });
});

describe("les chemins gitignorés", () => {
  it("les retire — `update-index` les stagerait sans un mot", async () => {
    // In this mode, `.env.local` is the user's REAL secrets file.
    const { host } = fakeHost([[/check-ignore/, { stdout: ".env.local\0" }]]);
    expect(await dropIgnoredPaths(host, ["lib/a.ts", ".env.local"])).toEqual(["lib/a.ts"]);
  });

  it("ne filtre rien quand git n'a rien à dire (code 1) ou tombe (code 128)", async () => {
    const none = fakeHost([[/check-ignore/, { exitCode: 1 }]]);
    expect(await dropIgnoredPaths(none.host, ["lib/a.ts"])).toEqual(["lib/a.ts"]);
    const broken = fakeHost([[/check-ignore/, { exitCode: 128, stderr: "boom" }]]);
    expect(await dropIgnoredPaths(broken.host, ["lib/a.ts"])).toEqual(["lib/a.ts"]);
  });

  it("passe la liste par un FICHIER — `-z` n'existe qu'avec `--stdin`", async () => {
    const { host, commands, files } = fakeHost([[/check-ignore/, { exitCode: 1 }]]);
    await dropIgnoredPaths(host, ["a.ts", "b.ts"]);
    expect(commands.some((c) => c.includes("--stdin"))).toBe(true);
    // …and the file lives under the RUN root, never in the repository.
    const [path, content] = [...files][0];
    expect(path.startsWith(`${LAYOUT.root}/`)).toBe(true);
    expect(content).toBe("a.ts\0b.ts\0");
  });
});

describe("préparer le dépôt courant", () => {
  it("refuse ce qui n'est pas un dépôt git", async () => {
    const { host } = fakeHost([[/show-toplevel/, { exitCode: 128, stderr: "not a git repository" }]]);
    await expect(
      prepareCurrentRepo(host, { runId: RUN_ID, authUrl: "file:///o", workBranch: "w" }),
    ).rejects.toThrow(/not a git repository/);
  });

  it("ne clone pas, ne checkout pas, n'écrit aucune identité", async () => {
    const { host, commands } = fakeHost([
      [/show-toplevel/, { stdout: `${LAYOUT.repoDir}\n${LAYOUT.repoDir}\n` }],
      [/rev-parse --verify/, { stdout: "cafe1234\n" }],
    ]);
    await prepareCurrentRepo(host, { runId: RUN_ID, authUrl: "file:///o", workBranch: "w" });
    for (const forbidden of ["git clone", "git checkout", "git config"]) {
      expect(commands.some((c) => c.includes(forbidden))).toBe(false);
    }
  });

  it("ramène la branche de travail sous NOTRE ref, jamais sous les siennes", async () => {
    // First `rev-parse`: no anchor. The fetch creates it, the second finds it.
    let seen = 0;
    const { host, commands } = fakeHost([
      [/show-toplevel/, { stdout: `${LAYOUT.repoDir}\n${LAYOUT.repoDir}\n` }],
      [/rev-parse --verify/, {}],
    ]);
    const exec = host.exec;
    (host as { exec: RepoHost["exec"] }).exec = async (command, opts) => {
      if (/rev-parse --verify/.test(command)) {
        seen += 1;
        await exec(command, opts);
        return { exitCode: seen === 1 ? 1 : 0, stdout: seen === 1 ? "" : "beef5678\n", stderr: "" };
      }
      return await exec(command, opts);
    };

    const prepared = await prepareCurrentRepo(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "minddy/agent/min-358",
    });

    expect(prepared.parent).toBe("beef5678");
    expect(prepared.resumed).toBe(true);
    const fetched = commands.find((c) => c.startsWith("git fetch")) ?? "";
    expect(fetched).toContain(runWorkRef(RUN_ID));
    expect(fetched).not.toContain("refs/remotes/");
    expect(fetched).not.toContain(":refs/heads/");
  });

  it("ne contacte pas le remote au premier tour d'un run neuf", async () => {
    const { host, commands } = fakeHost([
      [/show-toplevel/, { stdout: `${LAYOUT.repoDir}\n${LAYOUT.repoDir}\n` }],
      [/rev-parse --verify.*HEAD/, { stdout: "cafe1234\n" }],
      [/rev-parse --verify/, { exitCode: 1 }],
    ]);

    await prepareCurrentRepo(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "minddy/agent/neuve",
      remoteWorkMayExist: false,
    });

    expect(commands.some((command) => command.startsWith("git fetch"))).toBe(false);
  });

  it("synchronise une branche cloud choisie sous une ref privée avant le tour", async () => {
    const { host, commands } = fakeHost([
      [/show-toplevel/, { stdout: `${LAYOUT.repoDir}\n${LAYOUT.repoDir}\n` }],
      [/rev-parse --verify.*HEAD/, { stdout: "cafe1234\n" }],
      [/refs\/minddy\/run\/.*\/base/, { stdout: "remote-base\n" }],
      [/rev-parse --verify/, { exitCode: 1 }],
    ]);

    await prepareCurrentRepo(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "minddy/agent/neuve",
      remoteWorkMayExist: false,
      baseBranch: "release/next",
    });

    const fetched =
      commands.find(
        (command) =>
          command.startsWith("git fetch") && command.includes("refs/heads/release/next"),
      ) ?? "";
    expect(fetched).toContain(`refs/minddy/run/${RUN_ID}/base`);
    expect(fetched).not.toContain("refs/remotes/");
    expect(fetched).not.toContain(":refs/heads/");
  });

  it("part directement d'une branche locale choisie sans contacter le remote", async () => {
    const { host, commands } = fakeHost([
      [/show-toplevel/, { stdout: `${LAYOUT.repoDir}\n${LAYOUT.repoDir}\n` }],
      [/refs\/heads\/main/, { stdout: "local-main\n" }],
      [/rev-parse --verify/, { exitCode: 1 }],
    ]);

    const prepared = await prepareCurrentRepo(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "minddy/agent/neuve",
      remoteWorkMayExist: false,
      baseBranch: "main",
    });

    expect(prepared.parent).toBe("local-main");
    expect(commands.some((command) => command.startsWith("git fetch"))).toBe(false);
  });
});

describe("le commit par index temporaire", () => {
  /** A repository where the writing tree DIFFERS from that of the parent — therefore a true commit. */
  const working = () =>
    fakeHost([
      [/rev-parse --verify/, { exitCode: 1 }],
      [/write-tree/, { stdout: "aaaa\n" }],
      [/rev-parse '.*\^\{tree\}'/, { stdout: "bbbb\n" }],
      [/commit-tree/, { stdout: "c0ffee\n" }],
      [/ls-remote/, { stdout: "" }],
    ]);

  const scope = { paths: ["lib/a.ts"], carried: [] };

  it("n'envoie AUCUN des trois gestes qui détruisent du travail humain", async () => {
    const { host, commands } = working();
    await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "w",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope,
    });
    for (const forbidden of ["git add", "git commit -m", "git checkout", "git config", "git stash"]) {
      expect(commands.some((c) => c.includes(forbidden))).toBe(false);
    }
  });

  it("travaille dans un index JETABLE, hors du dépôt", async () => {
    const { host, commands, envs } = working();
    await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "w",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope,
    });
    const indexed = commands
      .map((command, i) => ({ command, env: envs[i] }))
      .filter(({ env }) => env?.GIT_INDEX_FILE);
    // The three index commands, and them alone.
    expect(indexed.map(({ command }) => command.split(" ").slice(0, 2).join(" "))).toEqual([
      "git read-tree",
      "git update-index",
      "git write-tree",
    ]);
    for (const { env } of indexed) {
      expect(env?.GIT_INDEX_FILE.startsWith(`${LAYOUT.root}/`)).toBe(true);
    }
  });

  it("pousse par SHA — `HEAD` est celui de l'utilisateur", async () => {
    const { host, commands } = working();
    const res = await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "minddy/agent/min-358",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope,
    });
    expect(res).toMatchObject({ committed: true, pushed: true, remoteUpdated: true, headSha: "c0ffee" });
    expect(commands).toContain(
      `git push 'file:///o' 'c0ffee:refs/heads/minddy/agent/min-358'`,
    );
    expect(commands.some((c) => c.includes("HEAD:refs/heads/"))).toBe(false);
  });

  it("porte l'identité SUR la commande, jamais dans la config", async () => {
    const { host, commands } = working();
    await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "w",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope,
    });
    const commit = commands.find((c) => c.includes("commit-tree")) ?? "";
    expect(commit).toContain(`-c 'user.email=${COMMITTER.email}'`);
    expect(commit).toContain(`-c 'user.name=${COMMITTER.name}'`);
  });

  /**
   * NO BRANCH FOR NOTHING, the MIN-123 rule held in the other mode: a
   * round of question or plan should not leave anything on anyone's deposit.
   */
  it("ne pousse rien quand l'arbre écrit est celui du parent", async () => {
    const { host, commands } = fakeHost([
      [/rev-parse --verify/, { exitCode: 1 }],
      [/write-tree/, { stdout: "same\n" }],
      [/rev-parse '.*\^\{tree\}'/, { stdout: "same\n" }],
    ]);
    const res = await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "w",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope: { paths: [], carried: [] },
    });
    expect(res).toMatchObject({ committed: false, pushed: false, headSha: "head1234" });
    expect(commands.some((c) => c.startsWith("git push"))).toBe(false);
    expect(commands.some((c) => c.startsWith("git ls-remote"))).toBe(false);
  });

  /**
   * …unless the run ALREADY has an anchor: the branch then exists on the remote, and
   * a turn without change must still push it so that `remoteUpdated`
   * tell the truth (he's the one who reopens a refused pull request).
   */
  it("pousse quand même sur un tour vide si le run a déjà poussé", async () => {
    const { host, commands } = fakeHost([
      [/rev-parse --verify/, { stdout: "anchor1\n" }],
      [/write-tree/, { stdout: "same\n" }],
      [/rev-parse '.*\^\{tree\}'/, { stdout: "same\n" }],
      [/ls-remote/, { stdout: "anchor1\trefs/heads/w\n" }],
    ]);
    const res = await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "w",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope: { paths: [], carried: [] },
    });
    expect(res).toMatchObject({ committed: false, pushed: true, remoteUpdated: false });
    expect(commands.some((c) => c.startsWith("git push"))).toBe(true);
  });

  it("prolonge l'ancre du run plutôt que de lui fabriquer un frère", async () => {
    const { host, commands } = working();
    (host as { exec: RepoHost["exec"] }).exec = ((exec) =>
      async (command: string, opts?: ShellOptions) => {
        const res = await exec(command, opts);
        // The anchor exists: SHE is the parent, not the HEAD of the user.
        return /rev-parse --verify/.test(command)
          ? { exitCode: 0, stdout: "anchor1\n", stderr: "" }
          : res;
      })(host.exec);

    await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "w",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope,
    });
    expect(commands.some((c) => c.includes("git read-tree 'anchor1'"))).toBe(true);
    expect(commands.some((c) => c.includes("-p 'anchor1'"))).toBe(true);
  });
});

describe("l'ancre du run", () => {
  it("tient dans une ref à nous, hors de `refs/heads/`", () => {
    expect(runWorkRef(RUN_ID)).toBe(`refs/minddy/run/${RUN_ID}/work`);
  });

  it("neutralise un identifiant qui tenterait de sortir de son espace de refs", () => {
    expect(runWorkRef("../../heads/main")).toBe("refs/minddy/run/------heads-main/work");
    expect(runWorkRef("")).toBe("refs/minddy/run/run/work");
  });
});

describe("ce que le push déclare avoir livré", () => {
  it("reports withheld user paths even when no agent commit was created", async () => {
    const { host } = fakeHost([
      [/rev-parse --verify/, { stdout: "anchor1\n" }],
      [/write-tree/, { stdout: "same\n" }],
      [/rev-parse '.*\^\{tree\}'/, { stdout: "same\n" }],
      [/ls-remote/, { stdout: "" }],
    ]);
    const res = await commitTurnAndPush(host, {
      runId: RUN_ID,
      authUrl: "file:///o",
      workBranch: "w",
      message: "wip",
      committer: COMMITTER,
      fallbackParent: "head1234",
      scope: { paths: ["partagé.ts"], carried: ["partagé.ts"] },
    });
    expect(res.committed).toBe(false);
    expect(res.carried).toEqual(["partagé.ts"]);
    expect(res.paths).toEqual([]);
  });
});
