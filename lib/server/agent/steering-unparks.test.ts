import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `recordAiUsage` écrit en base (service client) : neutralisé, le reste est réel.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

/**
 * MIN-205 — un message de l'utilisateur DÉGARE le parent qui attend ses filles.
 *
 * Ce que ça coûtait de ne pas le vérifier : `injectedThisRound`, seul lecteur de la
 * garde du parking, ne comptait que les rapports de filles. Un message de steering
 * entrait dans l'historique sans lever le parking, et le parent repartait attendre
 * ses filles pour le chunk entier — sans un seul appel au modèle. L'utilisateur
 * écrivait « laisse tomber le sous-agent, dis-moi ce que tu as trouvé », voyait son
 * message accepté et affiché dans le fil, puis l'agent restait muet des dizaines de
 * minutes. La sonde censée rompre l'attente ne pouvait pas non plus tomber : elle
 * teste les messages NON consommés, que le drain venait de marquer consommés.
 *
 * On ne moque QUE `fetch` : la boucle, l'ordre des drains et la garde du parking
 * sont le vrai chemin. Ce qui se vérifie ici est un ORDRE — le modèle avant
 * l'attente, ou l'inverse.
 */

/** Corps SSE d'un round texte (fin de tour). */
function sseText(text: string): string {
  const chunks = [
    { id: "gen_1", model: "test/model", choices: [{ delta: { content: text } }] },
    {
      id: "gen_1",
      model: "test/model",
      choices: [{ delta: {} }, { finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, cost: 0.01 },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Journal d'ordre : « model » à chaque appel LLM, « await » à chaque attente. */
let order: string[] = [];
/** Corps envoyés au modèle, pour lire l'historique qu'il a vraiment reçu. */
let sentMessages: AgentChatMessage[][] = [];

beforeEach(() => {
  order = [];
  sentMessages = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      order.push("model");
      sentMessages.push((JSON.parse(init.body) as { messages: AgentChatMessage[] }).messages);
      return new Response(sseText("J'ai trouvé 42 appelants."));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const seed = (): AgentChatMessage[] => [
  { role: "system", content: "You are numo." },
  { role: "user", content: "Cherche les appelants." },
  { role: "assistant", content: "Je délègue et j'attends." },
];

/** Attente de filles : ne rend rien (aucune n'a fini), mais laisse sa trace. */
const awaitSubagents = async () => {
  order.push("await");
  return { reports: [] };
};

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
  parkedForSubagents: true,
  awaitSubagents,
};

describe("parking du parent en attente de ses sous-agents", () => {
  it("un message de l'utilisateur le dégare : le modèle parle dans le MÊME round", async () => {
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      pullSteering: async () => ["Laisse tomber le sous-agent, dis-moi ce que tu as trouvé."],
    });

    expect(result.status).toBe("completed");
    // Le point du ticket : l'appel au modèle vient AVANT toute attente. Avec le
    // compteur déclaré sous le steering, l'ordre était inverse — le parent partait
    // attendre ses filles pour tout le chunk sans avoir lu le message.
    expect(order[0]).toBe("model");
    // Et il l'a reçu dans l'historique de CE round, pas du suivant.
    expect(sentMessages[0]).toContainEqual({
      role: "user",
      content: "Laisse tomber le sous-agent, dis-moi ce que tu as trouvé.",
    });
  });

  it("sans rien de neuf, le parking tient : le parent attend AVANT d'appeler le modèle", async () => {
    // Le contrôle qui donne son sens au test du dessus. Faire parler le parent pour
    // qu'il redise « j'attends » coûterait un aller-retour par chunk d'attente.
    const result = await runAgentLoop({ ...baseParams, messages: seed() });

    expect(result.status).toBe("completed");
    expect(order[0]).toBe("await");
  });

  it("un message VIDE ne dégare pas — il n'entre pas non plus dans l'historique", async () => {
    // L'incrément suit le `continue` sur texte blanc : ce qui lève la garde est ce
    // qui a été RÉELLEMENT poussé dans `messages`, pas ce que la file a rendu.
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      pullSteering: async () => ["   "],
    });

    expect(result.status).toBe("completed");
    expect(order[0]).toBe("await");
  });

  it("un rapport de fille dégare toujours (MIN-112 intact)", async () => {
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      pullSubagentReports: async () => [
        { id: "sub-1", text: "J'ai fini : 42 appelants.", costUsd: 0.5 },
      ],
    });

    expect(result.status).toBe("completed");
    expect(order[0]).toBe("model");
  });
});
