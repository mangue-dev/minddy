import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

// Les contrôles sont moqués : ce fichier ne teste pas ce qu'ils DISENT (chacun a
// son test), il teste QUI PARLE, QUAND, et COMBIEN DE FOIS.
vi.mock("./diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./diagnostics")>()),
  typeErrorsForTurn: vi.fn(async () => "TYPES"),
  testFailuresForTurn: vi.fn(async () => ({ block: "TESTS", scope: "full" as const })),
}));
vi.mock("./self-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./self-review")>()),
  formatSelfReview: vi.fn(() => "DIFF"),
}));
vi.mock("./plan-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-review")>()),
  planReviewForTurn: vi.fn(async () => "PLAN_REVIEW"),
}));
// `turnDiffStat` mesure la TAILLE du tour, et c'est elle qui choisit la portée du
// passage de tests (MIN-262). Moquée ici pour que chaque test dise sa taille ; le
// défaut est un GROS tour, celui qui paie la suite entière.
vi.mock("./repo-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./repo-host")>()),
  turnDiffStat: vi.fn(async () => ({
    files: ["lib/a.ts", "lib/b.ts", "lib/c.ts", "lib/d.ts"],
    lines: 400,
    untracked: 0,
  })),
}));
vi.mock("./plan-closure", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-closure")>()),
  planClosureForTurn: vi.fn(async () => "PLAN_CLOSURE"),
}));

import { gateCreatePr, gateWritePlan, makeDeliveryGate } from "./delivery-gate";
import { testFailuresForTurn, typeErrorsForTurn } from "./diagnostics";
import { turnDiffStat } from "./repo-host";
import { newPlanWriteSink } from "./plan-closure";
import type { AgentChatMessage } from "./agent-contract";
import type { RepoHost } from "./repo-host";
import { cloudLayout } from "./harness-layout";

/**
 * MIN-263 — LE HARNESS NE VÉRIFIE PLUS QU'À LA LIVRAISON.
 *
 * Il n'y a plus de contrôle de fin de tour : quand le modèle répond sans tool-call,
 * le tour se termine, point. Tout ce que le harness exécute est réclamé par une
 * PORTE de tool — `create_pr` pour les trois contrôles de code, `write_issue_plan`
 * pour le plan — donc dans un `followUp`, sans jamais rouvrir un tour terminé ni
 * coûter une réponse de plus.
 *
 * Ce fichier teste les deux niveaux : la porte (qui parle, quand, une seule fois) et
 * la boucle (qu'elle ne rouvre plus rien, ce qui est le seul invariant qui protège
 * tout le reste).
 */

/** Host inerte : les quatre contrôles sont moqués, `turnDiff` peut rendre du vide. */
function fakeHost(): RepoHost {
  return {
    layout: cloudLayout(),
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: async () => null,
    writeFile: async () => {},
    mkdir: async () => {},
  };
}

interface HookOpts {
  edited?: string[];
  wrotePlan?: boolean;
  repoTouched?: boolean;
  /** Ce que le modèle a lancé lui-même et vu passer vert (MIN-262). */
  greenCommand?: string;
}

function gateFor(opts: HookOpts = {}) {
  const editedPaths = new Set<string>(opts.edited ?? []);
  const planWrites = newPlanWriteSink();
  if (opts.wrotePlan) {
    planWrites.wrote = true;
    planWrites.markdown = "- [ ] Faire la chose dans `lib/x.ts`";
  }
  const phases: string[] = [];
  const verification = { greenCommand: opts.greenCommand ?? null };
  const gate = makeDeliveryGate({
    host: fakeHost(),
    emit: async (_type, payload) => {
      if (typeof payload.phase === "string") phases.push(payload.phase);
    },
    editedPaths,
    planWrites,
    verification,
    filesFromSha: "abc123",
    repoTouched: opts.repoTouched ?? false,
    logPrefix: "[test]",
  });
  return { gate, editedPaths, phases, verification };
}

/** Budget large : aucun bloc n'est empêché par le temps restant. */
const ROOMY = 600_000;

/** Les deux contrôles du plan sont FUSIONNÉS en un bloc depuis MIN-256 : le
 *  modèle y répond d'un seul geste, et ça coûte une réponse de moins. */
const PLAN = "PLAN_REVIEW\n\n---\n\nPLAN_CLOSURE";

