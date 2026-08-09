import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

// Les cinq contrôles sont moqués : ce fichier ne teste pas ce qu'ils DISENT
// (chacun a son test), il teste QUI PARLE et COMBIEN DE FOIS — c'est là qu'était
// le bug, et c'est la seule chose que la chaîne décide.
vi.mock("./diagnostics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./diagnostics")>()),
  typeErrorsForTurn: vi.fn(async () => "TYPES"),
  testFailuresForTurn: vi.fn(async () => "TESTS"),
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

import {
  gateCreatePr,
  gateWritePlan,
  makeTurnEndHook,
  MAX_TYPE_CHECK_PASSES,
  REENTRY_REPLY_RULE,
} from "./turn-end";
import { testFailuresForTurn } from "./diagnostics";
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

/** Le bloc SEUL, sans la règle de réponse que `run` colle à tout ce qui sort
 *  (MIN-256). Ce qu'on teste ici est qui parle, pas ce qui accompagne. */
function block(said: string | null): string | null {
  return said == null ? null : said.replace(`\n\n${REENTRY_REPLY_RULE}`, "");
}

/** Les deux contrôles du plan sont FUSIONNÉS en un bloc depuis MIN-256 : le
 *  modèle y répond d'un seul geste, et ça coûte une réponse de moins. */
const PLAN = "PLAN_REVIEW\n\n---\n\nPLAN_CLOSURE";

