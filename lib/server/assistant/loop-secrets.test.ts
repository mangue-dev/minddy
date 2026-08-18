import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

/**
 * MIN-343 — A LIVE IDENTIFIER DOES NOT WRITE ANYWHERE.
 *
 * A freshly created `mdy_` key and the SSO secret of a board are the two
 * only values ​​that a Numo tool returns and which opens something. They
 * were written as is in `assistant_messages.content`: replayed to the
 * provider on each subsequent turn, rereadable in base, and distributed again in
 * account export.
 *
 * What this test pinpoints is the border, not the substitution (this has its
 * test in `agent/redact.test.ts`): the COMPLETE result goes to the browser,
 * live, once — and everything that remains after it is substituted.
 *
 * We only mock what COMES OUT of the process: the supplier and the base.
 */

const KEY = "mdy_QXBpS2V5U2VjcmV0MTIzNDU2Nzg5MA";

const executeTool = vi.fn();
vi.mock("./execute-tool", () => ({
  executeTool: (...args: unknown[]) => executeTool(...args),
}));

const fetchOpenRouter = vi.fn();
vi.mock("@/lib/server/model-config", () => ({
  fetchOpenRouterWithSuffixFallback: (...args: unknown[]) => fetchOpenRouter(...args),
}));

import type { ChatMessage } from "./loop";

const { processChat } = await import("./loop");

/** An OpenRouter SSE stream, as the loop reads it. */
function stream(chunks: Record<string, unknown>[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const TOOL_ROUND = [
  {
    id: "gen-1",
    model: "m",
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call-1",
              function: { name: "create_integration", arguments: '{"name":"App"}' },
            },
          ],
        },
      },
    ],
  },
];

const TEXT_ROUND = [
  {
    id: "gen-2",
    model: "m",
    choices: [{ delta: { content: "La clé est affichée ci-dessus." } }],
  },
];

function fakeService() {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({ single: async () => ({ data: { id: "msg-1" } }) }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  // `insert` is sometimes called with `.select().single()`, sometimes alone (await
  // direct): the form above is thenable-compatible via the rendered object.
  return { client, inserted };
}

/**
 * The net is only valid if the tool DECLARE what it renders alive. Lexical, like
 * `redaction-invariant.test.ts`: the two paths require a supplier, a base and a project, and what we want to pin fits in a source line.
 */
describe("les tools qui rendent un identifiant le déclarent", () => {
  const source = readFileSync(join(__dirname, "execute-tool.ts"), "utf8");

  it("la clé d'intégration", () => {
    expect(source).toContain("secrets: [result.key]");
  });

  it("le secret SSO du board", () => {
    expect(source).toContain(
      "secrets: result.sso_secret ? [result.sso_secret] : undefined"
    );
  });
});

describe("la clé fraîche ne survit qu'à l'écran", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    executeTool.mockResolvedValue({
      result: {
        integration: { id: "int-1", name: "App", kind: "issues" },
        key: KEY,
        usage: { note: `Authorization: Bearer ${KEY}` },
      },
      secrets: [KEY],
      success: true,
    });
    fetchOpenRouter
      .mockResolvedValueOnce({ response: stream(TOOL_ROUND), model: "m" })
      .mockResolvedValueOnce({ response: stream(TEXT_ROUND), model: "m" });
  });

  it("part au navigateur en clair, et nulle part ailleurs", async () => {
    const events: { type: string; payload: unknown }[] = [];
    const service = fakeService();
    const messages: ChatMessage[] = [{ role: "user", content: "crée une clé" }];

    await processChat(
      messages,
      [],
      { emit: (type: string, payload: unknown) => events.push({ type, payload }) } as never,
      {
        model: "m",
        conversationId: "conv-1",
        projectId: "p1",
        userId: "u1",
        supabase: service.client,
        service: service.client,
        locale: "fr",
      }
    );

    // 1. THE SCREEN: the complete result, the key readable, once.
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(JSON.stringify(toolResult?.payload)).toContain(KEY);

    // 2. THE BASIS: nothing. Neither in the content of the message, nor in its metadata.
    const persisted = JSON.stringify(service.inserted);
    expect(persisted).not.toContain(KEY);
    expect(persisted).toContain("[redacted]");

    // 3. THE MODEL: nothing either — this is what prevents replay each time
    // next round, and copying the key into a response.
    expect(JSON.stringify(messages)).not.toContain(KEY);
    expect(JSON.stringify(messages)).toContain("[redacted]");
  });

  it("substitue partout dans le résultat, pas seulement au premier niveau", async () => {
    const events: { type: string; payload: unknown }[] = [];
    const service = fakeService();
    const messages: ChatMessage[] = [{ role: "user", content: "crée une clé" }];

    await processChat(
      messages,
      [],
      { emit: (type: string, payload: unknown) => events.push({ type, payload }) } as never,
      {
        model: "m",
        conversationId: "conv-1",
        projectId: "p1",
        userId: "u1",
        supabase: service.client,
        service: service.client,
        locale: "fr",
      }
    );

    // The key appeared TWICE in the result: bare, and in the middle of
    // the example header that the integration contract carries.
    const toolMessage = service.inserted.find((r) => r.role === "tool");
    expect(String(toolMessage?.content)).toContain(
      "Authorization: Bearer [redacted]"
    );
  });
});
