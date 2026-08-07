import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiUsageInput } from "@/lib/server/ai-usage";

/**
 * MIN-216 — un round interrompu ou un stream avorté écrit sa ligne `ai_usage`.
 *
 * Ce que ça coûtait de ne pas le vérifier : la ligne d'usage ne s'écrivait qu'au
 * RETOUR complet de `streamCompletion`, et l'objet `usage` d'OpenRouter n'arrive
 * qu'au dernier chunk du flux. Un « Stop » de l'utilisateur, un flux coupé, ou un
 * essai que la boucle de reprise remplace en silence : le fournisseur avait
 * facturé (l'annulation arrête la facturation chez ceux qui la supportent, et
 * chez les autres la réponse complète est facturée), et la dépense n'entrait ni
 * dans le quota du compte, ni dans le plafond du run (lu au ledger depuis
 * MIN-215), ni dans la facture — sur un geste répétable à volonté.
 *
 * Comme `chunk-spend.test.ts`, on ne moque que ce qui sort du process : `fetch`,
 * l'écriture au ledger, et l'index de prix. Le streaming SSE, la classification
 * des erreurs et la comptabilité du chunk sont le vrai chemin.
 */

const { recorded } = vi.hoisted(() => ({ recorded: [] as AiUsageInput[] }));

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async (input: AiUsageInput | AiUsageInput[]) => {
    recorded.push(...(Array.isArray(input) ? input : [input]));
  }),
}));

// Prix publiés du modèle : sans eux, un essai abandonné n'aurait que ses tokens.
vi.mock("./openrouter-index", () => ({
  getOpenRouterModelInfo: vi.fn(async () => ({
    id: "test/model",
    name: "Test model",
    contextLength: 200_000,
    imageInput: false,
    tools: true,
    pricing: { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  })),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

const encoder = new TextEncoder();

/** Un chunk SSE de texte, celui que le modèle a eu le temps d'écrire. */
function textChunk(text: string): Uint8Array {
  const payload = {
    id: "gen_abandoned",
    model: "test/model",
    choices: [{ delta: { content: text } }],
  };
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Un round texte COMPLET, usage rapporté compris (fin de tour). */
function sseText(text: string, cost: number): string {
  const chunks = [
    { id: "gen_ok", model: "test/model", choices: [{ delta: { content: text } }] },
    {
      id: "gen_ok",
      model: "test/model",
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 1100, completion_tokens: 10, total_tokens: 1110, cost },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

/**
 * 200 OK, un chunk de texte livré, puis le flux CASSE. Le chunk part au premier
 * `read()` et l'erreur au suivant (`pull`) : sans ça, `controller.error()` vide
 * la file et le texte déjà écrit serait perdu par le test lui-même.
 */
function brokenStream(text: string): Response {
  let step = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (step++ === 0) controller.enqueue(textChunk(text));
        else controller.error(new Error("connexion coupée en plein flux"));
      },
    }),
  );
}

/** 200 OK, un chunk livré, puis plus rien — jusqu'à l'abort du signal. */
function hangingStream(text: string, signal: AbortSignal | null | undefined): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(textChunk(text));
        // Le vrai `fetch` casse le corps quand le signal tombe ; le stub doit le
        // faire aussi, sinon l'interruption n'aurait aucun effet observable.
        signal?.addEventListener("abort", () => {
          try {
            controller.error(new Error("aborted"));
          } catch {
            // Flux déjà clos : rien à faire.
          }
        });
      },
    }),
  );
}

let responses: Array<(init?: RequestInit) => Response>;
let calls = 0;

