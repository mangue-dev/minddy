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
 * MIN-358 — LE MODE DÉPÔT COURANT, côté logique.
 *
 * Le comportement de git est vérifié contre un vrai dépôt
 * ([current-repo.git.test.ts](current-repo.git.test.ts)) ; ce qui se joue ICI
 * est ce qu'aucun dépôt ne dira jamais tout seul :
 *
 * 1. **ce qu'on décide de livrer** — l'union des deux sources et, surtout, ce
 *    qu'elle DÉCLARE emporter du travail de l'utilisateur ;
 * 2. **les commandes qu'on n'envoie pas**. La promesse du ticket est une
 *    absence : ni `git add -A`, ni `git commit`, ni `git checkout`, ni
 *    `git config` ne doivent partir dans le dépôt de quelqu'un. Une absence ne
 *    se teste pas sur un vrai dépôt — elle se teste en regardant ce qui sort.
 */

const LAYOUT = layoutForCurrentRepo("/run/r-1", "/Users/x/Projets/app", "/opt/oc");
const RUN_ID = "11111111-2222-4333-8444-555555555555";
const COMMITTER = { name: "minddy[bot]", email: "42+minddy[bot]@users.noreply.github.com" };

/** Un dépôt factice qui enregistre tout ce qu'on lui envoie, et répond par table. */
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
    // Le même contenu en `--porcelain` nu donnerait `"lib/\303\251t\303\251.ts"`,
    // et un chemin accentué mal relu est un fichier absent de la pull request.
    const parsed = parseStatusZ(" M lib/été.ts\0?? un fichier à espaces.md\0");
    expect([...parsed]).toEqual([
      ["lib/été.ts", " M"],
      ["un fichier à espaces.md", "??"],
    ]);
  });

  it("compte les DEUX chemins d'un renommage", () => {
    // `R  <arrivée>\0<départ>\0` : l'arrivée est un chemin neuf, le départ un
    // chemin disparu, et un tour qui renomme doit livrer les deux.
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
      // Ce que les permissions `edit` ont vu…
      edited: ["lib/a.ts"],
      // …et ce que seul le shell a fait (un lockfile régénéré, un fichier effacé).
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
    // `humain.ts` était déjà modifié au début du tour et n'a pas rebougé : ni
    // l'agent ni le shell ne l'ont touché, il n'a rien à faire dans la PR.
    const before = state([["humain.ts", " M"]]);
    expect(turnPaths({ edited: [], before, after: before }).paths).toEqual([]);
  });

  it("NOMME le fichier qu'il emporte à l'utilisateur", () => {
    const scope = turnPaths({
      edited: ["partagé.ts"],
      before: state([["partagé.ts", " M"]]),
      after: state([["partagé.ts", " M"]]),
    });
    expect(scope.paths).toEqual(["partagé.ts"]);
    expect(scope.carried).toEqual(["partagé.ts"]);
  });

  /**
   * LE PIÈGE DU DEUXIÈME TOUR. Nos commits vivent sur une ref, pas sur le HEAD de
   * l'utilisateur : le travail que l'agent a livré au tour précédent est donc
   * ENCORE « modifié » dans l'arbre. Sans `owned`, chaque fichier de l'agent se
   * dénoncerait comme du travail humain emporté, à chaque tour.
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

  it("ignore les chemins vides que rendrait une liste mal formée", () => {
    expect(turnPaths({ edited: ["", "  "], before: state([]), after: state([]) }).paths).toEqual([]);
  });
});

describe("les chemins gitignorés", () => {
  it("les retire — `update-index` les stagerait sans un mot", async () => {
    // Dans ce mode, `.env.local` est le VRAI fichier de secrets de l'utilisateur.
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
    // …et le fichier vit sous la racine du RUN, jamais dans le dépôt.
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
    // Première `rev-parse` : pas d'ancre. Le fetch la crée, la seconde la trouve.
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
  /** Un dépôt où l'arbre écrit DIFFÈRE de celui du parent — donc un vrai commit. */
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
    // Les trois commandes d'index, et elles seules.
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
   * PAS DE BRANCHE POUR RIEN, la règle de MIN-123 tenue dans l'autre mode : un
   * tour de question ou de plan ne doit rien laisser sur le dépôt de quelqu'un.
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
   * …sauf si le run a DÉJÀ une ancre : la branche existe alors sur le remote, et
   * un tour sans changement doit quand même la pousser pour que `remoteUpdated`
   * dise la vérité (c'est lui qui rouvre une pull request refusée).
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
        // L'ancre existe : c'est ELLE le parent, pas le HEAD de l'utilisateur.
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
  /**
   * `carried` déclenche une note au fil — « du travail à vous est parti dans la
   * pull request ». La publier sur un tour qui n'a rien commité annoncerait un
   * dégât qui n'a pas eu lieu.
   */
  it("ne déclare rien quand aucun commit n'a été fait", async () => {
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
    expect(res.carried).toEqual([]);
    expect(res.paths).toEqual([]);
  });
});
