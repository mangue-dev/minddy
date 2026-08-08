import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";
import { ToolLoopDetector, toolCallSignature } from "./tool-loop";

/**
 * MIN-243 — ce qui coupe un modèle coincé.
 *
 * Le point de design tient en une phrase : LE RÉSULTAT EST DANS LA SIGNATURE.
 * Les deux premiers tests de la seconde section sont la paire qui le vérifie —
 * même tool, mêmes arguments, et c'est le résultat qui décide si c'est un
 * balayage légitime ou une boucle.
 *
 * Comme `tool-args.test.ts`, on ne moque QUE `fetch` : le streaming SSE, le
 * routage des tools et la construction des messages sont le vrai chemin.
 */

describe("ToolLoopDetector", () => {
  const detector = () => new ToolLoopDetector();

  it("coupe à la 4e occurrence identique, pas avant", () => {
    const d = detector();
    const call = () => d.record("read_file", { path: "a.ts" }, { content: "x" });
    expect(call()).toBe(false);
    expect(call()).toBe(false);
    expect(call()).toBe(false);
    expect(call()).toBe(true);
  });

  it("ne coupe PAS quand le résultat change — relire un fichier qu'on vient de modifier", () => {
    const d = detector();
    for (let i = 0; i < 8; i++) {
      expect(d.record("read_file", { path: "a.ts" }, { content: `version ${i}` })).toBe(false);
    }
  });

  it("distingue deux pages du même fichier — les arguments COMPLETS entrent dans la signature", () => {
    // Le résumé du fil (`toolArgSummary`) ne garde de `read_file` que `path` :
    // un balayage séquentiel y est indiscernable d'une boucle. Ici, non.
    const d = detector();
    for (const offset of [0, 100, 200, 300, 400, 500]) {
      expect(d.record("read_file", { path: "a.ts", offset }, { content: "…" })).toBe(false);
    }
  });

  it("oublie ce qui sort de la fenêtre de 10", () => {
    const d = detector();
    // 3 fois le même appel, puis 8 appels distincts : les trois premiers sont
    // sortis de la fenêtre, la répétition suivante repart de zéro.
    for (let i = 0; i < 3; i++) d.record("grep", { pattern: "foo" }, { matches: 0 });
    for (let i = 0; i < 8; i++) d.record("read_file", { path: `f${i}.ts` }, { content: "x" });
    expect(d.record("grep", { pattern: "foo" }, { matches: 0 })).toBe(false);
  });

  it("compte deux tools différents séparément", () => {
    const d = detector();
    for (let i = 0; i < 3; i++) {
      expect(d.record("read_file", { path: "a.ts" }, { content: "x" })).toBe(false);
      expect(d.record("list_dir", { path: "." }, { entries: [] })).toBe(false);
    }
  });

  it("signe à l'identique deux appels dont les clés d'arguments sont dans un autre ordre", () => {
    expect(toolCallSignature("grep", { pattern: "a", path: "lib" }, { n: 1 })).toBe(
      toolCallSignature("grep", { path: "lib", pattern: "a" }, { n: 1 }),
    );
  });
});

interface StreamToolCall {
  index: number;
  id: string;
  function: { name: string; arguments: string };
}