describe("la porte de livraison", () => {
  // Les compteurs d'appels sont l'assertion de plusieurs tests (« le harness n'a
  // RIEN lancé ») : sans ça, ils liraient les appels du test précédent.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sert les trois contrôles en UN bloc, dans l'ordre", async () => {
    // L'ordre porte du sens : les types d'abord — des échecs de test sur un dépôt
    // qui ne compile pas ne se lisent même pas —, les échecs ensuite (un échec est
    // un fait), le diff en dernier (c'est une question).
    const { gate, phases } = gateFor({ edited: ["lib/x.ts"] });

    const said = await gate.checkBeforeSubmit(ROOMY);

    expect(said).toBe("TYPES\n\n---\n\nTESTS\n\n---\n\nDIFF");
    expect(phases).toEqual(["type_check", "tests", "self_review"]);
  });

  it("ne s'ouvre qu'UNE fois : le second create_pr livre", async () => {
    // Une porte qui re-vérifie à chaque tentative est une porte qui peut refuser de
    // s'ouvrir — et un agent qui ne peut plus livrer est pire qu'un agent qui livre
    // du rouge en le disant.
    const { gate } = gateFor({ edited: ["lib/x.ts"] });

    expect(await gate.checkBeforeSubmit(ROOMY)).toContain("TYPES");
    expect(await gate.checkBeforeSubmit(ROOMY)).toBeNull();
  });

  it("se tait sur un tour qui n'a rien touché", async () => {
    const { gate, phases } = gateFor();
    expect(await gate.checkBeforeSubmit(ROOMY)).toBeNull();
    expect(phases).toEqual([]);
  });

  it("ne rend que le diff quand types et tests sont verts", async () => {
    // Le silence des deux premiers est le bon retour ; le diff, lui, parle toujours
    // — c'est une question posée avant la livraison, pas un verdict.
    vi.mocked(typeErrorsForTurn).mockResolvedValueOnce(null);
    vi.mocked(testFailuresForTurn).mockResolvedValueOnce({ block: null, scope: "full" });
    const { gate } = gateFor({ edited: ["lib/x.ts"] });

    expect(await gate.checkBeforeSubmit(ROOMY)).toBe("DIFF");
  });

  it("laisse passer les contrôles qui n'ont pas le budget de tourner", async () => {
    // 50 s : sous le plancher du type-check (60 s), d'un passage de tests même
    // ciblé (90 s) et de l'auto-relecture (75 s). La porte ne doit pas pour autant
    // retenir la livraison.
    const { gate, phases } = gateFor({ edited: ["lib/x.ts"] });

    expect(await gate.checkBeforeSubmit(50_000)).toBeNull();
    expect(phases).toEqual([]);
  });

  it("latche `repoTouched`, y compris hors de la porte", async () => {
    // Un tour qui n'ouvre pas de pull request ne franchit jamais la porte : c'est
    // `noteEdits` qui doit alors dire au checkpoint que le dépôt a bougé.
    const { gate, editedPaths } = gateFor();
    expect(gate.repoTouched()).toBe(false);
    editedPaths.add("lib/x.ts");
    gate.noteEdits();
    expect(gate.repoTouched()).toBe(true);
  });

  /**
   * MIN-262 — LE GESTE DU MODÈLE FAIT FOI, et il vaut aussi à la livraison : ce
   * qu'il a vu passer vert sans réédition derrière n'est pas relancé.
   */
  it("ne relance pas les tests que le modèle a lancés verts lui-même", async () => {
    const { gate, phases } = gateFor({
      edited: ["lib/x.ts"],
      greenCommand: "npx vitest run lib/x.test.ts",
    });

    const said = await gate.checkBeforeSubmit(ROOMY);

    expect(said).toBe("TYPES\n\n---\n\nDIFF");
    expect(testFailuresForTurn).not.toHaveBeenCalled();
    // Compté quand même : c'est ce qui dira combien de livraisons le modèle vérifie
    // lui-même, donc si la doctrine du prompt porte.
    expect(phases).toEqual(["type_check", "tests", "self_review"]);
  });

  it("lance la suite entière quand le modèle n'a rien lancé", async () => {
    const { gate } = gateFor({ edited: ["lib/x.ts"] });
    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), "full");
  });

  it("paie un passage CIBLÉ sur un petit tour", async () => {
    vi.mocked(turnDiffStat).mockResolvedValueOnce({
      files: ["lib/x.ts"],
      lines: 1,
      untracked: 0,
    });
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), {
      related: ["lib/x.ts"],
      allowFullFallback: true,
    });
  });

  it("fait payer la suite entière dès qu'un fichier NEUF apparaît", async () => {
    // Un fichier neuf est du comportement neuf : c'est exactement ce dont aucun
    // test existant ne parle (MIN-251), quelle que soit sa taille en lignes.
    vi.mocked(turnDiffStat).mockResolvedValueOnce({
      files: ["lib/x.ts"],
      lines: 2,
      untracked: 1,
    });
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), "full");
  });

  it("traite un tour de taille INCONNUE comme un gros tour", async () => {
    // git muet, baseline hors de l'historique shallow : la mesure sert à s'épargner
    // du travail, pas à s'en dispenser sur un doute.
    vi.mocked(turnDiffStat).mockResolvedValueOnce(null);
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(ROOMY);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), "full");
  });

  it("ne retombe PAS sur la suite entière quand le budget ne la couvre pas", async () => {
    // Petit tour, 100 s au compteur : au-dessus du plancher d'un passage ciblé
    // (90 s), sous celui de la suite entière (180 s). Un runner sans mode ciblé ne
    // doit pas déclencher, par la bande, les 80 s qu'on essayait d'éviter.
    vi.mocked(turnDiffStat).mockResolvedValueOnce({
      files: ["lib/x.ts"],
      lines: 1,
      untracked: 0,
    });
    const { gate } = gateFor({ repoTouched: true });

    await gate.checkBeforeSubmit(100_000);
    expect(testFailuresForTurn).toHaveBeenCalledWith(expect.anything(), {
      related: ["lib/x.ts"],
      allowFullFallback: false,
    });
  });
});

