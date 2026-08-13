import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 (le puits ci-dessous) ;
// ce mock-ci ne garde plus qu'elle : le reste du graphe, qui l'appelle encore.
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
  // Le ledger est INJECTÉ depuis MIN-224 : la boucle ne connaît plus le chemin de
  // la base. Ici, un puits — ce test ne mesure pas la dépense.
  recordUsage: async () => {},
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
    // Et il l'a reçu dans l'historique de CE round, pas du suivant. Le message
    // part emballé dans une part texte : il est en QUEUE d'historique, donc il
    // porte le cache breakpoint glissant (MIN-242). C'est le corps de la requête
    // qu'on lit ici, pas l'historique-checkpoint, qui lui reste en string.
    expect(sentMessages[0]).toContainEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "Laisse tomber le sous-agent, dis-moi ce que tu as trouvé.",
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  });

  it("injecte les ids des mentions dans le prompt mais garde le texte lisible dans le fil", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
      pullSteering: async () => [
        {
          text: "Relis @MIN-42",
          mentions: [{ type: "issue", id: "issue-1", label: "MIN-42" }],
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(
      sentMessages[0].some((message) =>
        JSON.stringify(message.content).includes("issue (id: issue-1)"),
      ),
    ).toBe(true);

    /**
     * ET L'AUTRE MOITIÉ DU CONTRAT, celle qui fait toute la PR : ce que
     * l'UTILISATEUR relit dans le fil reste sa phrase. Les ids sont pour le
     * modèle ; les recopier dans l'event ferait lire « Relis @MIN-42 (id:
     * issue-1) » à quelqu'un qui a écrit trois mots.
     */
    const bubble = events.find((e) => e.type === "user_message");
    expect(bubble?.payload.text).toBe("Relis @MIN-42");
    // L'id n'est PAS dans le texte — c'est là qu'il se serait vu.
    expect(String(bubble?.payload.text)).not.toContain("issue-1");
    // Les mentions voyagent À CÔTÉ du texte : c'est ce que le fil rend en
    // pilules cliquables.
    expect(bubble?.payload.mentions).toEqual([
      { type: "issue", id: "issue-1", label: "MIN-42" },
    ]);
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
