import { beforeEach, describe, expect, it, vi } from "vitest";

// Les quatre contrôles sont moqués : ce fichier ne teste pas ce qu'ils DISENT
// (chacun a son test, inchangé), il teste ce que le monde d'opencode leur donne
// à lire — une écriture autorisée, une commande terminée, un plan écrit — et par
// où leur réponse revient au modèle.
vi.mock("../diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../diagnostics")>()),
  typeErrorsForTurn: vi.fn(async () => "TYPES"),
  testFailuresForTurn: vi.fn(async () => ({ block: "TESTS", scope: "full" as const })),
}));
vi.mock("../self-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../self-review")>()),
  formatSelfReview: vi.fn(() => "DIFF"),
}));
vi.mock("../plan-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plan-review")>()),
  planReviewForTurn: vi.fn(async () => "PLAN_REVIEW"),
}));
vi.mock("../plan-closure", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plan-closure")>()),
  planClosureForTurn: vi.fn(async () => "PLAN_CLOSURE"),
}));
vi.mock("../repo-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../repo-host")>()),
  // La TAILLE du tour choisit la portée du passage de tests (MIN-262). Un gros
  // tour par défaut : c'est le cas qui paie la suite entière.
  turnDiffStat: vi.fn(async () => ({ files: ["a.ts", "b.ts", "c.ts", "d.ts"], lines: 400, untracked: 0 })),
}));

import { makeOpencodeDelivery, repoRelative } from "./opencode-delivery";
import { typeErrorsForTurn, testFailuresForTurn } from "../diagnostics";
import { turnDiffStat, type RepoHost } from "../repo-host";
import { cloudLayout, layoutForRoot } from "../harness-layout";

/** Le dépôt du run testé — celui que le host inerte ci-dessous déclare. */
const REPO_DIR = cloudLayout().repoDir;

/**
 * MIN-286 lot 2, tâche 14 — LES RÈGLES DE LIVRAISON, DANS LE MONDE D'OPENCODE.
 *
 * Ce qui est vérifié n'a pas changé : `delivery-gate`, `self-review`,
 * `plan-closure` et `diagnostics` sont les mêmes fonctions, avec leurs tests
 * inchangés. Ce fichier teste le CÂBLAGE, c'est-à-dire les trois endroits où le
 * virage aurait pu le casser en silence :
 *
 * 1. l'édition ne vient plus d'un de nos tools mais d'une **demande de
 *    permission** (chemin ABSOLU) ;
 * 2. le « le modèle a testé lui-même » ne vient plus du code de sortie de
 *    `run_command` mais du **`metadata.exit` du `bash`** d'opencode ;
 * 3. la voix du harness ne part plus en message `user` mais en **`followUp`**,
 *    que le pont colle au texte du résultat de tool.
 */

