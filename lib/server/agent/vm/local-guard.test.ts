import { describe, expect, it } from "vitest";

import { realPathOf, refineLocalVerdict } from "./local-guard";
import type { PermissionAsk, PermissionVerdict } from "./opencode-permissions";

/**
 * MIN-360 — THE TWO GUARDS THAT NEED DISK AND RESOLVER.
 *
 * `decidePermission` is pure and remains so; what is tested here are the two
 * checks that no string can render: the
 * symbolic link created IN the repository (which `ln -s` places without any guardrail seeing it) and the
 * public domain which resolves to the local loop.
 *
 * Both IO are injected, so the file does not touch disk or network.
 */

const REPO = "/Users/dev/Projets/minddy";

const ask = (over: Partial<PermissionAsk>): PermissionAsk => ({
  id: "per_1",
  sessionId: "ses_1",
  permission: "edit",
  callId: "call_1",
  ...over,
});

const ALLOW: PermissionVerdict = { reply: "once" };

/**
 * A fake `realpath`: the table is the disk. What is described there exists and makes
 * its real target; **anything that is not there RISES**, like the real one on a file
 * that has not yet been created — and this is exactly the case that `realPathOf` must
 * know how to process.
 */
const realpathOf = (disk: Record<string, string>) =>
  async (path: string): Promise<string> => {
    if (!(path in disk)) throw new Error("ENOENT");
    return disk[path];
  };

describe("realPathOf", () => {
  it("résout le plus proche ancêtre qui existe", () => {
    // A write often creates the file: `realpath` of the file would raise, and
    // it's the linked FILE that counts.
    const realpath = realpathOf({ [`${REPO}/notes`]: "/Users/dev/.ssh" });
    return expect(realPathOf(`${REPO}/notes/x.ts`, realpath)).resolves.toBe("/Users/dev/.ssh/x.ts");
  });

  it("rend le chemin tel quel quand rien ne résout", () => {
    const realpath = async (): Promise<string> => {
      throw new Error("ENOENT");
    };
    return expect(realPathOf("/a/b/c", realpath)).resolves.toBe("/a/b/c");
  });
});