beforeEach(() => {
  recorded.length = 0;
  responses = [];
  calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls++;
      const next = responses.shift();
      if (!next) throw new Error("fetch non prévu par le test");
      return next(init);
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
  execTool: async () => ({ result: { ok: true }, success: true }),
  emit: async () => {},
};

describe("dépense d'un essai abandonné", () => {
  it("écrit une ligne estimée quand le flux casse après la réponse du fournisseur", async () => {
    responses = [() => brokenStream("Je regarde le fichier…")];
    const chunkSpend = { usd: 0 };

    // Soft-deadline trop courte pour s'offrir une reprise (MIN_STREAM_ATTEMPT_MS) :
    // l'essai est jeté et la boucle suspend, sans faire dormir le test.
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      softDeadlineMs: 30_000,
      chunkSpend,
    });

    expect(result.status).toBe("suspended");
    expect(calls).toBe(1);

    expect(recorded).toHaveLength(1);
    const line = recorded[0];
    expect(line.feature).toBe("agent_code");
    expect(line.seq).toBe(0);
    // L'id de génération est ce qui permet de retrouver la dépense chez le
    // fournisseur : il est connu dès le premier chunk, il doit survivre.
    expect(line.generationId).toBe("gen_abandoned");
    expect(line.estimated).toBe(true);
    expect(line.promptTokens).toBeGreaterThan(0);
    expect(line.completionTokens).toBeGreaterThan(0);
    expect(line.cost).toBeGreaterThan(0);

    // Et la dépense compte VRAIMENT : le coût rendu au run (donc au plafond lu au
    // ledger) et le compteur du chunk (donc le plafond opposé aux filles).
    expect(result.costUsd).toBeCloseTo(line.cost ?? 0, 9);
    expect(chunkSpend.usd).toBeCloseTo(line.cost ?? 0, 9);
  });

  it("écrit une ligne aussi pour l'essai qu'une REPRISE remplace en silence", async () => {
    // Le cas le plus fréquent : un hoquet réseau en plein flux, puis un essai qui
    // aboutit. L'appelant ne voit qu'un seul `StreamResult` — le fournisseur, lui,
    // a facturé deux fois.
    responses = [() => brokenStream("Première tentative…"), () => new Response(sseText("Done.", 0.02))];

    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      softDeadlineMs: 250_000,
    });

    expect(result.status).toBe("completed");
    expect(calls).toBe(2);
    expect(recorded).toHaveLength(2);

    // L'essai jeté : estimé, sur sa propre place dans la bande de seq.
    expect(recorded[0].estimated).toBe(true);
    expect(recorded[0].seq).toBe(0);
    // L'essai abouti : le coût RAPPORTÉ, non marqué.
    expect(recorded[1].estimated).toBeFalsy();
    expect(recorded[1].seq).toBe(1);
    expect(recorded[1].cost).toBe(0.02);

    expect(result.costUsd).toBeCloseTo(0.02 + (recorded[0].cost ?? 0), 9);
  });

  it("écrit une ligne quand l'utilisateur interrompt le round en cours", async () => {
    // Le geste du ticket : « Stop » pendant que le modèle écrit. Déclenchable à
    // volonté, donc c'est le trou par lequel un compte pourrait dépenser sans
    // jamais rien compter.
    let streaming = false;
    responses = [
      (init) => {
        streaming = true;
        return hangingStream("Je commence à écrire la réponse…", init?.signal);
      },
    ];

    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      softDeadlineMs: 250_000,
      // Faux tant que rien n'est en vol (sinon la boucle sort avant tout appel),
      // vrai dès que le stream est ouvert : c'est la sonde d'interruption qui
      // avorte le fetch.
      checkInterrupt: async () => streaming,
    });

    expect(result.status).toBe("interrupted");
    expect(recorded).toHaveLength(1);
    expect(recorded[0].estimated).toBe(true);
    expect(recorded[0].cost).toBeGreaterThan(0);
    expect(result.costUsd).toBeCloseTo(recorded[0].cost ?? 0, 9);
  }, 15_000);

  it("n'écrit RIEN quand le fournisseur n'a pas répondu", async () => {
    // Un 500 n'a rien produit : facturer là-dessus inventerait une dépense.
    responses = [() => new Response("upstream is down", { status: 500 })];

    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      softDeadlineMs: 30_000,
    });

    expect(result.status).toBe("suspended");
    expect(recorded).toHaveLength(0);
    expect(result.costUsd).toBe(0);
  });
});