// ── La boucle ne rouvre plus un tour terminé ────────────────────────────────────────────────

interface Choice {
  delta?: Record<string, unknown>;
  finish_reason?: string | null;
}

function sse(choices: Choice[]): string {
  const chunks: Array<Record<string, unknown>> = choices.map((c) => ({
    id: "gen_1",
    model: "test/model",
    choices: [c],
  }));
  chunks.push({
    id: "gen_1",
    model: "test/model",
    choices: [{ delta: {} }],
    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cost: 0.001 },
  });
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

function sseText(text: string): string {
  return sse([{ delta: { content: text } }, { delta: {}, finish_reason: "stop" }]);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(sseText("Done."))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function _seed(): AgentChatMessage[] {
  return [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Do the thing." },
  ];
}

/**
 * MIN-247, puis MIN-263 — LE PREMIER `create_pr` NE SOUMET PAS, ET C'EST LÀ QUE TOUT
 * SE VÉRIFIE.
 *
 * `create_pr` pousse et ouvre la pull request AU MOMENT DE L'APPEL : sans porte,
 * l'ordre réel serait PR ouverte, corps rédigé, relecteur notifié, puis vérification.
 * La porte déplace le contrôle juste avant la livraison — et depuis qu'il n'y a plus
 * rien en fin de tour, c'est le seul endroit où le harness exécute quoi que ce soit
 * sur le code.
 */
describe("la porte de create_pr", () => {
  const opener = () => {
    const calls: Array<{ title: string }> = [];
    return {
      calls,
      handler: async (args: { title: string; body?: string }) => {
        calls.push({ title: args.title });
        return { result: { url: "https://forge/pr/1" }, success: true };
      },
    };
  };

  it("rend les contrôles au premier appel, ouvre au second", async () => {
    const { gate } = gateFor({ edited: ["lib/x.ts"], repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => ROOMY);

    const first = await gated({ title: "MIN-1: faire la chose" });
    expect(first.success).toBe(true);
    // Les trois d'un coup, dans le `followUp` et pas dans le résultat : celui-ci est
    // capé à 6 000 caractères avec le MILIEU élidé, ce qui d'un diff couperait ce
    // qu'on donne à lire. Le résultat ne dit que le fait.
    expect(first.followUp).toContain("TYPES");
    expect(first.followUp).toContain("TESTS");
    expect(first.followUp).toContain("DIFF");
    expect(first.result).toMatchObject({ opened: false });
    expect(String((first.result as { note: string }).note)).toContain("call create_pr again");
    expect(calls).toEqual([]); // RIEN n'a été poussé.

    const second = await gated({ title: "MIN-1: faire la chose" });
    expect(second.result).toEqual({ url: "https://forge/pr/1" });
    expect(calls).toHaveLength(1);
  });

  it("ne vérifie qu'une fois, même si le modèle enchaîne les tentatives", async () => {
    const { gate, phases } = gateFor({ edited: ["lib/x.ts"], repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => ROOMY);

    expect((await gated({ title: "t" })).followUp).toContain("TYPES");
    await gated({ title: "t" });
    await gated({ title: "t" });

    // Deux ouvertures pour trois appels : le premier a servi les contrôles, les
    // suivants livrent. Et les contrôles n'ont tourné qu'UNE fois.
    expect(calls).toHaveLength(2);
    expect(phases).toEqual(["type_check", "tests", "self_review"]);
  });

  it("ouvre du premier coup quand le tour n'a rien touché", async () => {
    // Une PR sur du travail poussé au tour précédent : il n'y a pas de diff de CE
    // tour à relire, donc rien à faire attendre.
    const { gate } = gateFor({ repoTouched: false });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => ROOMY);

    expect((await gated({ title: "t" })).success).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("ouvre du premier coup quand il ne reste plus de budget pour relire", async () => {
    const { gate } = gateFor({ edited: ["lib/x.ts"], repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, gate, () => 1_000);

    expect((await gated({ title: "t" })).success).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

/**
 * Le canal par lequel la porte parle : un message `user`, pas un résultat de tool.
 * Un résultat traverse `headTail(…, 6 000)`, qui élide le MILIEU — d'un diff, ça
 * coupe exactement ce qu'on donne à lire.
 */
describe("la porte de write_issue_plan", () => {
  const writer = () => {
    const calls: string[] = [];
    return {
      calls,
      handler: async (name: string) => {
        calls.push(name);
        return { result: { ok: true }, success: true };
      },
    };
  };

  it("rend le contrôle du plan en followUp, sans retenir l'écriture", async () => {
    const { gate } = gateFor({ wrotePlan: true });
    const { calls, handler } = writer();
    const gated = gateWritePlan(handler, gate, () => ROOMY);

    const out = await gated("write_issue_plan", { plan: "- [ ] faire" });
    // À la différence de `create_pr`, la porte ne retient RIEN : le plan est écrit,
    // et il doit l'être — c'est le document qu'on relit.
    expect(calls).toEqual(["write_issue_plan"]);
    expect(out.success).toBe(true);
    expect(out.followUp).toBe(PLAN);
  });

  it("ne pose la question qu'une fois", async () => {
    const { gate, phases } = gateFor({ wrotePlan: true });
    const gated = gateWritePlan(writer().handler, gate, () => ROOMY);

    expect((await gated("write_issue_plan", {})).followUp).toBe(PLAN);
    // Un second write ne redemande rien : le contrôle relit un plan, il ne commente
    // pas la correction qui suit.
    expect((await gated("write_issue_plan", {})).followUp).toBeUndefined();
    expect(phases).toEqual(["plan_check"]);
  });

  it("laisse passer les autres tools ticket, et un write raté", async () => {
    const { gate } = gateFor({ wrotePlan: true });
    const failing = gateWritePlan(
      async (name) => ({ result: {}, success: name !== "write_issue_plan" }),
      gate,
      () => ROOMY,
    );

    expect((await failing("append_to_plan", {})).followUp).toBeUndefined();
    // Un `write_issue_plan` refusé n'a rien écrit : relire son plan ferait parler
    // le harness d'un document qui n'existe pas.
    expect((await failing("write_issue_plan", {})).followUp).toBeUndefined();
    // Et le verrou n'a pas été consommé : le prochain write réussi sera relu.
    const ok = gateWritePlan(writer().handler, gate, () => ROOMY);
    expect((await ok("write_issue_plan", {})).followUp).toBe(PLAN);
  });

  it("se tait quand le budget manque, sans consommer le verrou", async () => {
    // Il n'y a plus de fin de tour pour rattraper : ce contrôle-là est simplement
    // sauté. Mais le verrou reste libre, donc un second write, plus tard dans le
    // tour, sera relu.
    const { gate, phases } = gateFor({ wrotePlan: true });
    const poor = gateWritePlan(writer().handler, gate, () => 1_000);

    expect((await poor("write_issue_plan", {})).followUp).toBeUndefined();
    expect(phases).toEqual([]);

    const rich = gateWritePlan(writer().handler, gate, () => ROOMY);
    expect((await rich("write_issue_plan", {})).followUp).toBe(PLAN);
  });
});
