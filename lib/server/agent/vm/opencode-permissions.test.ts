import { describe, expect, it } from "vitest";

import {
  decidePermission,
  editTargets,
  type PermissionAsk,
  type SubagentContext,
} from "./opencode-permissions";
import { FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { REPO_DIR } from "../repo-host";

/**
 * MIN-286 lot 2 — le verdict du harness sur une demande de permission d'opencode.
 *
 * Logique PURE, donc testée comme [prune.test.ts](../prune.test.ts) : on appelle,
 * on assert, rien à monter. Ce qu'elle protège n'a pas changé de nature — le
 * travail non commité (`command-guard`) et le dépôt (`repo-path`) —, seul
 * l'endroit où la question est posée a changé.
 */

const ask = (over: Partial<PermissionAsk>): PermissionAsk => ({
  id: "per_1",
  sessionId: "ses_1",
  permission: "bash",
  callId: "call_1",
  ...over,
});

describe("les commandes", () => {
  it("laisse passer ce qui ne détruit rien", () => {
    for (const command of ["echo hi", "npm test", "git status", "git add -A"]) {
      expect(decidePermission(ask({ command }))).toEqual({ reply: "once" });
    }
  });

  it("refuse ce que `command-guard` refuse, en disant pourquoi au modèle", () => {
    const verdict = decidePermission(ask({ command: "git reset --hard" }));
    expect(verdict.reply).toBe("reject");
    // Le message VOYAGE : opencode le recopie dans l'erreur du tool, et c'est là
    // que le modèle le lit. Un refus muet le laisserait deviner.
    expect(verdict.message).toContain("the harness owns git");
    // Et le refus reste mesurable en base, comme du temps de la boucle maison.
    expect(verdict.reason).toBe(FORBIDDEN_COMMAND_REASON);
  });

  it("refuse une demande dont il ne sait pas lire la commande", () => {
    expect(decidePermission(ask({ command: "  " })).reply).toBe("reject");
  });
});

describe("les écritures", () => {
  it("laisse passer un fichier du dépôt, relatif ou absolu", () => {
    expect(decidePermission(ask({ permission: "edit", filepath: "lib/a.ts" }))).toEqual({
      reply: "once",
    });
    expect(
      decidePermission(ask({ permission: "edit", filepath: `${REPO_DIR}/lib/a.ts` })),
    ).toEqual({ reply: "once" });
  });

  it("refuse ce qui sort du dépôt — y compris en chemin ABSOLU", () => {
    // Le piège du branchement : `resolveWithin` recolle un absolu sous le dépôt
    // (`/etc/passwd` → `<dépôt>/etc/passwd`), donc ne refuse rien. Or opencode
    // rend justement `metadata.filepath` en absolu.
    expect(decidePermission(ask({ permission: "edit", filepath: "/etc/passwd" })).reply).toBe(
      "reject",
    );
    expect(decidePermission(ask({ permission: "edit", filepath: "../../etc/passwd" })).reply).toBe(
      "reject",
    );
  });

  it("refuse `.git/`, qu'opencode écrit sans rien demander", () => {
    // Mesuré : `write` sur `<dépôt>/.git/config` a été exécuté et a écrasé le
    // fichier. C'est la raison d'être du `ask` sur `edit`.
    const verdict = decidePermission(ask({ permission: "edit", filepath: `${REPO_DIR}/.git/config` }));
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain(".git");
  });

  it("refuse une demande sans chemin", () => {
    expect(decidePermission(ask({ permission: "edit" })).reply).toBe("reject");
  });
});

/**
 * `apply_patch` — UNE demande pour N fichiers (mesuré sur opencode-ai@1.18.16 :
 * `ask({permission: "edit", metadata: {filepath: chemins.join(", "), files}})`).
 * Le `filepath` recollé n'est pas un chemin : lu comme tel, il faisait passer
 * `a.ts, .git` pour un unique segment de répertoire, et le garde-fou du dépôt ne
 * voyait plus le `.git/` qui suivait.
 */
describe("les écritures d'un patch multi-fichiers", () => {
  const patch = (files: { path: string; status: "added" | "modified" | "deleted" }[]) =>
    ask({
      permission: "edit",
      filepath: files.map((f) => f.path).join(", "),
      files,
    });

  it("laisse passer quand TOUS les fichiers sont dans le dépôt", () => {
    expect(
      decidePermission(
        patch([
          { path: `${REPO_DIR}/lib/a.ts`, status: "modified" },
          { path: `${REPO_DIR}/lib/b.ts`, status: "added" },
        ]),
      ),
    ).toEqual({ reply: "once" });
  });

  it("refuse dès qu'UN fichier sort du dépôt, fût-il le dernier", () => {
    const verdict = decidePermission(
      patch([
        { path: `${REPO_DIR}/lib/a.ts`, status: "modified" },
        { path: "/etc/passwd", status: "modified" },
      ]),
    );
    expect(verdict.reply).toBe("reject");
  });

  it("refuse un `.git/` caché derrière un premier fichier légitime", () => {
    const verdict = decidePermission(
      patch([
        { path: `${REPO_DIR}/lib/a.ts`, status: "modified" },
        { path: `${REPO_DIR}/.git/config`, status: "modified" },
      ]),
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain(".git");
  });

  it("ne lit JAMAIS le filepath recollé comme un chemin", () => {
    // Sans `files`, c'est cette chaîne-là qui servait de chemin unique.
    const joined = ask({
      permission: "edit",
      filepath: `${REPO_DIR}/lib/a.ts, ${REPO_DIR}/.git/config`,
      files: [
        { path: `${REPO_DIR}/lib/a.ts`, status: "modified" },
        { path: `${REPO_DIR}/.git/config`, status: "modified" },
      ],
    });
    expect(decidePermission(joined).reply).toBe("reject");
  });
});

describe("editTargets", () => {
  it("rend la liste de `files` quand elle est là, avec la nature du geste", () => {
    expect(
      editTargets(
        ask({
          permission: "edit",
          filepath: "a.ts, b.ts",
          files: [
            { path: "a.ts", status: "added" },
            { path: "b.ts", status: "deleted" },
          ],
        }),
      ),
    ).toEqual([
      { path: "a.ts", status: "added" },
      { path: "b.ts", status: "deleted" },
    ]);
  });

  it("retombe sur le `filepath` seul des tools mono-fichier", () => {
    expect(editTargets(ask({ permission: "edit", filepath: "lib/a.ts" }))).toEqual([
      { path: "lib/a.ts", status: "modified" },
    ]);
  });

  it("ne rend rien quand il n'y a rien à lire", () => {
    expect(editTargets(ask({ permission: "edit" }))).toEqual([]);
    expect(editTargets(ask({ permission: "edit", filepath: "   " }))).toEqual([]);
  });
});

/**
 * La délégation (tâche 12). Mesuré sur le binaire le 2026-08-12 : la demande de
 * permission d'un `task` porte `patterns: ["explore-cheap"]` et
 * `metadata: {description, subagent_type}` — **et elle arrive avant** qu'opencode
 * ne résolve l'agent. C'est ce qui rend ces deux refus possibles.
 */
describe("la délégation", () => {
  const context = (over: Partial<SubagentContext> = {}): SubagentContext => ({
    names: new Set(["explore", "general", "explore-anthropic-claude-haiku-4-5"]),
    running: 0,
    maxParallel: 2,
    ...over,
  });

  const task = (subagentType: string) =>
    ask({ permission: "task", subagentType });

  it("laisse déléguer sur un sous-agent offert", () => {
    expect(decidePermission(task("explore"), context())).toEqual({ reply: "once" });
    expect(
      decidePermission(task("explore-anthropic-claude-haiku-4-5"), context()),
    ).toEqual({ reply: "once" });
  });

  it("tient le plafond de simultané, et le DIT au modèle", () => {
    // Le sandbox est partagé : deux filles qui écrivent en même temps se
    // marchent dessus. Même refus, aux mots près, que le registre maison.
    const verdict = decidePermission(task("general"), context({ running: 2, maxParallel: 2 }));
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("2/2");
    expect(verdict.reason).toBe("subagent_limit");
  });

  /**
   * MIN-286 — LE CAS QUE LE PLAFOND A À BORNER, ET LE SEUL.
   *
   * Chez opencode, le `task` de premier plan BLOQUE le parent : le simultané ne
   * peut venir que d'un round qui appelle `task` PLUSIEURS FOIS. Or ces demandes
   * sont toutes arbitrées avant qu'aucune fille n'existe — le flux ne rattache une
   * fille qu'après coup (`opencode-delegation.test.ts` ancre `runningAtAsk === 0`).
   * Compté sur les seules vivantes, le plafond valait donc zéro aux trois, et ne
   * bornait rien. C'est le crédit ouvert par les autorisations qui le tient.
   */
  it("compte les délégations AUTORISÉES dont la fille n'est pas encore née", () => {
    const verdict = decidePermission(
      task("general"),
      context({ running: 0, pending: 2, maxParallel: 2 }),
    );
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("2/2");
    expect(verdict.reason).toBe("subagent_limit");
  });

  it("additionne les vivantes et les promises", () => {
    expect(
      decidePermission(task("general"), context({ running: 1, pending: 1, maxParallel: 2 })).reply,
    ).toBe("reject");
    expect(
      decidePermission(task("general"), context({ running: 1, pending: 0, maxParallel: 2 })).reply,
    ).toBe("once");
  });

  it("rend l'offre au modèle qui demande un sous-agent qui n'existe pas", () => {
    // Opencode répondrait « Unknown agent type: X » sans dire ce qui est offert.
    const verdict = decidePermission(task("general-openai-gpt-5"), context());
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain("general-openai-gpt-5");
    expect(verdict.message).toContain("explore-anthropic-claude-haiku-4-5");
    expect(verdict.reason).toBe("unknown_subagent");
  });

  it("ne refuse rien quand personne ne lui a donné l'offre du tour", () => {
    // Un garde-fou qui ne sait pas ce qui est offert ne doit pas inventer un
    // refus : la config a déjà tranché ce qui existe.
    expect(decidePermission(task("explore"))).toEqual({ reply: "once" });
  });
});

describe("le reste", () => {
  it("refuse le disque hors dépôt", () => {
    expect(
      decidePermission(ask({ permission: "external_directory", filepath: "/etc/x" })).reply,
    ).toBe("reject");
  });

  it("laisse passer ce qui n'est pas gardé (la config l'a déjà tranché)", () => {
    expect(decidePermission(ask({ permission: "webfetch" }))).toEqual({ reply: "once" });
  });
});