describe("refineLocalVerdict — repository writes", () => {
  it("rejects a symlink that escapes the repository", async () => {
    const realpath = realpathOf({ [REPO]: REPO, [`${REPO}/notes`]: "/Users/dev/Projets/voisin" });
    const verdict = await refineLocalVerdict(
      ask({ filepath: `${REPO}/notes/x.ts` }),
      ALLOW,
      REPO,
      { realpath },
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toMatch(/escapes the repository/i);
  });

  it("refuse un lien qui mène dans `.git/`", async () => {
    const realpath = realpathOf({ [REPO]: REPO, [`${REPO}/hooks`]: `${REPO}/.git/hooks` });
    const verdict = await refineLocalVerdict(
      ask({ filepath: `${REPO}/hooks/pre-commit` }),
      ALLOW,
      REPO,
      { realpath },
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toMatch(/\.git/i);
  });

  it("laisse passer une écriture ordinaire", async () => {
    const realpath = realpathOf({ [REPO]: REPO, [`${REPO}/lib`]: `${REPO}/lib` });
    expect(
      await refineLocalVerdict(ask({ filepath: `${REPO}/lib/x.ts` }), ALLOW, REPO, { realpath }),
    ).toEqual(ALLOW);
  });

  it("inspecte TOUS les fichiers d'un `apply_patch`, pas le premier", async () => {
    // The second goes through a link which leads to `.git/`: this is what remains
    // kept, and it must not be saved by being second.
    const realpath = realpathOf({ [REPO]: REPO, [`${REPO}/b`]: `${REPO}/.git/hooks` });
    const verdict = await refineLocalVerdict(
      ask({
        files: [
          { path: `${REPO}/a.ts`, status: "modified" },
          { path: `${REPO}/b/c.ts`, status: "added" },
        ],
      }),
      ALLOW,
      REPO,
      { realpath },
    );
    expect(verdict.reply).toBe("reject");
  });

  it("laisse le verdict tel quel quand la racine ne résout pas", async () => {
    // A silent IO should not stop the round: the PUR check has already taken place.
    const realpath = async (): Promise<string> => {
      throw new Error("ENOENT");
    };
    expect(
      await refineLocalVerdict(ask({ filepath: `${REPO}/lib/x.ts` }), ALLOW, REPO, { realpath }),
    ).toEqual(ALLOW);
  });

  it("rejects a symlink into another repository", async () => {
    const realpath = realpathOf({
      [REPO]: REPO,
      [`${REPO}/voisin`]: "/Users/dev/Projets/voisin/.git",
    });
    const verdict = await refineLocalVerdict(
      ask({ filepath: `${REPO}/voisin/hooks/pre-commit` }),
      ALLOW,
      REPO,
      { realpath },
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toMatch(/escapes the repository/i);
  });
});

describe("refineLocalVerdict — repository reads", () => {
  it("rejects a repository symlink that targets a host credential", async () => {
    const realpath = realpathOf({ [REPO]: REPO, [`${REPO}/notes`]: "/Users/dev/.ssh" });
    const verdict = await refineLocalVerdict(
      ask({ permission: "read", filepath: `${REPO}/notes/id_rsa` }),
      ALLOW,
      REPO,
      { realpath },
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.reason).toBe("local_capability_disabled");
  });
});

describe("refineLocalVerdict — direct network access", () => {
  const fetchAsk = (url: string) => ask({ permission: "webfetch", url });

  it("rejects a public hostname without resolving it", async () => {
    const verdict = await refineLocalVerdict(
      fetchAsk("https://docs.example.com:4096/guide"),
      ALLOW,
      REPO,
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.reason).toBe("local_capability_disabled");
  });

  it("rejects mixed public and private destinations", async () => {
    const verdict = await refineLocalVerdict(fetchAsk("https://example.com:51234"), ALLOW, REPO);
    expect(verdict.reply).toBe("reject");
  });

  it("rejects unresolvable names without DNS access", async () => {
    const verdict = await refineLocalVerdict(fetchAsk("https://nowhere.example:4096"), ALLOW, REPO);
    expect(verdict.reply).toBe("reject");
  });

  it("rejects literal loopback destinations", async () => {
    const verdict = await refineLocalVerdict(fetchAsk("http://127.0.0.1:4096/x"), ALLOW, REPO);
    expect(verdict.reply).toBe("reject");
  });

  /**
 * PARITY GAP #1 IN THE FILE, closed: an agent who cannot go
 * see the page he has just written no longer has a feedback loop at all.
 */
  it("rejects local development servers", async () => {
    for (const url of ["http://localhost:3000/", "http://127.0.0.1:3000/api/health"]) {
      const verdict = await refineLocalVerdict(fetchAsk(url), ALLOW, REPO);
      expect(verdict.reply, url).toBe("reject");
    }
  });

  it("rejects ordinary public URLs", async () => {
    const verdict = await refineLocalVerdict(
      fetchAsk("https://developer.mozilla.org/en-US/"),
      ALLOW,
      REPO,
    );
    expect(verdict.reply).toBe("reject");
  });

  /**
 * WITHOUT A PORT LIST, THE ENTIRE LOCAL LOOP REMAINS DENIED. Ignorance does not
 * is not interpreted as authorization: this is the behavior before D8, and it is
 * what must remain if one day the supervisor forgets to pass its ports.
 */
  it("rejects private destinations without additional policy inputs", async () => {
    const verdict = await refineLocalVerdict(fetchAsk("http://localhost:3000/"), ALLOW, REPO, {});
    expect(verdict.reply).toBe("reject");
  });
});

describe("refineLocalVerdict — le sens de la fonction", () => {
  it("ne peut que refuser ce qui était autorisé, jamais l'inverse", async () => {
    // This is what makes it safe to insert after a verdict: a refusal stands out
    // intact, and we don't even touch the disk.
    const rejected: PermissionVerdict = { reply: "reject", message: "non" };
    const realpath = async (): Promise<string> => {
      throw new Error("le disque ne doit pas être touché");
    };
    expect(
      await refineLocalVerdict(ask({ filepath: `${REPO}/lib/x.ts` }), rejected, REPO, { realpath }),
    ).toEqual(rejected);
  });

  it("ne touche pas aux permissions qui ne la concernent pas", async () => {
    expect(await refineLocalVerdict(ask({ permission: "bash", command: "ls" }), ALLOW, REPO)).toEqual(
      ALLOW,
    );
  });
});
