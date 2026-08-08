import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 (le puits ci-dessous) ;
// ce mock-ci ne garde plus qu'elle : le reste du graphe, qui l'appelle encore.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

/**
 * MIN-202 — le plafond de dépense d'un passage se compare au compteur PARTAGÉ du
 * chunk, pas à celui de chaque boucle prise séparément.
 *
 * Ce que ça coûtait de ne pas le vérifier : `budgetUsd` était un scalaire recopié à
 * chaque sous-agent, et chaque fille opposait sa SEULE dépense au plafond commun.
 * Six filles en parallèle plus le parent, et une routine réglée à 15 % d'un plan Go
 * (0,75 $) pouvait en prendre 5,25 $ — le mois entier de l'utilisateur en un
 * passage, sur un réglage qu'il avait mis à « 15 % maximum ».
 *
 * Comme `compact-path.test.ts`, on ne moque QUE `fetch` : le streaming SSE,
 * l'accumulation du coût et la frontière de coupure sont le vrai chemin.
 */

/** Corps SSE d'un round qui appelle un tool (donc la boucle continue). */
function sseToolCall(id: string, cost: number): string {
  const chunks = [
    {
      id: "gen_1",
      model: "test/model",
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                function: { name: "read_file", arguments: JSON.stringify({ path: "src/a.ts" }) },
              },
            ],
          },
        },
      ],
    },
    {
      id: "gen_1",
      model: "test/model",
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, cost },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Corps SSE d'un round texte (fin de tour). */
function sseText(text: string, cost: number): string {
  const chunks = [
    { id: "gen_2", model: "test/model", choices: [{ delta: { content: text } }] },
    {
      id: "gen_2",
      model: "test/model",
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 1100, completion_tokens: 10, total_tokens: 1110, cost },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

let calls = 0;
let responses: Array<() => Response>;

beforeEach(() => {
  calls = 0;
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls++;
      const next = responses.shift();
      if (!next) throw new Error("fetch non prévu par le test");
      return next();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const seed = (): AgentChatMessage[] => [
  { role: "system", content: "You are numo." },
  { role: "user", content: "Do the thing." },
];

const baseParams = {
  tools: [],
  model: "test/model",
  apiKey: "sk-test",
  baseUrl: "https://example.invalid/v1",
  runId: "run_test",
  billTo: { userId: "user_test" } as const,
  // Le ledger est INJECTÉ depuis MIN-224 : la boucle ne connaît plus le chemin de
  // la base. Ici, un puits — ce test ne mesure pas la dépense.
  recordUsage: async () => {},
  softDeadlineMs: 250_000,
  execTool: async () => ({ result: { ok: true }, success: true }),
  emit: async () => {},
};

describe("plafond de dépense du chunk", () => {
  it("coupe une boucle sur la dépense de ses SŒURS, pas seulement sur la sienne", async () => {
    // Un seul compteur pour les deux boucles : c'est le montage réel du chunk, où
    // parent et filles tournent dans le même process.
    const chunkSpend = { usd: 0 };

    // Sœur A : un appel payant à 0,60 $, puis elle conclut.
    responses = [() => new Response(sseText("A is done.", 0.6))];
    const a = await runAgentLoop({ ...baseParams, messages: seed(), budgetUsd: 1, chunkSpend });
    expect(a.status).toBe("completed");
    expect(chunkSpend.usd).toBeCloseTo(0.6, 6);

    // Sœur B, MÊME plafond, MÊME compteur : son premier round passe (0,60 < 1,00),
    // le second ne doit plus — alors que sa dépense PROPRE, elle, est sous le plafond.
    responses = [() => new Response(sseToolCall("call_1", 0.6))];
    const b = await runAgentLoop({ ...baseParams, messages: seed(), budgetUsd: 1, chunkSpend });

    expect(b.status).toBe("budget_exhausted");
    expect(b.costUsd).toBeCloseTo(0.6, 6);
    expect(b.costUsd).toBeLessThan(1);
    expect(chunkSpend.usd).toBeCloseTo(1.2, 6);
    // Deux appels au total, un par boucle : B n'en a pas payé un second.
    expect(calls).toBe(2);
  });

  it("sans compteur partagé, la même sœur aurait dépensé le plafond entier", async () => {
    // Le contrôle qui donne son sens au test du dessus : avec un compteur À ELLE,
    // B ne voit pas la dépense de A et joue ses rounds jusqu'à son propre plafond.
    responses = [
      () => new Response(sseToolCall("call_1", 0.6)),
      () => new Response(sseToolCall("call_2", 0.6)),
    ];
    const b = await runAgentLoop({ ...baseParams, messages: seed(), budgetUsd: 1 });

    expect(b.status).toBe("budget_exhausted");
    expect(b.costUsd).toBeCloseTo(1.2, 6);
    expect(calls).toBe(2);
  });

  it("dit sa dépense À CHAQUE appel payé, sans attendre de rendre la main (MIN-220)", async () => {
    // Ce que le crochet sert : la boucle d'un sous-agent peut être abandonnée en
    // vol (`cutAll` / `suspendAll` rendent la main au bout de 5 s), et son total de
    // fin de course n'arrive alors jamais au registre. Ce qu'elle a dit en chemin,
    // si — c'est là-dessus que repose la facturation de la fille coupée.
    const paid: number[] = [];
    responses = [
      () => new Response(sseToolCall("call_1", 0.2)),
      () => new Response(sseText("Done.", 0.05)),
    ];

    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      onSpend: (usd) => paid.push(usd),
    });

    expect(result.status).toBe("completed");
    // Un appel = une annonce, dans l'ordre, et la somme est le total rendu : rien
    // n'est annoncé deux fois, rien n'est passé sous silence.
    expect(paid).toEqual([0.2, 0.05]);
    expect(paid.reduce((a, b) => a + b, 0)).toBeCloseTo(result.costUsd, 6);
  });

  it("n'annonce RIEN au drain d'un rapport de fille (elle l'a déjà annoncé en payant)", async () => {
    // Le pendant du cas ci-dessous pour `chunkSpend` : une fille qui rend 5 $ les a
    // déjà portés elle-même. Les réannoncer ferait imputer sa dépense deux fois au
    // run — exactement le double compte que `costBilled` existe pour empêcher.
    const paid: number[] = [];
    responses = [() => new Response(sseText("Noted.", 0.01))];

    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      onSpend: (usd) => paid.push(usd),
      pullSubagentReports: async () => [{ id: "sub-1", text: "I found 42 call sites.", costUsd: 5 }],
    });

    expect(result.costUsd).toBeCloseTo(5.01, 6);
    expect(paid).toEqual([0.01]);
  });

  it("un rapport de fille n'entre PAS dans le compteur du chunk (elle l'y a déjà porté)", async () => {
    const chunkSpend = { usd: 0 };
    responses = [() => new Response(sseText("Noted.", 0.01))];

    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      budgetUsd: 1,
      chunkSpend,
      pullSubagentReports: async () => [{ id: "sub-1", text: "I found 42 call sites.", costUsd: 5 }],
    });

    expect(result.status).toBe("completed");
    // Le coût RENDU par la boucle porte bien la fille : c'est lui qui alimente
    // `run.cost_usd`, et sans ça la dépense d'un sous-agent n'arriverait jamais
    // jusqu'à la facture.
    expect(result.costUsd).toBeCloseTo(5.01, 6);
    // Mais le compteur du chunk, lui, ne connaît que l'appel que CETTE boucle a payé :
    // la fille a incrémenté le compteur partagé en payant, l'y remettre au drain
    // compterait sa dépense deux fois et couperait le passage bien trop tôt.
    expect(chunkSpend.usd).toBeCloseTo(0.01, 6);
  });
});

