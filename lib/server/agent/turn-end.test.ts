import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

// Les quatre contrôles sont moqués : ce fichier ne teste pas ce qu'ils DISENT
// (chacun a son test), il teste QUI PARLE et COMBIEN DE FOIS — c'est là qu'était
// le bug, et c'est la seule chose que la chaîne décide.
vi.mock("./diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./diagnostics")>()),
  typeErrorsForTurn: vi.fn(async () => "TYPES"),
}));
vi.mock("./self-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./self-review")>()),
  formatSelfReview: vi.fn(() => "DIFF"),
}));
vi.mock("./plan-review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-review")>()),
  planReviewForTurn: vi.fn(async () => "PLAN_REVIEW"),
}));
vi.mock("./plan-closure", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plan-closure")>()),
  planClosureForTurn: vi.fn(async () => "PLAN_CLOSURE"),
}));

import { makeTurnEndHook, MAX_TYPE_CHECK_PASSES } from "./turn-end";
import { newPlanWriteSink } from "./plan-closure";
import { runAgentLoop, type AgentChatMessage } from "./agent-loop";
import type { RepoHost } from "./repo-host";

/**
 * MIN-240 — LES DEUX CROCHETS DE PLAN NE TOURNAIENT JAMAIS.
 *
 * Le crochet de fin de tour chaîne quatre blocs au `??` : le premier qui parle rend
 * son message, la boucle le ré-injecte et rappelle le crochet. Mais la boucle ne
 * rappelait que `MAX_TURN_END_REENTRIES` fois, et cette constante valait DEUX. Sur
 * un tour qui édite du code ET écrit un plan — exactement les tours où ils servent —
 * le type-check et l'auto-relecture mangeaient les deux relances, et la relecture de
 * plan comme sa clôture n'étaient jamais appelées une seule fois.
 *
 * Deux niveaux, deux tests. Ici la POLITIQUE (le crochet : qui parle, combien de
 * fois), plus bas le GARDE-FOU (la boucle : combien de relances elle accorde). Le
 * bug vivait dans le fait que le second décidait à la place du premier.
 */

