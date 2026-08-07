import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 (le puits ci-dessous) ;
// ce mock-ci ne garde plus qu'elle : le reste du graphe, qui l'appelle encore.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

/**
 * MIN-208 — un rapport rendu À L'INSTANT du suspend doit partir avec le checkpoint.
 *
 * `awaitSubagents` draine AVANT de décider de suspendre : quand une fille ne sait pas
 * sauver son état, elle est coupée et son rapport PARTIEL part dans le même retour
 * que `suspend: true` (execute.ts). Or `drainReports()` a déjà marqué ce record livré
 * ET facturé — il ne reviendra ni au drain suivant, ni à `settleUnbilled()`. Les deux
 * sites de la boucle qui lisaient `suspend` retournaient avant de jouer les rapports :
 * du travail payé, perdu, et un parent qui n'entendrait jamais parler de ce que sa
 * fille avait trouvé.
 *
 * Ce qui se vérifie ici est donc la SORTIE : le texte dans `result.messages` (donc
 * dans le checkpoint, livré au chunk suivant) et le coût dans `result.costUsd`.
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

/** Events `status` posés par la boucle, pour lire la livraison annoncée au fil. */
let statuses: Array<Record<string, unknown>> = [];

beforeEach(() => {
  statuses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(sseText("Je délègue et j'attends."))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const seed = (): AgentChatMessage[] => [
  { role: "system", content: "You are numo." },
  { role: "user", content: "Cherche les appelants, et corrige-les." },
];

/** Le rapport partiel de la fille coupée, tel que `drainReports()` le rend. */
const PARTIAL = { id: "sub-explore", text: "J'ai trouvé 42 appelants.", costUsd: 0.5 };

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
  emit: async (type: string, payload: Record<string, unknown>) => {
    if (type === "status") statuses.push(payload);
  },
  // Le décor du ticket : `explore` vient d'être coupée avec son rapport partiel,
  // `implement` s'est suspendue proprement → un rapport ET `suspend`.
  awaitSubagents: async () => ({ reports: [PARTIAL], interrupted: false, suspend: true }),
};

describe("rapport de sous-agent récupéré à l'instant du suspend", () => {
  it("site GARÉ : le rapport part dans le checkpoint, son coût dans le retour", async () => {
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      parkedForSubagents: true,
    });

    expect(result.status).toBe("suspended");
    // Le point du ticket : sans le correctif, ce message n'existait nulle part —
    // `drainReports()` l'avait marqué livré, il ne serait jamais revenu.
    expect(result.messages).toContainEqual({ role: "user", content: PARTIAL.text });
    // Et sa dépense non plus : le record sortait déjà `costBilled`, donc invisible
    // à `settleUnbilled()`. Aucun appel LLM sur ce chemin (le parent était garé).
    expect(result.costUsd).toBeCloseTo(PARTIAL.costUsd, 10);
    // La fille est annoncée COUPÉE au fil, pas laissée « lancée » pour toujours.
    expect(statuses).toContainEqual({
      phase: "subagent_report",
      id: PARTIAL.id,
      partial: true,
    });
  });

  it("site FIN DE TOUR : idem, en plus du coût du round qui vient d'être payé", async () => {
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
    });

    expect(result.status).toBe("suspended");
    expect(result.messages).toContainEqual({ role: "user", content: PARTIAL.text });
    // 0,01 $ pour le round + 0,50 $ du rapport : le second se perdait entièrement.
    expect(result.costUsd).toBeCloseTo(0.01 + PARTIAL.costUsd, 10);
    expect(statuses).toContainEqual({
      phase: "subagent_report",
      id: PARTIAL.id,
      partial: true,
    });
  });

  it("sans suspend, la livraison reste celle d'avant (pas marquée partielle)", async () => {
    // Le contrôle : une fille qui rend son rapport DANS le budget n'est pas coupée,
    // le tour repart, et rien de ce chemin-là ne change.
    let calls = 0;
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      parkedForSubagents: true,
      awaitSubagents: async () =>
        calls++ === 0
          ? { reports: [PARTIAL], interrupted: false }
          : { reports: [], interrupted: false },
    });

    expect(result.status).toBe("completed");
    expect(result.messages).toContainEqual({ role: "user", content: PARTIAL.text });
    expect(statuses).toContainEqual({ phase: "subagent_report", id: PARTIAL.id });
  });
});
