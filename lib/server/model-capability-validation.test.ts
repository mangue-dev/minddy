import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/agent/models-catalog", () => ({ getPlatformModelCatalog: vi.fn() }));

import { validateCatalogCapabilityChoice } from "./model-capability-validation";

const catalog = async () => [
  { id: "openai/text-embedding-3-small", name: "Embedding small" },
  { id: "google/gemini-embedding-001", name: "Gemini embedding" },
];

describe("validateCatalogCapabilityChoice", () => {
  it("accepts an embedding model of the catalog, routing suffix included", async () => {
    await expect(validateCatalogCapabilityChoice("openai/text-embedding-3-small:floor", "embedding", catalog as never))
      .resolves.toEqual({ ok: true, verified: true });
  });

  it("refuses a chat model in an embedding field", async () => {
    await expect(validateCatalogCapabilityChoice("deepseek/deepseek-v4-flash", "embedding", catalog as never))
      .resolves.toEqual({ ok: false, code: "capability_mismatch" });
  });

  it("does not lock the setting when the catalog cannot be read", async () => {
    await expect(validateCatalogCapabilityChoice("anything", "embedding", (async () => []) as never))
      .resolves.toEqual({ ok: true, verified: false });
    await expect(validateCatalogCapabilityChoice("anything", "embedding",
      (async () => { throw new Error("down"); }) as never))
      .resolves.toEqual({ ok: true, verified: false });
  });
});
