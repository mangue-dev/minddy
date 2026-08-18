import { describe, expect, it } from "vitest";

import { realPathOf, refineLocalVerdict } from "./local-guard";
import { isPrivateAddress, isPrivateHostname, fetchHostname } from "./private-address";
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

describe("private-address", () => {
  it("reconnaît la machine, son réseau et son VPN", () => {
    for (const address of [
      "127.0.0.1", "127.1.2.3", "0.0.0.0",
      "10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.1.10",
      "169.254.169.254", // the metadata of the clouds, while we're at it
      "100.100.1.2", // Tailscale
      "::1", "fd12:3456::1", "fe80::1",
      "::ffff:127.0.0.1", // the same address, written in IPv6
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("laisse passer une adresse publique", () => {
    for (const address of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "192.169.0.1", "2606:4700::1"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("refuse les noms qui ne désignent que le réseau local", () => {
    for (const host of ["localhost", "app.localhost", "nas.local", "db.internal", ""]) {
      expect(isPrivateHostname(host), host).toBe(true);
    }
    expect(isPrivateHostname("example.com")).toBe(false);
    // A full stop is an absolute form of the same name.
    expect(isPrivateHostname("nas.local.")).toBe(true);
  });

  it("lit le nom d'hôte d'une URL, avec ou sans schéma", () => {
    expect(fetchHostname("https://example.com/docs")).toBe("example.com");
    expect(fetchHostname("http://127.0.0.1:4096/x")).toBe("127.0.0.1");
    expect(fetchHostname("http://[::1]:8080/")).toBe("::1");
    expect(fetchHostname("[::1]:8080")).toBe("::1");
    expect(fetchHostname("example.com/docs")).toBe("example.com");
    expect(fetchHostname(undefined)).toBe("");
  });
});

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

describe("refineLocalVerdict — les écritures", () => {
  /**
 * MIN-364 (decision D5) — THE DEPOSIT EXIT GUARD DISAPPEARED WITH THE
 * PERIMETER IT WAS GUARDING.
 *
 * It only existed to prevent a `ln -s` from releasing a writing
 * of a perimeter which no longer exists: the disk is now reachable in
 * straight line, and refusing the symbolic link would have been refusing by the door
 * from behind what is authorized by the large one.
 */
  it("laisse passer un lien qui sort du dépôt — le disque est ouvert", async () => {
    const realpath = realpathOf({ [REPO]: REPO, [`${REPO}/notes`]: "/Users/dev/Projets/voisin" });
    expect(
      await refineLocalVerdict(ask({ filepath: `${REPO}/notes/x.ts` }), ALLOW, REPO, { realpath }),
    ).toEqual(ALLOW);
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

  /**
 * AND THE `.git/` OF A NEIGHBORHOOD REPOSITORY ALSO. The perimeter opened, the rule
 * `.git` did not open with: a hook placed in the next repository
 * executes on the next git gesture of its owner, exactly like here.
 */
  it("refuse un lien qui mène dans le `.git/` d'un AUTRE dépôt", async () => {
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
    expect(verdict.message).toMatch(/\.git/i);
  });
});

/**
 * MIN-364 (decision D8) — THE FETCH IS JUDGED ON THE PORT, MORE ON THE PRIVATE SPACE.
 *
 * The refusal before concerned the entire local loop, and its collateral damage
 * was the capacity we wanted: `curl localhost:3000` to see the
 * page that we have just written return. What remains denied is what isn't a page —
 * the LLM proxy (it carries the model key), the tools bridge (it doesn't authenticate
 * anything), and the round's opencode server (its API responds to who joins it).
 *
 * `HARNESS` plays the three ports that supervisor knows.
 */
describe("refineLocalVerdict — les fetchs", () => {
  const fetchAsk = (url: string) => ask({ permission: "webfetch", url });
  const HARNESS = [4096, 4097, 51234];

  it("refuse un domaine PUBLIC qui résout vers un port du harness", async () => {
    // This is the form that an attack has: the literal one seems impeccable.
    const verdict = await refineLocalVerdict(fetchAsk("https://docs.example.com:4096/guide"), ALLOW, REPO, {
      resolve: async () => ["127.0.0.1"],
      harnessPorts: HARNESS,
    });
    expect(verdict.reply).toBe("reject");
    expect(verdict.reason).toBe("private_fetch");
    expect(verdict.message).toMatch(/harness's own service/i);
  });

  it("refuse dès qu'UNE des adresses est privée, sur un port du harness", async () => {
    const verdict = await refineLocalVerdict(fetchAsk("https://example.com:51234"), ALLOW, REPO, {
      resolve: async () => ["93.184.216.34", "192.168.1.5"],
      harnessPorts: HARNESS,
    });
    expect(verdict.reply).toBe("reject");
  });

  it("refuse un nom du port du harness qui ne résout pas", async () => {
    // A name we know nothing about, on a port that is ours, is exactly what
    // that this safeguard exists so as not to let people pass.
    const verdict = await refineLocalVerdict(fetchAsk("https://nowhere.example:4096"), ALLOW, REPO, {
      resolve: async () => {
        throw new Error("ENOTFOUND");
      },
      harnessPorts: HARNESS,
    });
    expect(verdict.reply).toBe("reject");
  });

  it("refuse le littéral sans même appeler le résolveur", async () => {
    let called = 0;
    const verdict = await refineLocalVerdict(fetchAsk("http://127.0.0.1:4096/x"), ALLOW, REPO, {
      resolve: async () => {
        called += 1;
        return [];
      },
      harnessPorts: HARNESS,
    });
    expect(verdict.reply).toBe("reject");
    expect(called).toBe(0);
  });

  /**
 * PARITY GAP #1 IN THE FILE, closed: an agent who cannot go
 * see the page he has just written no longer has a feedback loop at all.
 */
  it("laisse passer le serveur de dév de l'utilisateur", async () => {
    for (const url of ["http://localhost:3000/", "http://127.0.0.1:3000/api/health"]) {
      expect(
        await refineLocalVerdict(fetchAsk(url), ALLOW, REPO, { harnessPorts: HARNESS }),
        url,
      ).toEqual(ALLOW);
    }
  });

  it("ne résout MÊME PAS un nom public qui ne vise aucun port du harness", async () => {
    // Control only concerns our ports: resolving the rest would be a
    // DNS round trip by fetch, for a verdict that cannot change.
    let called = 0;
    const verdict = await refineLocalVerdict(fetchAsk("https://developer.mozilla.org/en-US/"), ALLOW, REPO, {
      resolve: async () => {
        called += 1;
        return ["93.184.216.34"];
      },
      harnessPorts: HARNESS,
    });
    expect(verdict).toEqual(ALLOW);
    expect(called).toBe(0);
  });

  /**
 * WITHOUT A PORT LIST, THE ENTIRE LOCAL LOOP REMAINS DENIED. Ignorance does not
 * is not interpreted as authorization: this is the behavior before D8, and it is
 * what must remain if one day the supervisor forgets to pass its ports.
 */
  it("refuse tout le privé quand les ports du harness sont inconnus", async () => {
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