/**
 * MIN-224 — le plafond de dépense se RELIT en cours de route.
 *
 * Rien ne réserve de budget : deux runs lancés à la même seconde lisent le même
 * restant et le prennent chacun pour plafond, donc ils peuvent dépenser le double.
 * Ce qui borne la casse, c'est la fréquence de relecture — l'ancienne forme
 * relisait entre ses chunks (cinq minutes au pire), un tour de microVM dure des
 * heures et ne relisait pas du tout.
 */
describe("le plafond se relit en cours de route (runs concurrents)", () => {
  it("s'arrête dès que le restant relu est épuisé, sans payer un round de plus", async () => {
    // Le tour part avec 10 $ devant lui. Pendant qu'il travaille, un AUTRE run vide
    // le budget du compte. Sans relecture, celui-ci continuerait jusqu'à 10 $.
    responses = [
      () => new Response(sseToolCall("call_1", 0.2)),
      () => new Response(sseText("ce round ne doit jamais être payé", 5)),
    ];
    let reads = 0;
    const out = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      budgetUsd: 10,
      // Première frontière : rien de neuf (pas encore l'heure). Deuxième : le
      // compte est à sec.
      refreshBudgetUsd: async () => (++reads === 1 ? null : 0),
    });

    expect(out.status).toBe("budget_exhausted");
    // UN seul appel payé : la coupure tombe à la frontière de round, avant le
    // second. C'est tout l'objet du crochet — ce round-là aurait coûté 5 $.
    expect(calls).toBe(1);
    expect(out.costUsd).toBeCloseTo(0.2, 6);
  });

  it("garde son plafond quand la lecture ne dit rien — une panne de facturation n'arrête pas un run", async () => {
    // `null` = pas encore l'heure, ou lecture en échec. Le pire cas assumé est le
    // comportement d'avant : le snapshot d'entrée continue de gouverner.
    responses = [
      () => new Response(sseToolCall("call_1", 0.2)),
      () => new Response(sseText("fini", 0.2)),
    ];
    const out = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      budgetUsd: 10,
      refreshBudgetUsd: async () => null,
    });

    expect(out.status).toBe("completed");
    expect(calls).toBe(2);
  });

  it("compte le restant À PARTIR DE MAINTENANT, pas depuis le début du tour", async () => {
    // Le crochet rend ce qu'il reste à dépenser, pas un total : la boucle en refait
    // un plafond par `dépense du tour + restant`. Confondre les deux couperait un
    // tour qui a déjà dépensé plus que ce qui lui reste — c'est-à-dire presque tous.
    responses = [
      () => new Response(sseToolCall("call_1", 0.6)),
      () => new Response(sseText("fini", 0.2)),
    ];
    const out = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      budgetUsd: 1,
      // Le tour a déjà dépensé 0,60 $ quand on relit, et il reste 0,30 $ au compte :
      // il a donc encore le droit de jouer son round.
      refreshBudgetUsd: async () => 0.3,
    });

    expect(out.status).toBe("completed");
    expect(calls).toBe(2);
  });
});