/** Corps SSE d'un round qui rend des tool-calls, puis l'usage. */
function sseToolCalls(...calls: StreamToolCall[]): string {
  const chunks = [
    { id: "gen_1", model: "test/model", choices: [{ delta: { tool_calls: calls } }] },
    {
      id: "gen_1",
      model: "test/model",
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, cost: 0.01 },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Corps SSE d'un round texte (fin de tour). */
function sseText(text: string): string {
  const chunks = [
    { id: "gen_2", model: "test/model", choices: [{ delta: { content: text } }] },
    {
      id: "gen_2",
      model: "test/model",
      choices: [{ delta: {} }],
      usage: { prompt_tokens: 1100, completion_tokens: 10, total_tokens: 1110, cost: 0.01 },
    },
  ];
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

let responses: Array<() => Response>;

beforeEach(() => {
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
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
  recordUsage: async () => {},
  softDeadlineMs: 250_000,
  emit: async () => {},
};

function seed(): AgentChatMessage[] {
  return [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Fix the board." },
  ];
}

/** Un round = une lecture du même fichier. Dix rounds de rab, jamais atteints. */
function readSameFile(n: number): Array<() => Response> {
  return Array.from(
    { length: n },
    (_, i) => () =>
      new Response(
        sseToolCalls({
          index: 0,
          id: `call_${i}`,
          function: { name: "read_file", arguments: JSON.stringify({ path: "components/global-board.tsx" }) },
        }),
      ),
  );
}

describe("le tour coincé s'arrête avant le budget", () => {
  it("coupe au 4e appel identique, et le dit dans le fil", async () => {
    responses = [...readSameFile(10), () => new Response(sseText("Done."))];
    const execTool = vi.fn(async () => ({ result: { content: "export function Board() {}" }, success: true }));

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      execTool,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    // 1. LE point du ticket : quatre appels joués, pas dix. Ce qui coupe n'est
    //    plus le budget.
    expect(execTool).toHaveBeenCalledTimes(4);
    expect(result.rounds).toBe(4);

    // 2. Repos REPRENABLE (chemin de `replyIncomplete`) : le checkpoint part avec
    //    les messages, et il n'y a pas de `summary` mensonger.
    expect(result.status).toBe("error");
    expect(events.some((e) => e.type === "summary")).toBe(false);

    // 3. La coupure est DITE, et étiquetée pour être comptable sur agent_run_events.
    const error = events.find((e) => e.type === "error")!;
    expect(error.payload.code).toBe("toolLoop");
    expect(error.payload.name).toBe("read_file");

    // 4. Jamais une question : rien n'attend un humain (une routine tourne à 3 h).
    expect(events.some((e) => e.type === "question")).toBe(false);
    expect(result.askedUser).toBeUndefined();

    // 5. Appariement intact : chaque tool-call du dernier round a sa réponse —
    //    sans quoi le checkpoint repartirait sur un historique refusé.
    const callIds = result.messages.flatMap((m) => (m.tool_calls ?? []).map((c) => c.id));
    const answered = result.messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id);
    expect(answered).toEqual(callIds);
  });

  it("laisse tourner le même appel quand le résultat CHANGE", async () => {
    // Même fichier, mêmes arguments : c'est un modèle qui relit ce qu'il vient
    // d'éditer. Une signature sur les seuls args l'aurait coupé.
    responses = [...readSameFile(6), () => new Response(sseText("Done."))];
    let n = 0;
    const execTool = vi.fn(async () => ({ result: { content: `revision ${n++}` }, success: true }));

    const result = await runAgentLoop({ ...baseParams, messages: seed(), execTool });

    expect(execTool).toHaveBeenCalledTimes(6);
    expect(result.status).toBe("completed");
    expect(result.reply).toBe("Done.");
  });

  it("coupe aussi sur le fast-path parallèle des tools read-only", async () => {
    // Un round de 4 lectures identiques : les quatre se jouent en parallèle, la
    // coupure attend que toutes aient leur réponse.
    responses = [
      () =>
        new Response(
          sseToolCalls(
            ...Array.from({ length: 4 }, (_, i) => ({
              index: i,
              id: `call_${i}`,
              function: { name: "read_file", arguments: JSON.stringify({ path: "a.ts" }) },
            })),
          ),
        ),
      () => new Response(sseText("Done.")),
    ];
    const execTool = vi.fn(async () => ({ result: { content: "same" }, success: true }));

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      execTool,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    expect(result.status).toBe("error");
    expect(events.find((e) => e.type === "error")!.payload.code).toBe("toolLoop");
    // Les quatre appels du round ont leur réponse malgré la coupure.
    expect(result.messages.filter((m) => m.role === "tool")).toHaveLength(4);
  });
});
