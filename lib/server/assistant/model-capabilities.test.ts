import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetchIndex: vi.fn() }));
vi.mock("@/lib/server/ai-provider-request", () => ({ fetchAiProviderBytes: h.fetchIndex }));
vi.mock("./execute-tool", () => ({ executeTool: vi.fn() }));

const payload = {
  data: [
    { id: "vendor/model", architecture: { input_modalities: ["text", "image", "file"] },
      pricing: { input_cache_read: "0.000001" } },
    { id: "vendor/model:free", architecture: { input_modalities: ["text"] } },
  ],
};
const response = () => ({ ok: true, bytes: Buffer.from(JSON.stringify(payload)) });

async function freshCapabilities() {
  vi.resetModules();
  h.fetchIndex.mockReset();
  return { ...await import("./loop"), ...await import("../agent/openrouter-index") };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Numo model capabilities", () => {
  it("does not wait for a cold catalog to decide optional prompt-cache hints", async () => {
    const { modelSupportsCaching, loadOpenRouterIndex } = await freshCapabilities();
    let release!: () => void;
    h.fetchIndex.mockReturnValue(new Promise((resolve) => {
      release = () => resolve(response());
    }));
    try {
      const hints = await Promise.race([
        modelSupportsCaching("vendor/model", "key"),
        new Promise((resolve) => setImmediate(() => resolve("blocked"))),
      ]);
      expect(hints).toBe(false);
      expect(h.fetchIndex).toHaveBeenCalledOnce();
    } finally {
      release();
      await loadOpenRouterIndex("key");
    }
    expect(await modelSupportsCaching("vendor/model:nitro", "key")).toBe(true);
    expect(await modelSupportsCaching("vendor/model:free", "key")).toBe(false);
    expect(h.fetchIndex).toHaveBeenCalledOnce();
  });

  it("reuses metadata loaded by model validation without downloading another catalog", async () => {
    const { modelSupportsCaching, getModelInputModalities, getOpenRouterModelInfo } = await freshCapabilities();
    h.fetchIndex.mockResolvedValue(response());
    await getOpenRouterModelInfo("vendor/model", "key");
    expect(await modelSupportsCaching("vendor/model", "key")).toBe(true);
    expect(await getModelInputModalities("vendor/model:nitro", "key"))
      .toEqual(new Set(["text", "image", "file"]));
    expect(await getModelInputModalities("vendor/model:free", "key"))
      .toEqual(new Set(["text"]));
    expect(h.fetchIndex).toHaveBeenCalledOnce();
  });

  it("waits for authoritative attachment capabilities while text hints remain immediate", async () => {
    const { modelSupportsCaching, getModelInputModalities } = await freshCapabilities();
    let release!: () => void;
    h.fetchIndex.mockReturnValue(new Promise((resolve) => {
      release = () => resolve(response());
    }));
    const modalities = getModelInputModalities("vendor/model", "key");
    let resolved = false;
    void modalities.then(() => { resolved = true; });
    expect(await modelSupportsCaching("vendor/model", "key")).toBe(false);
    expect(resolved).toBe(false);
    release();
    expect(await modalities).toEqual(new Set(["text", "image", "file"]));
    expect(h.fetchIndex).toHaveBeenCalledOnce();
  });

  it("serves stale hints immediately while sharing one catalog refresh", async () => {
    const { modelSupportsCaching, loadOpenRouterIndex } = await freshCapabilities();
    vi.useFakeTimers();
    h.fetchIndex.mockResolvedValueOnce(response());
    await loadOpenRouterIndex("key");
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    let release!: () => void;
    h.fetchIndex.mockReturnValue(new Promise((resolve) => {
      release = () => resolve(response());
    }));
    try {
      expect(await modelSupportsCaching("vendor/model", "key")).toBe(true);
      expect(await modelSupportsCaching("vendor/model:nitro", "key")).toBe(true);
      expect(h.fetchIndex).toHaveBeenCalledTimes(2);
    } finally {
      release();
      await loadOpenRouterIndex("key");
    }
  });

  it("falls back to text without blocking hints when the provider catalog fails", async () => {
    const { modelSupportsCaching, getModelInputModalities, loadOpenRouterIndex } = await freshCapabilities();
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.fetchIndex.mockRejectedValue(new Error("Unavailable"));
    expect(await modelSupportsCaching("unknown/model", "key")).toBe(false);
    await loadOpenRouterIndex("key");
    expect(await getModelInputModalities("unknown/model", "key")).toEqual(new Set(["text"]));
  });
});