/** Host inerte : les contrôles sont moqués, rien n'a besoin de tourner. */
function fakeHost(): RepoHost {
  return {
    layout: cloudLayout(),
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
}

/**
 * Un dépôt qui RÉPOND : `git diff --name-only` (suppressions comprises) et
 * `git status --porcelain` (fichiers neufs). C'est là que le sondage va chercher
 * ce qu'aucun tool d'écriture n'a annoncé.
 */
function repoSaying(diffNames: string, porcelain: string): RepoHost {
  return {
    ...fakeHost(),
    exec: async (command: string) => ({
      exitCode: 0,
      stdout: command.includes("status --porcelain") ? porcelain : diffNames,
      stderr: "",
    }),
  } as RepoHost;
}

/** Budget large : aucun contrôle n'est empêché par le temps restant. */
const ROOMY = 12 * 60 * 60_000;

function deliveryFor(over: Partial<Parameters<typeof makeOpencodeDelivery>[0]> = {}) {
  const phases: string[] = [];
  const delivery = makeOpencodeDelivery({
    host: fakeHost(),
    emit: async (_type, payload) => {
      if (typeof payload.phase === "string") phases.push(payload.phase);
    },
    filesFromSha: "abc123",
    remainingMs: () => ROOMY,
    ...over,
  });
  return { delivery, phases };
}

/** Le passe-plat du pont : il rend ce qu'on lui dit, sans rien vérifier. */
function forwarder(success = true) {
  return async () => ({ result: { ok: success }, success });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("l'édition, lue sur la demande de permission", () => {
  it("note le chemin RELATIF d'une écriture autorisée, et le sert au type-check", async () => {
    // `metadata.filepath` est absolu chez opencode ; le type-check et le mode
    // ciblé du runner parlent en chemins de dépôt. La conversion est ici, une
    // seule fois — la faire ailleurs la ferait manquer quelque part.
    const { delivery } = deliveryFor();
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);

    expect(delivery.checkpointEditedPaths()).toEqual(["lib/x.ts"]);

    const checks = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    expect(checks.followUp).toContain("TYPES");
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["lib/x.ts"]);
    // Le type-check VIDE la liste en passant (`delivery-gate.ts`) : ce qui reste
    // au checkpoint est ce qui n'a pas encore été vu, pas un journal du tour.
    expect(delivery.checkpointEditedPaths()).toEqual([]);
  });

  it("ignore un chemin hors du dépôt plutôt que de le mettre en tête des erreurs", () => {
    const { delivery } = deliveryFor();
    delivery.noteEdit("/etc/passwd");
    expect(delivery.checkpointEditedPaths()).toEqual([]);
  });

  it("latche `repoTouched` pour le tour SUIVANT, même sans pull request", () => {
    // Un tour qui n'ouvre pas de PR ne franchit jamais la porte : sans ce verrou
    // au checkpoint, le tour repris se croit vierge et le code part sans contrôle.
    const { delivery } = deliveryFor();
    expect(delivery.repoTouched()).toBe(false);
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);
    delivery.noteEdits();
    expect(delivery.repoTouched()).toBe(true);
  });

  it("repart des chemins que le checkpoint portait", async () => {
    const { delivery } = deliveryFor({ editedPaths: ["lib/hier.ts"], repoTouched: true });
    delivery.noteEdit(`${REPO_DIR}/lib/aujourdhui.ts`);
    expect(delivery.checkpointEditedPaths()).toEqual(["lib/hier.ts", "lib/aujourdhui.ts"]);
  });
});

describe("ce que le modèle a vérifié lui-même (MIN-262)", () => {
  it("se tait sur les tests quand une commande de test est sortie en 0", async () => {
    const { delivery, phases } = deliveryFor({ repoTouched: true });
    delivery.noteShell("npx vitest run", 0);

    const out = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    // La porte parle encore (types, diff) mais n'a RIEN relancé : 80 s de mur
    // économisées pour apprendre ce que le tour vient de lire.
    expect(vi.mocked(testFailuresForTurn)).not.toHaveBeenCalled();
    expect(out.followUp).not.toContain("TESTS");
    expect(phases).toContain("tests");
  });

  it("relance quand la commande est sortie ROUGE", async () => {
    const { delivery } = deliveryFor({ repoTouched: true });
    delivery.noteShell("npx vitest run", 1);

    const out = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    expect(out.followUp).toContain("TESTS");
  });

  it("relance quand une édition a suivi le vert — vert AVANT la dernière édition ne vaut rien", async () => {
    const { delivery } = deliveryFor();
    delivery.noteShell("npm test", 0);
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);

    const out = await delivery.wrapCreatePr(async () => ({ result: {}, success: true }))({});

    expect(out.followUp).toContain("TESTS");
  });
});

