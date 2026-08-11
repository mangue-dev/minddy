import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

/**
 * UN « STOP » QUI ARRIVE AVEC UN MESSAGE N'EST PAS UN ARRÊT.
 *
 * Ce que ça coûtait de ne pas le vérifier. Le composer envoie TOUJOURS le couple
 * message-puis-stop quand l'agent travaille — c'est ce que veut dire « arrête-toi
 * et fais plutôt ça ». Or l'interruption est lue au SOMMET du round, avant le
 * drainage du steering : elle gagnait la course à tous les coups. Le tour sortait
 * sans avoir lu le message, l'exécuteur le re-queuait aussitôt puisqu'il en
 * restait un en file, et un chunk entier — dans la nouvelle forme, une microVM et
 * son amorçage — repartait juste pour relire une phrase qui attendait déjà.
 *
 * Vu de l'écran : « ça a interrompu le modèle, mais pas vraiment », « mon message
 * n'a pas vraiment été envoyé », « ça se relançait tout seul ».
 *
 * Ce qui tranche ici n'est pas une intention devinée mais la FILE : un stop
 * accompagné d'un message se poursuit, un stop seul sort. Et le drainage n'a lieu
 * QUE si la boucle sait consommer le drapeau (`clearInterrupt`) — drainer pour
 * sortir ensuite consommerait le message sans que personne ne l'injecte, et il
 * serait perdu pour de bon.
 *
 * On ne moque que `fetch` : la boucle et l'ordre des drains sont le vrai chemin.
 */

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

let sentMessages: AgentChatMessage[][] = [];
let events: Array<{ type: string; payload: Record<string, unknown> }> = [];

beforeEach(() => {
  sentMessages = [];
  events = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      sentMessages.push((JSON.parse(init.body) as { messages: AgentChatMessage[] }).messages);
      return new Response(sseText("D'accord, je fais plutôt ça."));
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const seed = (): AgentChatMessage[] => [
  { role: "system", content: "You are numo." },
  { role: "user", content: "Migre la base." },
];

const baseParams = {
  tools: [],
  model: "test/model",
  apiKey: "sk-test",
  baseUrl: "https://example.invalid/v1",
  runId: "run_test",
  billTo: { userId: "user_test" } as const,
  recordUsage: async () => {},
  softDeadlineMs: 250_000,
  execTool: async () => ({ result: { ok: true }, success: true }),
  emit: async (type: string, payload: Record<string, unknown>) => {
    events.push({ type, payload });
  },
};

/** Le drapeau d'interruption, tel que la base le porte : levé, puis consommé. */
function interruptFlag(initial: boolean) {
  let raised = initial;
  return {
    checkInterrupt: async () => raised,
    clearInterrupt: async () => {
      raised = false;
    },
    raised: () => raised,
  };
}

describe("« stop » + message", () => {
  it("poursuit le tour avec la consigne, au lieu d'en sortir", async () => {
    const flag = interruptFlag(true);
    const drained: string[] = [];

    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      checkInterrupt: flag.checkInterrupt,
      clearInterrupt: flag.clearInterrupt,
      pullSteering: async () => {
        const next = drained.length === 0 ? ["Non, migre plutôt les vues."] : [];
        drained.push(...next);
        return next;
      },
    });

    // Le tour va au bout — il n'est ni « interrompu », ni re-queué par l'exécuteur.
    expect(result.status).toBe("completed");
    // Le drapeau est CONSOMMÉ : sans ça, le round suivant le relirait et sortirait
    // avec le message pour seule trace.
    expect(flag.raised()).toBe(false);
    // Et le modèle a bien reçu la consigne dans CE tour-ci.
    const lastSent = JSON.stringify(sentMessages[0]);
    expect(lastSent).toContain("Non, migre plutôt les vues.");
    // La file n'a été drainée qu'UNE fois pour ce round : ce que le bloc
    // d'interruption a pris, le bloc de steering ne le redemande pas.
    expect(drained).toEqual(["Non, migre plutôt les vues."]);
    // Le fil porte la bulle du message, comme pour un steering ordinaire.
    expect(events.filter((e) => e.type === "user_message")).toHaveLength(1);
  });

  it("un « stop » SEUL sort, comme avant", async () => {
    const flag = interruptFlag(true);
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      checkInterrupt: flag.checkInterrupt,
      clearInterrupt: flag.clearInterrupt,
      pullSteering: async () => [],
    });

    expect(result.status).toBe("interrupted");
    // Aucun appel au modèle : le round n'a pas eu lieu.
    expect(sentMessages).toHaveLength(0);
    // Le drapeau n'a pas été consommé — c'est l'exécuteur qui l'efface en posant
    // la session au repos.
    expect(flag.raised()).toBe(true);
  });

  it("un message BLANC ne retient pas le stop", async () => {
    const flag = interruptFlag(true);
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      checkInterrupt: flag.checkInterrupt,
      clearInterrupt: flag.clearInterrupt,
      pullSteering: async () => ["   "],
    });

    expect(result.status).toBe("interrupted");
    expect(sentMessages).toHaveLength(0);
  });

  it("sans crochet de consommation, la file n'est même pas drainée", async () => {
    // Le repli des appelants qui n'ont pas de quoi effacer le drapeau (sous-agents,
    // tests). Drainer ici avalerait le message : il serait consommé, jamais
    // injecté, et perdu pour de bon.
    const drains: number[] = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      checkInterrupt: async () => true,
      pullSteering: async () => {
        drains.push(1);
        return ["Fais plutôt ça."];
      },
    });

    expect(result.status).toBe("interrupted");
    expect(drains).toHaveLength(0);
  });

  it("un drapeau qui RESTE levé après effacement fait sortir — sans avaler le message", async () => {
    // Dans la microVM, `checkInterrupt` réunit deux signaux : le « stop » de
    // l'utilisateur et « ce run ne t'appartient plus » (le 409 de la sauvegarde de
    // checkpoint). Le second n'est pas effaçable — la boucle le relit derrière et
    // sort, mais rend d'abord à l'historique ce qu'elle vient de drainer.
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      checkInterrupt: async () => true,
      clearInterrupt: async () => {},
      pullSteering: async () => ["Fais plutôt ça."],
    });

    expect(result.status).toBe("interrupted");
    expect(sentMessages).toHaveLength(0);
    expect(result.messages.at(-1)).toEqual({ role: "user", content: "Fais plutôt ça." });
  });
});
