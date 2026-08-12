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
import { REPO_DIR, turnDiffStat, type RepoHost } from "../repo-host";

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
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
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

  it("compte une SUPPRESSION seule, qui ne laisse aucun chemin à noter", async () => {
    // `turnDiffStat` exclut les suppressions de `files` (`--diff-filter=d`) : un
    // tour qui ne fait que `rm` n'a que ses lignes pour se dire.
    vi.mocked(turnDiffStat).mockResolvedValueOnce({ files: [], lines: 42, untracked: 0 });
    const { delivery } = deliveryFor();
    const createPr = delivery.wrapCreatePr(async () => ({ result: { url: "u" }, success: true }));

    // Pas de type-check (aucun chemin), mais les tests et le diff, eux, sont dus.
    expect((await createPr({})).followUp).toBe("TESTS\n\n---\n\nDIFF");
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

describe("repoRelative", () => {
  it("rend le chemin du dépôt, laisse un relatif tel quel, refuse le dehors", () => {
    expect(repoRelative(`${REPO_DIR}/lib/x.ts`)).toBe("lib/x.ts");
    expect(repoRelative("lib/x.ts")).toBe("lib/x.ts");
    expect(repoRelative("./lib/x.ts")).toBe("lib/x.ts");
    expect(repoRelative(REPO_DIR)).toBe("");
    expect(repoRelative("/etc/passwd")).toBe("");
    expect(repoRelative("  ")).toBe("");
  });
});