describe("la chaîne de fin de tour", () => {
  it("fait parler tous les blocs sur un tour qui édite du code ET écrit un plan", async () => {
    // LE TEST DU TICKET (MIN-240). Avant le correctif, la boucle coupait après le
    // deuxième : les contrôles de plan n'étaient jamais rendus.
    const { hook, phases } = hookFor({ edited: ["lib/x.ts"], wrotePlan: true });

    const said: Array<string | null> = [];
    for (let i = 0; i < 5; i++) said.push(block(await hook.run({ budgetMs: ROOMY })));

    expect(said).toEqual(["TYPES", "TESTS", "DIFF", PLAN, null]);
    // L'ordre porte du sens : les types d'abord (servir quoi que ce soit par-dessus
    // un dépôt qui ne compile pas noierait le signal), les tests ensuite — un échec
    // est un fait, un diff est une question —, le plan en dernier recours.
    expect(phases).toEqual(["type_check", "tests", "self_review", "plan_check"]);
  });

  it("borne le type-check à ses deux passages, même si les éditions continuent", async () => {
    // C'est LUI que le plafond de la boucle bornait en réalité — le seul des cinq
    // qui n'avait pas de verrou. Sans budget propre, un dépôt qui ne compile pas
    // affamerait de nouveau les quatre autres.
    const { hook, editedPaths } = hookFor({ wrotePlan: true });

    const said: Array<string | null> = [];
    for (let i = 0; i < 6; i++) {
      editedPaths.add(`lib/fix-${i}.ts`); // le modèle réédite à chaque relance
      said.push(block(await hook.run({ budgetMs: ROOMY })));
    }

    expect(said.filter((s) => s === "TYPES")).toHaveLength(MAX_TYPE_CHECK_PASSES);
    // Et la suite de la chaîne passe quand même : c'est tout l'objet du ticket.
    expect(said).toEqual(["TYPES", "TYPES", "TESTS", "DIFF", PLAN, null]);
  });

  it("ne fait parler qu'une fois chacun des contrôles à verrou", async () => {
    const { hook } = hookFor({ repoTouched: true, wrotePlan: true });

    const said: Array<string | null> = [];
    for (let i = 0; i < 4; i++) said.push(block(await hook.run({ budgetMs: ROOMY })));

    expect(said).toEqual(["TESTS", "DIFF", PLAN, null]);
  });

  it("laisse passer la chaîne quand un bloc n'a pas le budget de tourner", async () => {
    // 50 s : sous le plancher du type-check (60 s), de la suite de tests (180 s)
    // et de l'auto-relecture (75 s depuis MIN-252, elle grep en plus de son
    // diff) — au-dessus de celui du contrôle de plan (45 s). Les trois blocs
    // empêchés ne doivent pas retenir celui qui suit.
    const { hook, phases } = hookFor({ edited: ["lib/x.ts"], wrotePlan: true });

    const said = [
      block(await hook.run({ budgetMs: 50_000 })),
      block(await hook.run({ budgetMs: 50_000 })),
    ];

    expect(said).toEqual([PLAN, null]);
    expect(phases).not.toContain("type_check");
    expect(phases).not.toContain("tests");
    expect(phases).not.toContain("self_review");
  });

  it("latche `repoTouched` : le tour a édité, même quand le type-check a vidé la liste", async () => {
    const { hook, editedPaths } = hookFor({ edited: ["lib/x.ts"] });
    expect(hook.repoTouched()).toBe(false);

    await hook.run({ budgetMs: ROOMY }); // type-check : vide `editedPaths`
    expect(editedPaths.size).toBe(0);
    expect(hook.repoTouched()).toBe(true);
    // Le verrou tient : les deux blocs qui en dépendent parlent bien ensuite. C'est
    // exactement pourquoi la suite de tests se garde sur `repoTouched` et non sur
    // `editedPaths`, que le type-check vient de vider.
    expect(block(await hook.run({ budgetMs: ROOMY }))).toBe("TESTS");
    expect(block(await hook.run({ budgetMs: ROOMY }))).toBe("DIFF");
  });

  it("ne lance pas la suite de tests sur un tour qui n'a rien édité", async () => {
    const { hook, phases } = hookFor({ wrotePlan: true });

    const said: Array<string | null> = [];
    for (let i = 0; i < 2; i++) said.push(block(await hook.run({ budgetMs: ROOMY })));

    expect(said).toEqual([PLAN, null]);
    expect(phases).not.toContain("tests");
  });

  it("se tait quand la suite est verte — et laisse passer la chaîne", async () => {
    // Le silence est le bon retour : un « tout va bien » injecté à chaque tour
    // coûterait un aller-retour modèle pour ne rien dire.
    vi.mocked(testFailuresForTurn).mockResolvedValueOnce(null);
    const { hook, phases } = hookFor({ edited: ["lib/x.ts"] });

    const said = [
      block(await hook.run({ budgetMs: ROOMY })),
      block(await hook.run({ budgetMs: ROOMY })),
    ];

    expect(said).toEqual(["TYPES", "DIFF"]);
    // Mais le passage est bien compté : c'est lui qui dira combien de tours
    // se terminent en rouge.
    expect(phases).toEqual(["type_check", "tests", "self_review"]);
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

/**
 * MIN-247 — LE PREMIER `create_pr` NE SOUMET PAS.
 *
 * Le harness faisait DÉJÀ relire son diff au modèle, mais en fin de tour — après
 * que `create_pr` a poussé et ouvert la pull request. L'ordre réel était : PR
 * ouverte, corps rédigé, relecteur notifié, puis relecture. Ce que la porte
 * change n'est pas le nombre de rounds (le verrou est partagé, la fin de tour ne
 * repose pas la question) : c'est le MOMENT.
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

  it("rend le diff au premier appel, ouvre au second", async () => {
    const { hook } = hookFor({ repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, hook, () => ROOMY);

    const first = await gated({ title: "MIN-1: faire la chose" });
    expect(first.success).toBe(true);
    // Le diff part en `followUp`, pas dans le résultat : celui-ci est capé à 6 000
    // caractères avec le MILIEU élidé, ce qui d'un diff couperait ce qu'on donne
    // à lire. Le résultat ne dit que le fait.
    expect(first.followUp).toContain("DIFF");
    expect(first.result).toMatchObject({ opened: false });
    expect(String((first.result as { note: string }).note)).toContain("call create_pr again");
    expect(calls).toEqual([]); // RIEN n'a été poussé.

    const second = await gated({ title: "MIN-1: faire la chose" });
    expect(second.result).toEqual({ url: "https://forge/pr/1" });
    expect(calls).toHaveLength(1);
  });

  it("ne repose pas la question en fin de tour — c'est le même verrou", async () => {
    const { hook, phases } = hookFor({ edited: ["lib/x.ts"], repoTouched: true });
    const { handler } = opener();
    const gated = gateCreatePr(handler, hook, () => ROOMY);

    expect((await gated({ title: "t" })).followUp).toContain("DIFF");
    await gated({ title: "t" });

    // La chaîne de fin de tour : le type-check et les tests parlent, la relecture NON.
    const said: Array<string | null> = [];
    for (let i = 0; i < 3; i++) said.push(block(await hook.run({ budgetMs: ROOMY })));
    expect(said).toEqual(["TYPES", "TESTS", null]);
    // Et la mesure sait d'où venait la relecture : de la porte, pas de la fin de tour.
    expect(phases).toEqual(["self_review", "type_check", "tests"]);
  });

  it("ouvre du premier coup quand le tour n'a rien touché", async () => {
    // Une PR sur du travail poussé au tour précédent : il n'y a pas de diff de CE
    // tour à relire, donc rien à faire attendre.
    const { hook } = hookFor({ repoTouched: false });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, hook, () => ROOMY);

    expect((await gated({ title: "t" })).success).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("ouvre du premier coup quand il ne reste plus de budget pour relire", async () => {
    const { hook } = hookFor({ repoTouched: true });
    const { calls, handler } = opener();
    const gated = gateCreatePr(handler, hook, () => 1_000);

    expect((await gated({ title: "t" })).success).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

/**
 * Le canal par lequel la porte parle : un message `user`, pas un résultat de tool.
 * Un résultat traverse `headTail(…, 6 000)`, qui élide le MILIEU — d'un diff, ça
 * coupe exactement ce qu'on donne à lire.
 */
describe("le mot long d'un tool (followUp)", () => {
  it("arrive au modèle en entier, APRÈS la réponse de tous les tool-calls du round", async () => {
    const long = `LONG_${"x".repeat(20_000)}_END`;
    let round = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // Round 1 : DEUX tool-calls, dont un qui porte un mot long. Round 2 : la réponse.
        if (round++ === 0) {
          return new Response(
            sse([
              {
                delta: {
                  tool_calls: [
                    { index: 0, id: "c1", type: "function", function: { name: "a", arguments: "{}" } },
                    { index: 1, id: "c2", type: "function", function: { name: "b", arguments: "{}" } },
                  ],
                },
              },
              { delta: {}, finish_reason: "tool_calls" },
            ]),
          );
        }
        return new Response(sseText("Done."));
      }),
    );

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
      execTool: async (name) =>
        name === "a" ? { result: { ok: true }, success: true, followUp: long } : { result: {}, success: true },
    });

    expect(result.status).toBe("completed");
    const injected = result.messages.find((m) => m.role === "user" && m.content === long);
    // En ENTIER : rien n'a été capé ni élidé au passage.
    expect(injected).toBeDefined();
    // Et après les DEUX réponses de tool : un message `user` intercalé casserait
    // l'appariement tool_call ↔ tool_result.
    const at = result.messages.indexOf(injected!);
    const toolMessages = result.messages.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(2);
    for (const m of toolMessages) expect(result.messages.indexOf(m)).toBeLessThan(at);
  });
});

