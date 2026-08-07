import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 (le puits ci-dessous) ;
// ce mock-ci ne garde plus qu'elle : le reste du graphe, qui l'appelle encore.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

/**
 * MIN-203 : un round qui n'a pas abouti ne doit PAS se lire comme une fin de tour.
 * `finish_reason` n'était jamais lu — un round coupé au plafond de tokens, ou
 * revenu vide, rendait `status: "completed"` avec `reply: "Done."`. En aval,
 * `commitAndPush` partait avec un commit intitulé « Done. », l'arbre à moitié
 * écrit était poussé, et l'`outcome` stampé devenait le résumé qu'une session
 * froide relit.
 *
 * On ne moque QUE `fetch` : le parsing SSE et la boucle sont le vrai chemin.
 */

interface Choice {
  delta?: Record<string, unknown>;
  finish_reason?: string | null;
}

/** Corps SSE d'un round : des `choices` bruts, puis l'usage. */
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
    usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, cost: 0.01 },
  });
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Round texte, avec son motif d'arrêt. `length` = coupé au plafond de tokens. */
function sseText(text: string, finishReason: string | null = "stop"): string {
  return sse([{ delta: { content: text } }, { delta: {}, finish_reason: finishReason }]);
}

/** Round qui ne rend RIEN : ni texte, ni tool-call. */
function sseEmpty(finishReason: string | null = "stop"): string {
  return sse([{ delta: {}, finish_reason: finishReason }]);
}

/** Round tronqué EN PLEIN tool-call : texte + un appel, coupé au plafond. */
function sseToolCall(id: string, name: string, args: string, finishReason = "stop"): string {
  return sse([
    { delta: { tool_calls: [{ index: 0, id, function: { name, arguments: args } }] } },
    { delta: {}, finish_reason: finishReason },
  ]);
}

/** Erreur rendue AU FIL du stream (la forme d'OpenRouter). */
function sseError(code: number, message: string): string {
  return `data: ${JSON.stringify({ error: { code, message } })}\n\ndata: [DONE]\n\n`;
}

let responses: Array<() => Response>;
/**
 * Appels au PROVIDER (`/chat/completions`) — ce que ces tests comptent. La boucle
 * touche aussi l'index de prix d'OpenRouter quand elle facture un essai abandonné
 * (MIN-216) ; le mêler à ce compteur ferait dire à l'assertion « on n'a pas
 * repassé le round au modèle » autre chose que ce qu'elle vérifie.
 */
let fetchCalls: number;

beforeEach(() => {
  responses = [];
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!String(url).includes("/chat/completions")) {
        throw new Error("fetch hors provider non prévu par le test");
      }
      fetchCalls++;
      const next = responses.shift();
      if (!next) throw new Error("fetch non prévu par le test");
      return next();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  emit: async () => {},
  execTool: async () => ({ result: {}, success: true }),
};

function seed(): AgentChatMessage[] {
  return [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Fix the bug." },
  ];
}

function collectEvents() {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    emit: async (type: string, payload: Record<string, unknown>) => {
      events.push({ type, payload });
    },
  };
}

