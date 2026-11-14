import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared embeddings transport (MIN-717): the feedback board keeps its
 * fixed 1536-dimension contract, while the issue index lets the model answer
 * at its native size — some embedding models refuse the parameter outright.
 */

const h = vi.hoisted(() => ({ bodies: [] as Record<string, unknown>[], model: "text-embedding-ada-002" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai-runtime", () => ({
  resolveAiRuntime: async () => ({ apiKey: "k", mode: "byok", provider: "openai",
    baseUrl: "https://api.openai.com/v1", model: h.model }),
}));
vi.mock("@/lib/server/ai-usage", () => ({
  recordAiUsage: async () => {},
  newRunId: () => "run",
  parseOpenRouterUsage: () => ({ promptTokens: 1, completionTokens: 0, totalTokens: 1, cost: null }),
}));
vi.mock("@/lib/server/usage", () => ({ ownerHasUsageBudget: async () => true }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/ai-provider-request", () => ({
  fetchAiProvider: async (_provider: string, _url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    h.bodies.push(body);
    const size = typeof body.dimensions === "number" ? body.dimensions : 4;
    const input = body.input as string[];
    return new Response(JSON.stringify({
      data: input.map((_, index) => ({ index, embedding: Array(size).fill(0.5) })),
    }), { status: 200 });
  },
}));

import { embedTexts, requestEmbeddings } from "./embeddings";

beforeEach(() => { h.bodies = []; h.model = "text-embedding-ada-002"; });

describe("requestEmbeddings", () => {
  it("omits the dimensions parameter for the issue index and keeps the native size", async () => {
    const batch = await requestEmbeddings(["text"], {
      modelKey: "issue_embedding_model", surface: "automations", feature: "issue_embedding",
      billedUserId: "u1", dimensions: "any", xTitle: "test",
    });
    expect(h.bodies[0]).not.toHaveProperty("dimensions");
    expect(batch?.vectors[0]).toHaveLength(4);
  });

  it("does not send dimensions to ada-002, which refuses the parameter", async () => {
    const [vector] = await embedTexts(["text"], { record: { billTo: { userId: "u1" } } });
    expect(h.bodies[0]).not.toHaveProperty("dimensions");
    expect(h.bodies[0]).not.toHaveProperty("usage");
    expect(vector).toBeNull();
  });

  it("keeps the fixed 1536-dimension request of the feedback board", async () => {
    h.model = "text-embedding-3-small";
    const [vector] = await embedTexts(["text"], { record: { billTo: { userId: "u1" } } });
    expect(h.bodies[0]).toMatchObject({ dimensions: 1536 });
    expect(vector).toHaveLength(1536);
  });

  it("splits a long batch into bounded requests and keeps each text's position", async () => {
    const texts = Array.from({ length: 70 }, (_, i) => `text ${i}`);
    const batch = await requestEmbeddings(texts, {
      modelKey: "issue_embedding_model", surface: "automations", feature: "issue_embedding",
      billedUserId: "u1", dimensions: "any", xTitle: "test",
    });
    expect(h.bodies.map((body) => (body.input as string[]).length)).toEqual([32, 32, 6]);
    expect(batch?.vectors).toHaveLength(70);
    expect(batch?.vectors.every((vector) => vector?.length === 4)).toBe(true);
  });
});
