import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `recordAiUsage` écrit en base (service client) : neutralisé, le reste est réel.
vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async () => {}),
}));

import { runAgentLoop, type AgentChatMessage } from "./agent-loop";
import { imageCount, textOf } from "./content";
import { TOOL_RESULT_MAX_CHARS } from "./prune";

/**
 * MIN-111, bout en bout dans la boucle : un tool qui renvoie une image doit
 * produire un message `role:"tool"` MULTIPART, et cette image doit arriver ENTIÈRE
 * dans le corps envoyé au provider. Le piège précis qu'on garde ici : les octets
 * de l'image ne doivent pas traverser `headTail`, qui élide le milieu — une data
 * URL coupée en deux ne se voit qu'à l'erreur du provider, jamais dans les logs.
 *
 * Comme `compact-path.test.ts`, on ne moque QUE `fetch` : streaming SSE, exécution
 * des tools et construction des messages sont le vrai chemin.
 */

/** Data URL nettement plus longue que le cap de troncature des résultats. */
const DATA_URL = `data:image/png;base64,${"Q".repeat(TOOL_RESULT_MAX_CHARS * 3)}`;

/** Corps SSE d'un round : un tool-call `read_attachment`, puis l'usage. */
function sseToolCall(id: string): string {
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
                function: { name: "read_attachment", arguments: JSON.stringify({ attachment_id: "att-1" }) },
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

interface SentBody {
  messages: Array<{ role: string; content?: unknown; tool_call_id?: string }>;
}

let sent: SentBody[] = [];
let responses: Array<() => Response>;

beforeEach(() => {
  sent = [];
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as SentBody);
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
  softDeadlineMs: 250_000,
  emit: async () => {},
};

/** Le résultat que renvoie `read_attachment` sur une maquette (cf. issue-tools.ts). */
const attachmentOutcome = {
  result: { id: "att-1", file_name: "mockup.png", mime_type: "image/png", image: "attached" },
  success: true,
  images: [{ url: DATA_URL, name: "mockup.png" }],
};

describe("une image renvoyée par un tool traverse la boucle", () => {
  it("devient un message tool multipart, image INTACTE dans le corps envoyé", async () => {
    const messages: AgentChatMessage[] = [
      { role: "system", content: "You are numo." },
      { role: "user", content: "Look at the mockup." },
    ];
    responses = [() => new Response(sseToolCall("call_1")), () => new Response(sseText("Two columns."))];

    const result = await runAgentLoop({
      ...baseParams,
      messages,
      execTool: async () => attachmentOutcome,
    });

    expect(result.status).toBe("completed");

    // 1. L'historique-checkpoint porte l'image, à côté du JSON du résultat.
    const toolMsg = result.messages.find((m) => m.role === "tool")!;
    expect(imageCount(toolMsg.content)).toBe(1);
    expect(textOf(toolMsg.content)).toContain("mockup.png");
    expect(textOf(toolMsg.content)).not.toContain("elided"); // le JSON tient sous le cap

    // 2. LE point du ticket : le corps du round suivant porte la data URL ENTIÈRE.
    const secondCall = sent[1];
    const sentTool = secondCall.messages.find((m) => m.role === "tool")!;
    const parts = sentTool.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(Array.isArray(parts)).toBe(true);
    const image = parts.find((p) => p.type === "image_url")!;
    expect(image.image_url!.url).toBe(DATA_URL);
    expect(image.image_url!.url).not.toContain("elided");
  });

  it("laisse le résultat en simple chaîne quand le tool ne renvoie pas d'image", async () => {
    const messages: AgentChatMessage[] = [
      { role: "system", content: "You are numo." },
      { role: "user", content: "Read the spec." },
    ];
    responses = [() => new Response(sseToolCall("call_1")), () => new Response(sseText("Read it."))];

    const result = await runAgentLoop({
      ...baseParams,
      messages,
      execTool: async () => ({ result: { file_name: "spec.md", content: "hello" }, success: true }),
    });

    const toolMsg = result.messages.find((m) => m.role === "tool")!;
    expect(typeof toolMsg.content).toBe("string");
    expect(toolMsg.content).toContain("spec.md");
  });

  it("garde l'image hors des events : un preview ne porte jamais de base64", async () => {
    const messages: AgentChatMessage[] = [
      { role: "system", content: "You are numo." },
      { role: "user", content: "Look at the mockup." },
    ];
    responses = [() => new Response(sseToolCall("call_1")), () => new Response(sseText("Two columns."))];

    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    await runAgentLoop({
      ...baseParams,
      messages,
      emit: async (type, payload) => {
        events.push({ type, payload });
      },
      execTool: async () => attachmentOutcome,
    });

    const toolResult = events.find((e) => e.type === "tool_result")!;
    expect(String(toolResult.payload.preview)).toContain("mockup.png");
    expect(String(toolResult.payload.preview)).not.toContain("QQQ");
  });
});