describe("la porte de `create_pr`", () => {
  it("rend les contrôles au premier appel sans pousser, puis livre au second", async () => {
    const opened: string[] = [];
    const { delivery } = deliveryFor();
    delivery.noteEdit(`${REPO_DIR}/lib/x.ts`);
    const createPr = delivery.wrapCreatePr(async (args) => {
      opened.push(String(args.title));
      return { result: { url: "https://pr/1" }, success: true };
    });

    const first = await createPr({ title: "Mon titre" });
    expect(opened).toEqual([]);
    expect(first.success).toBe(true);
    expect(first.followUp).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");

    const second = await createPr({ title: "Mon titre" });
    expect(opened).toEqual(["Mon titre"]);
    expect(second.followUp).toBeUndefined();
  });

  it("laisse passer du premier coup un tour qui n'a rien touché", async () => {
    // Rien édité ET arbre de travail propre : c'est la conjonction qui définit
    // « n'a rien touché » depuis que le shell compte (cf. le cas suivant).
    vi.mocked(turnDiffStat).mockResolvedValueOnce({ files: [], lines: 0, untracked: 0 });
    const { delivery } = deliveryFor();
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    const out = await createPr({});
    expect(out.result).toEqual({ url: "u" });
    expect(out.followUp).toBeUndefined();
  });

  /**
   * MIN-286 — LE TOUR QUI N'A ÉDITÉ PAR AUCUN TOOL.
   *
   * Supprimer et renommer sont des COMMANDES chez opencode, plus des tools : un
   * `rm`, un `mv`, un `sed -i` ne passent par aucune demande de permission `edit`,
   * donc `editedPaths` reste vide et la porte restait muette — pas de type-check,
   * pas de tests, pas de relecture du diff, sur un tour qui a bel et bien changé
   * le dépôt. C'est l'arbre de travail qui tranche.
   */
  it("réclame quand même ses contrôles quand le dépôt a bougé par le SHELL", async () => {
    const { delivery } = deliveryFor();
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    const out = await createPr({});
    expect(out.followUp).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");
    // Les fichiers encore là entrent dans le type-check ciblé : c'est ce qu'un
    // codemod vient de réécrire.
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"]);
  });

  it("compte une SUPPRESSION seule, et la donne au type-check", async () => {
    /**
     * MIN-286 — `turnDiffStat` exclut les suppressions de `files`
     * (`--diff-filter=d`) : sa liste est celle qu'on passe à `vitest related`, où
     * un chemin disparu n'a pas de sens. Le type-check, lui, en a besoin — c'est
     * même le changement qui casse le typage AILLEURS, et la porte se tait sur
     * une liste vide. La boucle maison notait le chemin (`delete_file` →
     * `noteEdited`) ; il vient maintenant de git.
     */
    vi.mocked(turnDiffStat).mockResolvedValueOnce({ files: [], lines: 42, untracked: 0 });
    const { delivery } = deliveryFor({ host: repoSaying("lib/y.ts\n", "") });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    expect((await createPr({})).followUp).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["lib/y.ts"]);
  });

  it("compte un fichier NEUF créé au shell, que git ne suit pas encore", async () => {
    vi.mocked(turnDiffStat).mockResolvedValueOnce({ files: [], lines: 0, untracked: 1 });
    const { delivery } = deliveryFor({ host: repoSaying("", "?? lib/neuf.ts\n") });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    await createPr({});
    expect(vi.mocked(typeErrorsForTurn).mock.calls[0][1]).toEqual(["lib/neuf.ts"]);
  });

  /**
   * MIN-358 — LE PÉRIMÈTRE, quand le dépôt n'est pas à nous. Sans lui, le sondage
   * lit l'arbre de travail ENTIER : le WIP de l'utilisateur ferait dire à un tour
   * purement conversationnel qu'il a touché au dépôt, et lui ferait payer un
   * type-check et une suite de tests sur des fichiers dont il n'a jamais entendu
   * parler.
   */
  /**
   * MIN-358 — LES ÉDITIONS DE CE TOUR, distinctes du cumul du checkpoint. La
   * distinction ne servait à rien tant que le dépôt était à nous ; elle décide de
   * tout en mode dépôt courant, où le travail des tours PRÉCÉDENTS est encore
   * « modifié » dans l'arbre (nos commits vivent sur une ref, pas sur le HEAD de
   * l'utilisateur) — et serait donc pris pour le sien.
   */
  it("sépare les éditions de CE tour de celles qu'il a héritées", () => {
    const { delivery } = deliveryFor({ editedPaths: ["hier.ts"] });
    delivery.noteEdit(`${REPO_DIR}/aujourdhui.ts`);

    expect(delivery.turnEditedPaths()).toEqual(["aujourdhui.ts"]);
    expect(delivery.checkpointEditedPaths()).toEqual(["hier.ts", "aujourdhui.ts"]);
  });

  it("borne les lectures de diff au périmètre du tour en mode dépôt courant", async () => {
    const { delivery } = deliveryFor({
      host: repoSaying("", ""),
      scopePaths: async () => ["lib/a.ts"],
    });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    await createPr({});
    expect(vi.mocked(turnDiffStat).mock.calls[0][2]).toEqual(["lib/a.ts"]);
  });

  it("ne borne RIEN en mode clone — l'arbre n'y contient que le travail de l'agent", async () => {
    const { delivery } = deliveryFor({ host: repoSaying("", "") });
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    await createPr({});
    expect(vi.mocked(turnDiffStat).mock.calls[0][2]).toBeUndefined();
  });

  it("PÉRIME ce que le modèle avait vérifié avant de toucher au dépôt par le shell", async () => {
    /**
     * MIN-286 — `noteVerificationStale` n'était appelé que depuis `noteEdit`,
     * c'est-à-dire depuis la permission `edit`. Un `npm test` vert lancé AVANT un
     * `rm`/`sed -i` faisait donc taire la porte sur des tests qui ne parlaient
     * plus du dépôt qu'on livre. La boucle maison périmait de même, depuis ses
     * tools de suppression.
     */
    const { delivery } = deliveryFor({ host: repoSaying("lib/y.ts\n", "") });
    delivery.noteShell("npx vitest run", 0);
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    expect((await createPr({})).followUp).toContain("TESTS");
    expect(vi.mocked(testFailuresForTurn)).toHaveBeenCalled();
  });
});

