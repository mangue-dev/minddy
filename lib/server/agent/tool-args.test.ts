import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La BOUCLE écrit par `params.recordUsage` depuis MIN-224 (le puits ci-dessous) ;
// ce mock-ci ne garde plus qu'elle : le reste du graphe, qui l'appelle encore.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";

/**
 * MIN-204, dans la boucle : des `arguments` de tool-call illisibles ne doivent
 * JAMAIS devenir `{}`. Le silence coûtait cher — `run_command` lançait alors
 * `sh -c ""`, qui rend exit 0 et une sortie vide : le fil montrait un ✓, le
 * modèle en concluait que les tests passaient, le tour se terminait et le
 * harness commitait sans que rien n'ait tourné.
 *
 * Comme `image-path.test.ts`, on ne moque QUE `fetch` : le streaming SSE, le
 * routage des tools et la construction des messages sont le vrai chemin.
 */

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
  // Le ledger est INJECTÉ depuis MIN-224 : la boucle ne connaît plus le chemin de
  // la base. Ici, un puits — ce test ne mesure pas la dépense.
  recordUsage: async () => {},
  softDeadlineMs: 250_000,
  emit: async () => {},
};

function seed(): AgentChatMessage[] {
  return [
    { role: "system", content: "You are numo." },
    { role: "user", content: "Run the test suite." },
  ];
}

/** JSON tronqué en vol : la forme exacte d'un round coupé au plafond de tokens. */
const TRUNCATED = '{"command": "npm test --run lib/serv';

describe("arguments de tool-call illisibles", () => {
  it("ne lance PAS le tool et rend l'échec au modèle", async () => {
    responses = [
      () => new Response(sseToolCalls({ index: 0, id: "call_1", function: { name: "run_command", arguments: TRUNCATED } })),
      () => new Response(sseText("Done.")),
    ];
    const execTool = vi.fn(async () => ({ result: { stdout: "", exit_code: 0 }, success: true }));

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      execTool,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
    });

    // 1. LE point du ticket : le Sandbox n'est jamais atteint.
    expect(execTool).not.toHaveBeenCalled();

    // 2. Le tool-call garde sa réponse (l'appariement du checkpoint reste intact),
    //    et cette réponse DIT l'échec — au lieu d'une sortie vide qui se lit ✓.
    const toolMsg = result.messages.find((m) => m.role === "tool")!;
    expect(toolMsg.tool_call_id).toBe("call_1");
    expect(String(toolMsg.content)).toContain("failed to parse function arguments");

    // 3. Le fil montre un appel EN ÉCHEC : `tool_call` (sans lui, le feed n'a rien
    //    à quoi rattacher le résultat) puis `tool_result` en `success: false`.
    const call = events.find((e) => e.type === "tool_call")!;
    expect(call.payload.id).toBe("call_1");
    const toolResult = events.find((e) => e.type === "tool_result")!;
    expect(toolResult.payload.success).toBe(false);
    expect(String(toolResult.payload.preview)).toContain("failed to parse function arguments");

    // 4. Le tour continue : le modèle a la main pour réémettre l'appel.
    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(2);
  });

  it("laisse le modèle réémettre l'appel au round suivant", async () => {
    responses = [
      () => new Response(sseToolCalls({ index: 0, id: "call_1", function: { name: "run_command", arguments: TRUNCATED } })),
      () =>
        new Response(
          sseToolCalls({
            index: 0,
            id: "call_2",
            function: { name: "run_command", arguments: JSON.stringify({ command: "npm test" }) },
          }),
        ),
      () => new Response(sseText("Tests pass.")),
    ];
    const execTool = vi.fn(async () => ({ result: { stdout: "12 passed", exit_code: 0 }, success: true }));

    const result = await runAgentLoop({ ...baseParams, messages: seed(), execTool });

    expect(execTool).toHaveBeenCalledTimes(1);
    expect(execTool).toHaveBeenCalledWith("run_command", { command: "npm test" }, "call_2");
    expect(result.reply).toBe("Tests pass.");
  });

  it("court-circuite AUSSI le fast-path parallèle, sans décaler les réponses", async () => {
    responses = [
      () =>
        new Response(
          sseToolCalls(
            { index: 0, id: "call_a", function: { name: "read_file", arguments: JSON.stringify({ path: "a.ts" }) } },
            { index: 1, id: "call_b", function: { name: "read_file", arguments: '{"path": "b.t' } },
            { index: 2, id: "call_c", function: { name: "read_file", arguments: JSON.stringify({ path: "c.ts" }) } },
          ),
        ),
      () => new Response(sseText("Read them.")),
    ];
    const execTool = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      result: { content: `contenu de ${String(args.path)}` },
      success: true,
    }));

    const result = await runAgentLoop({ ...baseParams, messages: seed(), execTool });

    // Seuls les deux appels lisibles atteignent le Sandbox…
    expect(execTool).toHaveBeenCalledTimes(2);
    // …et les trois réponses restent dans l'ordre d'origine, chacune sur son id.
    const toolMsgs = result.messages.filter((m) => m.role === "tool");
    expect(toolMsgs.map((m) => m.tool_call_id)).toEqual(["call_a", "call_b", "call_c"]);
    expect(String(toolMsgs[0].content)).toContain("a.ts");
    expect(String(toolMsgs[1].content)).toContain("failed to parse function arguments");
    expect(String(toolMsgs[2].content)).toContain("c.ts");
  });

  it("refuse un tableau JSON — `args.command` y serait le même `undefined` silencieux", async () => {
    responses = [
      () => new Response(sseToolCalls({ index: 0, id: "call_1", function: { name: "run_command", arguments: '["npm test"]' } })),
      () => new Response(sseText("Done.")),
    ];
    const execTool = vi.fn(async () => ({ result: {}, success: true }));

    const result = await runAgentLoop({ ...baseParams, messages: seed(), execTool });

    expect(execTool).not.toHaveBeenCalled();
    expect(String(result.messages.find((m) => m.role === "tool")!.content)).toContain(
      "failed to parse function arguments",
    );
  });

  it("laisse passer un `arguments` VIDE : c'est la forme d'un tool sans paramètre", async () => {
    responses = [
      () => new Response(sseToolCalls({ index: 0, id: "call_1", function: { name: "list_agents", arguments: "" } })),
      () => new Response(sseText("None running.")),
    ];
    const execTool = vi.fn(async () => ({ result: { agents: [] }, success: true }));

    await runAgentLoop({ ...baseParams, messages: seed(), execTool });

    expect(execTool).toHaveBeenCalledWith("list_agents", {}, "call_1");
  });

  it("court-circuite les tools de CONTRÔLE aussi : un `update_plan` tronqué n'écrase pas le plan", async () => {
    responses = [
      () => new Response(sseToolCalls({ index: 0, id: "call_1", function: { name: "update_plan", arguments: '{"plan": [{"ste' } })),
      () => new Response(sseText("Done.")),
    ];
    const syncPlan = vi.fn(async () => {});

    const events: Array<{ type: string }> = [];
    const result = await runAgentLoop({
      ...baseParams,
      messages: seed(),
      execTool: async () => ({ result: {}, success: true }),
      syncPlan,
      emit: async (type) => {
        events.push({ type });
      },
    });

    expect(syncPlan).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "plan_update")).toBe(false);
    expect(String(result.messages.find((m) => m.role === "tool")!.content)).toContain(
      "failed to parse function arguments",
    );
  });
});
