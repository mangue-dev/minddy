import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared embeddings transport (MIN-717): the feedback board keeps its
 * fixed 1536-dimension contract, while the issue index lets the model answer
 * at its native size — some embedding models refuse the parameter outright.
 */

const h = vi.hoisted(() => ({ bodies: [] as Record<string, unknown>[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai-runtime", () => ({
  resolveAiRuntime: async () => ({ apiKey: "k", mode: "byok", provider: "openai",
    baseUrl: "https://api.openai.com/v1", model: "text-embedding-ada-002" }),
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
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(size).fill(0.5) }] }), { status: 200 });
  },
}));

import { embedTexts, requestEmbeddings } from "./embeddings";

beforeEach(() => { h.bodies = []; });

describe("requestEmbeddings", () => {
  it("omits the dimensions parameter for the issue index and keeps the native size", async () => {
    const batch = await requestEmbeddings(["text"], {
      modelKey: "issue_embedding_model", surface: "automations", feature: "issue_embedding",
      billedUserId: "u1", dimensions: "any", xTitle: "test",
    });
    expect(h.bodies[0]).not.toHaveProperty("dimensions");
    expect(batch?.vectors[0]).toHaveLength(4);
  });

  it("keeps the fixed 1536-dimension request of the feedback board", async () => {
    const [vector] = await embedTexts(["text"], { record: { billTo: { userId: "u1" } } });
    expect(h.bodies[0]).toMatchObject({ dimensions: 1536 });
    expect(vector).toHaveLength(1536);
  });
});
