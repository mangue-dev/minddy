import { describe, expect, it } from "vitest";

import { realPathOf, refineLocalVerdict } from "./local-guard";
import { isPrivateAddress, isPrivateHostname, fetchHostname } from "./private-address";
import type { PermissionAsk, PermissionVerdict } from "./opencode-permissions";

/**
 * MIN-360 — LES DEUX GARDE-FOUS QUI ONT BESOIN DU DISQUE ET DU RÉSOLVEUR.
 *
 * `decidePermission` est pur et le reste ; ce qui est testé ici, ce sont les deux
 * contrôles qu'aucune chaîne de caractères ne peut rendre : le lien symbolique
 * créé DANS le dépôt (que `ln -s` pose sans qu'aucun garde-fou le voie) et le
 * domaine public qui résout vers la boucle locale.
 *
 * Les deux IO sont injectées, donc le fichier ne touche ni au disque ni au réseau.
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
 * Un faux `realpath` : la table est le disque. Ce qui y est décrit existe et rend
 * sa cible réelle ; **tout ce qui n'y est pas LÈVE**, comme le vrai sur un fichier
 * qui n'a pas encore été créé — et c'est exactement le cas que `realPathOf` doit
 * savoir traiter.
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
      "169.254.169.254", // le métadata des clouds, tant qu'à faire
      "100.100.1.2", // Tailscale
      "::1", "fd12:3456::1", "fe80::1",
      "::ffff:127.0.0.1", // la même adresse, écrite en IPv6
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
    // Un point final est une forme absolue du même nom.
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
    // Une écriture crée souvent le fichier : `realpath` du fichier lèverait, et
    // c'est le DOSSIER lié qui compte.
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
   * MIN-364 (décision D5) — LA GARDE DE SORTIE DE DÉPÔT A DISPARU AVEC LE
   * PÉRIMÈTRE QU'ELLE GARDAIT.
   *
   * Elle n'existait que pour empêcher un `ln -s` de faire sortir une écriture
   * d'un périmètre qui n'existe plus : le disque est désormais atteignable en
   * ligne droite, et refuser le lien symbolique aurait été refuser par la porte
   * de derrière ce qu'on autorise par la grande.
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
    // Le second passe par un lien qui mène dans `.git/` : c'est ce qui reste
    // gardé, et il ne doit pas être sauvé par le fait d'être en second.
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
    // Une IO muette ne doit pas arrêter le tour : le contrôle PUR a déjà eu lieu.
    const realpath = async (): Promise<string> => {
      throw new Error("ENOENT");
    };
    expect(
      await refineLocalVerdict(ask({ filepath: `${REPO}/lib/x.ts` }), ALLOW, REPO, { realpath }),
    ).toEqual(ALLOW);
  });

  /**
   * ET LE `.git/` D'UN DÉPÔT VOISIN AUSSI. Le périmètre s'est ouvert, la règle
   * `.git` ne s'est pas ouverte avec : un hook posé dans le dépôt d'à côté
   * s'exécute au prochain geste git de son propriétaire, exactement comme ici.
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
 * MIN-364 (décision D8) — LE FETCH SE JUGE SUR LE PORT, PLUS SUR L'ESPACE PRIVÉ.
 *
 * Le refus d'avant portait sur toute la boucle locale, et son dommage collatéral
 * était la capacité qu'on veut : `curl localhost:3000` pour aller voir rendre la
 * page qu'on vient d'écrire. Ce qui reste refusé est ce qui n'est pas une page —
 * le proxy LLM (il porte la clé du modèle), le pont de tools (il n'authentifie
 * rien) et le serveur opencode du tour (son API répond à qui la joint).
 *
 * `HARNESS` joue les trois ports que le superviseur connaît.
 */
describe("refineLocalVerdict — les fetchs", () => {
  const fetchAsk = (url: string) => ask({ permission: "webfetch", url });
  const HARNESS = [4096, 4097, 51234];

  it("refuse un domaine PUBLIC qui résout vers un port du harness", async () => {
    // C'est la forme qu'a une attaque : le littéral, lui, a l'air irréprochable.
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
    // Un nom dont on ne sait rien, sur un port qui est le nôtre, est exactement ce
    // que ce garde-fou existe pour ne pas laisser passer.
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
   * L'ÉCART DE PARITÉ N°1 DU DOSSIER, refermé : un agent qui ne peut pas aller
   * voir la page qu'il vient d'écrire n'a plus de boucle de feedback du tout.
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
    // Le contrôle ne porte que sur nos ports : résoudre le reste serait un
    // aller-retour DNS par fetch, pour un verdict qui ne peut pas changer.
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
   * SANS LISTE DE PORTS, TOUTE LA BOUCLE LOCALE RESTE REFUSÉE. Une ignorance ne
   * s'interprète pas en autorisation : c'est le comportement d'avant D8, et c'est
   * ce qui doit rester si un jour le superviseur oublie de passer ses ports.
   */
  it("refuse tout le privé quand les ports du harness sont inconnus", async () => {
    const verdict = await refineLocalVerdict(fetchAsk("http://localhost:3000/"), ALLOW, REPO, {});
    expect(verdict.reply).toBe("reject");
  });
});

describe("refineLocalVerdict — le sens de la fonction", () => {
  it("ne peut que refuser ce qui était autorisé, jamais l'inverse", async () => {
    // C'est ce qui la rend sûre à insérer après un verdict : un refus ressort
    // intact, et on ne touche même pas au disque.
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
