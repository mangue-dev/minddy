import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 (le puits ci-dessous) ;
// ce mock-ci ne garde plus qu'elle : le reste du graphe, qui l'appelle encore.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";
import { MIN_STREAM_ATTEMPT_MS } from "./retry";

/**
 * MIN-214 — la soft-deadline n'était qu'un guichet d'ENTRÉE : elle décidait si on
 * entamait un round, jamais si on avait de quoi le FINIR. Un round entamé juste
 * avant pouvait encore enchaîner des reprises d'appel modèle et une file de
 * tool-calls ; la fonction était tuée en plein travail, le checkpoint n'était jamais
 * écrit, et tout le chunk était perdu — le run restant `running` vingt minutes.
 *
 * Deux frontières, deux tests. Chacun tient l'INVARIANT qui compte : on ne part pas
 * dans ce qu'on ne peut pas finir, ET on avance toujours d'au moins un pas (sans
 * quoi un chunk court se re-queuerait indéfiniment sans rien faire — le zombie que
 * MIN-213 vient de fermer).
 *
 * On ne moque QUE `fetch` : le parsing SSE et la boucle sont le vrai chemin.
 */

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
    usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, cost: 0.01 },
  });
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Round texte (fin de tour naturelle). */
function sseText(text: string): string {
  return sse([{ delta: { content: text } }, { delta: {}, finish_reason: "stop" }]);
}

/** Round portant N tool-calls, dans l'ordre. */
function sseToolCalls(calls: Array<{ id: string; name: string; args: unknown }>): string {
  return sse([
    {
      delta: {
        tool_calls: calls.map((c, index) => ({
          index,
          id: c.id,
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      },
    },
    { delta: {}, finish_reason: "stop" },
  ]);
}

/** Réponse d'erreur REPRENABLE du provider (429). */
function rateLimited(): Response {
  return new Response("rate limited", { status: 429 });
}

let responses: Array<() => Response>;
let fetchCalls: number;

beforeEach(() => {
  responses = [];
  fetchCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
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

describe("reprise d'un appel modèle en fin de fenêtre", () => {
  it("ne retente PAS quand il ne reste pas de quoi finir la tentative", async () => {
    // Le chunk a moins devant lui que ce que coûte un essai muet : dormir puis
    // relancer, c'est repartir pour un appel qu'on ne verra pas revenir.
    responses = [rateLimited];
    const { events, emit } = collectEvents();

    const result = await runAgentLoop({
      ...baseParams,
      softDeadlineMs: MIN_STREAM_ATTEMPT_MS - 10_000,
      messages: seed(),
      emit,
    });

    // UN seul appel : la garde a relevé au lieu de dormir.
    expect(fetchCalls).toBe(1);
    // Sortie propre — l'appelant persiste le checkpoint et re-queue sur une
    // fonction fraîche, au lieu de se faire tuer avec le chunk entier.
    expect(result.status).toBe("suspended");
    expect(events.some((e) => e.type === "status" && e.payload.phase === "transient_error")).toBe(
      true,
    );
  });

  it("retente normalement tant que le chunk a de quoi finir l'essai", async () => {
    responses = [rateLimited, () => new Response(sseText("Fixed."))];

    const result = await runAgentLoop({ ...baseParams, messages: seed() });

    expect(fetchCalls).toBe(2);
    expect(result.status).toBe("completed");
    expect(result.reply).toBe("Fixed.");
  });
});

describe("frontière entre deux tool-calls", () => {
  it("suspend au lieu d'enchaîner, et répond quand même aux appels sautés", async () => {
    responses = [
      () =>
        new Response(
          sseToolCalls([
            { id: "call_1", name: "run_command", args: { command: "npm test" } },
            { id: "call_2", name: "run_command", args: { command: "npm run build" } },
            { id: "call_3", name: "run_command", args: { command: "git status" } },
          ]),
        ),
    ];
    const { events, emit } = collectEvents();
    // Le premier appel mange tout le budget du chunk — exactement le round entamé
    // juste avant la soft-deadline.
    const execTool = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 60));
      return { result: { exit_code: 0 }, success: true };
    });

    const result = await runAgentLoop({
      ...baseParams,
      softDeadlineMs: 50,
      messages: seed(),
      execTool,
      emit,
    });

    // Le round a AVANCÉ d'un pas (invariant anti-zombie), et s'est arrêté là.
    expect(execTool).toHaveBeenCalledTimes(1);
    expect(execTool).toHaveBeenCalledWith("run_command", { command: "npm test" }, "call_1");
    expect(result.status).toBe("suspended");

    // Appariement INTACT : les trois appels ont leur réponse dans le checkpoint.
    // Sans ça, le chunk suivant repartirait sur un historique que le provider refuse.
    const replies = result.messages.filter((m) => m.role === "tool");
    expect(replies.map((m) => m.tool_call_id)).toEqual(["call_1", "call_2", "call_3"]);
    // Et les sautés le DISENT : « pas exécuté » ≠ « exécuté et raté ».
    expect(String(replies[1].content)).toContain("not executed");
    expect(String(replies[2].content)).toContain("not executed");
    expect(String(replies[0].content)).not.toContain("not executed");
    // Trace mesurable sur agent_run_events.
    const skipped = events.filter(
      (e) => e.type === "tool_result" && e.payload.reason === "turn_suspended",
    );
    expect(skipped).toHaveLength(2);
  });

  it("joue le round entier quand le budget tient", async () => {
    responses = [
      () =>
        new Response(
          sseToolCalls([
            { id: "call_1", name: "run_command", args: { command: "npm test" } },
            { id: "call_2", name: "run_command", args: { command: "npm run build" } },
          ]),
        ),
      () => new Response(sseText("Both green.")),
    ];
    const execTool = vi.fn(async () => ({ result: { exit_code: 0 }, success: true }));

    const result = await runAgentLoop({ ...baseParams, messages: seed(), execTool });

    expect(execTool).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("completed");
    expect(result.reply).toBe("Both green.");
  });
});
