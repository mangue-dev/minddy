import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `recordAiUsage` écrit en base (service client) : neutralisé, le reste est réel.
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