describe("le contrôle du plan, accroché au geste", () => {
  it("rend la relecture et la clôture en followUp de `write_issue_plan`", async () => {
    const { delivery, phases } = deliveryFor();
    const tool = delivery.wrapDomainTool(forwarder());

    const out = await tool("write_issue_plan", { identifier: "MIN-1", plan: "- [ ] Faire `lib/x.ts`" });

    expect(out.followUp).toBe("PLAN_REVIEW\n\n---\n\nPLAN_CLOSURE");
    expect(phases).toEqual(["plan_check"]);
  });

  it("ne parle qu'une fois, et jamais sur un autre tool", async () => {
    const { delivery } = deliveryFor();
    const tool = delivery.wrapDomainTool(forwarder());

    expect((await tool("read_issue", { identifier: "MIN-1" })).followUp).toBeUndefined();
    expect((await tool("write_issue_plan", { plan: "- [ ] x" })).followUp).toContain("PLAN_REVIEW");
    expect((await tool("write_issue_plan", { plan: "- [ ] y" })).followUp).toBeUndefined();
  });

  it("ne contrôle rien quand l'écriture a ÉCHOUÉ — il n'y a pas de plan à relire", async () => {
    const { delivery } = deliveryFor();
    const tool = delivery.wrapDomainTool(forwarder(false));

    expect((await tool("write_issue_plan", { plan: "- [ ] x" })).followUp).toBeUndefined();
  });
});

/**
 * `repoRelative` PREND SON DÉPÔT EN ARGUMENT (MIN-354), et c'est ce qui lui rend
 * un sens hors microVM : `metadata.filepath` d'opencode est ABSOLU, donc comparé
 * à `/vercel/sandbox/repo` sur une machine où le dépôt vit ailleurs, il rendait
 * `""` sur CHAQUE édition — donc plus aucun fichier dans le type-check ciblé de
 * la porte de livraison, ni dans le mode `related` du runner de tests, et une
 * porte qui laisse tout passer sans rien vérifier.
 *
 * Rejoué sur deux racines pour la même raison que `repo-path.test.ts` : ce qui
 * est vérifié est une propriété, pas un préfixe.
 */
describe.each([
  ["microVM", cloudLayout()],
  ["poste de travail", layoutForRoot("/Users/dev/minddy/runs/r-3", "/Users/dev/oc")],
])("repoRelative (%s)", (_name, layout) => {
  const repo = layout.repoDir;

  it("rend le chemin du dépôt, laisse un relatif tel quel, refuse le dehors", () => {
    expect(repoRelative(repo, `${repo}/lib/x.ts`)).toBe("lib/x.ts");
    expect(repoRelative(repo, "lib/x.ts")).toBe("lib/x.ts");
    expect(repoRelative(repo, "./lib/x.ts")).toBe("lib/x.ts");
    expect(repoRelative(repo, repo)).toBe("");
    expect(repoRelative(repo, "/etc/passwd")).toBe("");
    expect(repoRelative(repo, "  ")).toBe("");
  });

  it("ne prend pas le dépôt d'un AUTRE run pour le sien", () => {
    // Deux runs sur une machine sont deux dossiers frères : celui du voisin est
    // « le dehors », exactement comme `/etc`.
    const other = layoutForRoot("/Users/dev/minddy/runs/r-4", "/Users/dev/oc").repoDir;
    expect(repoRelative(repo, `${other}/lib/x.ts`)).toBe("");
  });
});