/** Host inerte : les quatre contrôles sont moqués, `turnDiff` peut rendre du vide. */
function fakeHost(): RepoHost {
  return {
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
}

function hookFor(opts: HookOpts = {}) {
  const editedPaths = new Set<string>(opts.edited ?? []);
  const planWrites = newPlanWriteSink();
  if (opts.wrotePlan) {
    planWrites.wrote = true;
    planWrites.markdown = "- [ ] Faire la chose dans `lib/x.ts`";
  }
  const phases: string[] = [];
  const hook = makeTurnEndHook({
    host: fakeHost(),
    emit: async (_type, payload) => {
      if (typeof payload.phase === "string") phases.push(payload.phase);
    },
    editedPaths,
    planWrites,
    filesFromSha: "abc123",
    repoTouched: opts.repoTouched ?? false,
    logPrefix: "[test]",
  });
  return { hook, editedPaths, phases };
}

/** Budget large : aucun bloc n'est empêché par le temps restant. */
const ROOMY = 600_000;

describe("la chaîne de fin de tour", () => {
  it("fait parler les QUATRE blocs sur un tour qui édite du code ET écrit un plan", async () => {
    // LE TEST DU TICKET. Avant le correctif, la boucle coupait après le deuxième :
    // `PLAN_REVIEW` et `PLAN_CLOSURE` n'étaient jamais rendus.
    const { hook, phases } = hookFor({ edited: ["lib/x.ts"], wrotePlan: true });

    const said: Array<string | null> = [];
    for (let i = 0; i < 5; i++) said.push(await hook.run({ budgetMs: ROOMY }));

    expect(said).toEqual(["TYPES", "DIFF", "PLAN_REVIEW", "PLAN_CLOSURE", null]);
    // L'ordre porte du sens : les types avant le diff (servir un diff par-dessus un
    // dépôt qui ne compile pas noierait le signal), la relecture du plan avant sa
    // clôture (le grep tourne sur le plan corrigé).
    expect(phases).toEqual(["type_check", "self_review", "plan_review", "plan_closure"]);
  });

  it("borne le type-check à ses deux passages, même si les éditions continuent", async () => {
    // C'est LUI que le plafond de la boucle bornait en réalité — le seul des quatre
    // qui n'avait pas de verrou. Sans budget propre, un dépôt qui ne compile pas
    // affamerait de nouveau les trois autres.
    const { hook, editedPaths } = hookFor({ wrotePlan: true });

    const said: Array<string | null> = [];
    for (let i = 0; i < 5; i++) {
      editedPaths.add(`lib/fix-${i}.ts`); // le modèle réédite à chaque relance
      said.push(await hook.run({ budgetMs: ROOMY }));
    }

    expect(said.filter((s) => s === "TYPES")).toHaveLength(MAX_TYPE_CHECK_PASSES);
    // Et la suite de la chaîne passe quand même : c'est tout l'objet du ticket.
    expect(said).toEqual(["TYPES", "TYPES", "DIFF", "PLAN_REVIEW", "PLAN_CLOSURE"]);
  });

  it("ne fait parler qu'une fois chacun des trois contrôles à verrou", async () => {
    const { hook } = hookFor({ repoTouched: true, wrotePlan: true });

    const said: Array<string | null> = [];
    for (let i = 0; i < 4; i++) said.push(await hook.run({ budgetMs: ROOMY }));

    expect(said).toEqual(["DIFF", "PLAN_REVIEW", "PLAN_CLOSURE", null]);
  });

  it("laisse passer la chaîne quand un bloc n'a pas le budget de tourner", async () => {
    // 50 s : sous le plancher du type-check (60 s), au-dessus de celui des autres
    // (45 s). Le bloc empêché ne doit pas retenir les suivants.
    const { hook, phases } = hookFor({ edited: ["lib/x.ts"], wrotePlan: true });

    const said = [
      await hook.run({ budgetMs: 50_000 }),
      await hook.run({ budgetMs: 50_000 }),
      await hook.run({ budgetMs: 50_000 }),
    ];

    expect(said).toEqual(["DIFF", "PLAN_REVIEW", "PLAN_CLOSURE"]);
    expect(phases).not.toContain("type_check");
  });

  it("latche `repoTouched` : le tour a édité, même quand le type-check a vidé la liste", async () => {
    const { hook, editedPaths } = hookFor({ edited: ["lib/x.ts"] });
    expect(hook.repoTouched()).toBe(false);

    await hook.run({ budgetMs: ROOMY }); // type-check : vide `editedPaths`
    expect(editedPaths.size).toBe(0);
    expect(hook.repoTouched()).toBe(true);
    // Le verrou tient : l'auto-relecture parle bien au passage suivant.
    expect(await hook.run({ budgetMs: ROOMY })).toBe("DIFF");
  });

  it("note les éditions hors crochet — un tour sorti sans fin de tour a quand même édité", async () => {
    const { hook, editedPaths } = hookFor();
    editedPaths.add("lib/x.ts");
    expect(hook.repoTouched()).toBe(false);
    hook.noteEdits();
    expect(hook.repoTouched()).toBe(true);
  });

  it("se tait entièrement sur un tour qui n'a ni édité ni écrit de plan", async () => {
    const { hook, phases } = hookFor();
    expect(await hook.run({ budgetMs: ROOMY })).toBeNull();
    expect(phases).toEqual([]);
  });
});

// ── Le garde-fou de la boucle ────────────────────────────────────────────────

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

function seed(): AgentChatMessage[] {
  return [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Do the thing." },
  ];
}

describe("le plafond de relances de la boucle", () => {
  it("ré-injecte les quatre messages d'une chaîne à quatre blocs", async () => {
    // Le crochet synthétique tient exactement la forme de la vraie chaîne. À
    // `MAX_TURN_END_REENTRIES = 2`, la boucle s'arrêtait après « TYPES » et
    // « DIFF » — les deux derniers n'étaient jamais demandés.
    const blocks = ["TYPES", "DIFF", "PLAN_REVIEW", "PLAN_CLOSURE"];
    let called = 0;
    const onTurnEnd = async () => blocks[called++] ?? null;

    const result = await runAgentLoop({
      messages: seed(),
      tools: [],
      model: "test/model",
      apiKey: "sk-test",
      baseUrl: "https://example.invalid/v1",
      runId: "run_test",
      billTo: { userId: "user_test" },
      recordUsage: async () => {},
      softDeadlineMs: 250_000,
      emit: async () => {},
      execTool: async () => ({ result: {}, success: true }),
      onTurnEnd,
    });

    expect(result.status).toBe("completed");
    const injected = result.messages.filter((m) => m.role === "user").map((m) => m.content);
    for (const block of blocks) expect(injected).toContain(block);
  });

  it("arrête un crochet qui ne se tait jamais", async () => {
    // Le plafond reste un garde-fou : un crochet qui rendrait un message à chaque
    // appel retiendrait le tour indéfiniment.
    let called = 0;
    const onTurnEnd = async () => `AGAIN ${called++}`;

    const result = await runAgentLoop({
      messages: seed(),
      tools: [],
      model: "test/model",
      apiKey: "sk-test",
      baseUrl: "https://example.invalid/v1",
      runId: "run_test",
      billTo: { userId: "user_test" },
      recordUsage: async () => {},
      softDeadlineMs: 250_000,
      emit: async () => {},
      execTool: async () => ({ result: {}, success: true }),
      onTurnEnd,
    });

    expect(result.status).toBe("completed");
    // Borné, et au-dessus du pire cas réel de la chaîne (2 + 1 + 1 + 1 = 5) : le
    // plafond ne doit jamais être ce qui choisit les blocs qui tournent.
    expect(called).toBeGreaterThan(5);
    expect(called).toBeLessThanOrEqual(9);
  });
});