/**
 * MIN-256 — LE HARNESS PARLAIT APRÈS LA RÉPONSE, DONC LA RÉPONSE PARLAIT DE LUI.
 *
 * Un bloc de fin de tour arrive une fois le message écrit. Le tour repart, le
 * modèle répond une seconde fois — et c'est celle-là que l'utilisateur lit, la
 * première étant redescendue au rang d'étape dans le fil. Sur un run de plan, le
 * message visible devenait « j'ai vérifié, le plan tient », et il fallait remonter
 * la trace pour retrouver ce que le tour avait fait.
 *
 * Trois leviers, testés ici : la RÈGLE collée à toute réinjection, le contrôle du
 * plan déplacé sur le GESTE (donc plus aucune réponse de plus), et la FUSION des
 * deux contrôles de plan en un seul bloc.
 */
describe("la règle de réponse des réinjections", () => {
  it("accompagne tout bloc de fin de tour, quel qu'il soit", async () => {
    const { hook } = hookFor({ edited: ["lib/x.ts"], wrotePlan: true });
    const said: Array<string | null> = [];
    for (let i = 0; i < 5; i++) said.push(await hook.run({ budgetMs: ROOMY }));

    for (const s of said.filter(Boolean)) expect(s).toContain(REENTRY_REPLY_RULE);
    // Elle est collée SOUS le bloc : ce que le modèle doit lire d'abord, c'est le
    // contrôle. Et elle ne s'invente pas un bloc quand il n'y en a pas.
    expect(said[0]!.indexOf("TYPES")).toBeLessThan(said[0]!.indexOf(REENTRY_REPLY_RULE));
    expect(said[4]).toBeNull();
  });

  it("dit au modèle que sa prochaine réponse est la SEULE que l'utilisateur verra", () => {
    // La formulation est le correctif : sans elle, le bloc demande implicitement
    // de répondre AU CONTRÔLE, et c'est ce que le modèle faisait.
    expect(REENTRY_REPLY_RULE).toContain("ONLY message the user will see");
    expect(REENTRY_REPLY_RULE).toContain("do not reply about this check");
  });

  it("ne va PAS sur le chemin des tools — là, le modèle n'a pas encore répondu", async () => {
    const { hook } = hookFor({ repoTouched: true });
    const gated = gateCreatePr(
      async () => ({ result: {}, success: true }),
      hook,
      () => ROOMY,
    );
    const out = await gated({ title: "t" });
    expect(out.followUp).toContain("DIFF");
    expect(out.followUp).not.toContain(REENTRY_REPLY_RULE);
  });
});

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
    const { hook } = hookFor({ wrotePlan: true });
    const { calls, handler } = writer();
    const gated = gateWritePlan(handler, hook, () => ROOMY);

    const out = await gated("write_issue_plan", { plan: "- [ ] faire" });
    // À la différence de `create_pr`, la porte ne retient RIEN : le plan est écrit,
    // et il doit l'être — c'est le document qu'on relit.
    expect(calls).toEqual(["write_issue_plan"]);
    expect(out.success).toBe(true);
    expect(out.followUp).toBe(PLAN);
  });

  it("ne repose pas la question en fin de tour — c'est le même verrou", async () => {
    const { hook, phases } = hookFor({ wrotePlan: true });
    const gated = gateWritePlan(writer().handler, hook, () => ROOMY);

    expect((await gated("write_issue_plan", {})).followUp).toBe(PLAN);
    // ZÉRO réinjection de fin de tour : c'est tout l'objet du ticket — le tour ne
    // paie plus une réponse de plus pour ce contrôle.
    expect(await hook.run({ budgetMs: ROOMY })).toBeNull();
    expect(phases).toEqual(["plan_check"]);
  });

  it("laisse passer les autres tools ticket, et un write raté", async () => {
    const { hook } = hookFor({ wrotePlan: true });
    const gated = gateWritePlan(
      async (name) => ({ result: {}, success: name !== "write_issue_plan" }),
      hook,
      () => ROOMY,
    );

    expect((await gated("append_to_plan", {})).followUp).toBeUndefined();
    // Un `write_issue_plan` refusé n'a rien écrit : relire son plan ferait parler
    // le harness d'un document qui n'existe pas.
    expect((await gated("write_issue_plan", {})).followUp).toBeUndefined();
    // Et le verrou n'a pas été consommé : la fin de tour garde sa dernière chance.
    expect(block(await hook.run({ budgetMs: ROOMY }))).toBe(PLAN);
  });

  it("retombe sur la fin de tour quand le budget manquait au moment du geste", async () => {
    const { hook, phases } = hookFor({ wrotePlan: true });
    const gated = gateWritePlan(writer().handler, hook, () => 1_000);

    expect((await gated("write_issue_plan", {})).followUp).toBeUndefined();
    expect(block(await hook.run({ budgetMs: ROOMY }))).toBe(PLAN);
    expect(phases).toEqual(["plan_check"]);
  });
});