describe("round coupé au plafond de tokens", () => {
  it("ne conclut PAS le tour : il fait reprendre le modèle", async () => {
    responses = [
      () => new Response(sseText("I ran the tests and they all", "length")),
      () => new Response(sseText("All 42 tests pass.")),
    ];
    const { events, emit } = collectEvents();

    const result = await runAgentLoop({ ...baseParams, messages: seed(), emit });

    // Le tour n'a PAS été clos sur le fragment : le round suivant a eu lieu.
    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(2);
    // …et c'est la VRAIE réponse qui devient `reply` — donc le message de commit
    // et l'`outcome` en aval.
    expect(result.reply).toBe("All 42 tests pass.");

    // Le fragment est resté dans le contexte, suivi de la relance.
    const nudge = result.messages.find(
      (m) => m.role === "user" && String(m.content).includes("cut off at the token limit"),
    );
    expect(nudge).toBeDefined();
    expect(result.messages.some((m) => m.role === "assistant" && m.content === "I ran the tests and they all")).toBe(true);

    // UN seul `summary` : le fragment n'a jamais été présenté comme une conclusion.
    const summaries = events.filter((e) => e.type === "summary");
    expect(summaries).toHaveLength(1);
    expect(summaries[0].payload.text).toBe("All 42 tests pass.");
    // La coupure laisse une trace mesurable sur agent_run_events.
    expect(events.some((e) => e.type === "status" && e.payload.phase === "reply_incomplete")).toBe(true);
  });

  it("reconnaît AUSSI `max_tokens`, la forme native sous la couche compat", async () => {
    responses = [
      () => new Response(sseText("Let me check the", "max_tokens")),
      () => new Response(sseText("Checked.")),
    ];

    const result = await runAgentLoop({ ...baseParams, messages: seed() });

    expect(result.rounds).toBe(2);
    expect(result.reply).toBe("Checked.");
  });

  it("s'arrête EN LE DISANT une fois le plafond de relances épuisé", async () => {
    responses = [
      () => new Response(sseText("thinking about it", "length")),
      () => new Response(sseText("still thinking about it", "length")),
      () => new Response(sseText("and again", "length")),
    ];
    const { events, emit } = collectEvents();

    const result = await runAgentLoop({ ...baseParams, messages: seed(), emit });

    // LE point du ticket : pas de `completed`, donc pas de commit « Done. »,
    // pas de push de l'arbre à moitié écrit, pas d'`outcome` mensonger.
    expect(result.status).toBe("error");
    expect(result.reply).toBeUndefined();
    expect(result.errorMessage).toMatch(/cut off at the token limit/);
    // Aucune bulle de clôture : le tour ne s'est pas raconté comme fini.
    expect(events.some((e) => e.type === "summary")).toBe(false);
    const error = events.find((e) => e.type === "error")!;
    expect(error.payload.code).toBe("replyIncomplete");
    // Le checkpoint repart avec le contexte : la session reste reprenable.
    expect(result.messages.length).toBeGreaterThan(2);
  });

  it("laisse le round tronqué PORTANT des tool-calls suivre son chemin normal", async () => {
    // Un round coupé pendant ses tool-calls continue de toute façon (la boucle ne
    // conclut que sans tool-call), et les arguments coupés sont refusés par le
    // garde-fou de MIN-204 — pas par celui-ci.
    responses = [
      () => new Response(sseToolCall("call_1", "run_command", JSON.stringify({ command: "npm test" }), "length")),
      () => new Response(sseText("Tests pass.")),
    ];
    const execTool = vi.fn(async () => ({ result: { exit_code: 0 }, success: true }));

    const result = await runAgentLoop({ ...baseParams, messages: seed(), execTool });

    expect(execTool).toHaveBeenCalledWith("run_command", { command: "npm test" }, "call_1");
    expect(result.status).toBe("completed");
    expect(result.reply).toBe("Tests pass.");
  });
});

describe("round revenu vide", () => {
  it("fait reprendre le modèle au lieu de répondre « Done. »", async () => {
    responses = [() => new Response(sseEmpty()), () => new Response(sseText("Here is the fix."))];
    const { events, emit } = collectEvents();

    const result = await runAgentLoop({ ...baseParams, messages: seed(), emit });

    expect(result.status).toBe("completed");
    expect(result.reply).toBe("Here is the fix.");
    // C'est très exactement ce que le repli « Done. » maquillait.
    expect(result.reply).not.toBe("Done.");
    expect(
      result.messages.some((m) => m.role === "user" && String(m.content).includes("came back empty")),
    ).toBe(true);
    expect(events.filter((e) => e.type === "summary")).toHaveLength(1);
  });

  it("s'arrête en erreur si le modèle ne rend jamais rien", async () => {
    responses = [
      () => new Response(sseEmpty()),
      () => new Response(sseEmpty()),
      () => new Response(sseEmpty()),
    ];
    const { events, emit } = collectEvents();

    const result = await runAgentLoop({ ...baseParams, messages: seed(), emit });

    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/empty reply/);
    expect(events.some((e) => e.type === "summary")).toBe(false);
  });
});

describe("erreur rendue AU FIL du stream", () => {
  it("suspend le run quand elle est reprenable (5xx) — au lieu de conclure", async () => {
    responses = [() => new Response(sseError(502, "upstream is down"))];

    // Deadline courte : la reprise verrait qu'elle dormirait au-delà, et relève —
    // le test n'attend donc aucun backoff.
    const result = await runAgentLoop({ ...baseParams, messages: seed(), softDeadlineMs: 300 });

    expect(result.status).toBe("suspended");
    expect(result.reply).toBeUndefined();
    expect(fetchCalls).toBe(1);
  });

  it("échoue le tour quand elle ne l'est pas (402), sans repasser par le provider", async () => {
    responses = [() => new Response(sseError(402, "insufficient credits"))];
    const { events, emit } = collectEvents();

    const result = await runAgentLoop({ ...baseParams, messages: seed(), emit });

    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/insufficient credits/);
    expect(fetchCalls).toBe(1);
    expect(events.some((e) => e.type === "summary")).toBe(false);
  });
});
