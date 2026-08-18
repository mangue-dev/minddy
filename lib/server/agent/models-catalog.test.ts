import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentProviderId } from "@/lib/agent-providers";
import type { OpenRouterModelInfo } from "./openrouter-index";

/**
 * What the model picker PROPOSES, from the OpenRouter index.
 *
 * The catalog is narrower than the index, and that is the subject of this file:
 * the index must keep everything (a hand-pasted id remains encryptable), the picker
 * should only show actually addressable TEXT patterns. Three things
 * come out of it, two of which no `supported_parameters` betrays — the
 * switches and image or audio models declare `tools` as the
 * others.
 *
 * We only mock the reading OpenRouter and the two server modules that the
 * catalog imports (Supabase). The cache is PROCESS: each test reimports
 * the new module, otherwise the first one would serve all the others.
 */

/** An index entry, all fields default to "plain text template". */
function entry(over: Partial<OpenRouterModelInfo> & { id: string }): OpenRouterModelInfo {
  return {
    name: over.id,
    contextLength: 200000,
    imageInput: false,
    textOutput: true,
    router: false,
    tools: true,
    pricing: { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
    reasoning: null,
    cachePricing: null,
    ...over,
  };
}

const INDEX: OpenRouterModelInfo[] = [
  // Realistic and well-separated prices: they are the ones who store the advice.
  entry({ id: "anthropic/claude-opus-5", pricing: { inputUsdPerMTok: 5, outputUsdPerMTok: 25 } }),
  entry({
    id: "deepseek/deepseek-v4-flash",
    pricing: { inputUsdPerMTok: 0.14, outputUsdPerMTok: 0.28 },
  }),
  // Referrals: `openrouter/auto` and the alias `…-latest` of a family.
  entry({ id: "openrouter/auto", router: true, textOutput: false }),
  entry({ id: "~anthropic/claude-opus-latest", router: true }),
  entry({ id: "openrouter/free", router: true }),
  // Non-textual outputs, `tools` declared anyway.
  entry({ id: "google/gemini-3-pro-image", textOutput: false }),
  entry({ id: "openai/gpt-audio", textOutput: false }),
  // No tool-calling: the exclusion that already existed.
  entry({ id: "some/no-tools", tools: false }),
];

async function freshCatalog(
  index: OpenRouterModelInfo[] = INDEX,
  /** Value of line `app_config.recommended_models`; `null` = not set. */
  recommendedConfig: string | null = null,
  endpoint: {
    provider: AgentProviderId;
    baseUrl: string;
    apiKey: string;
    mode: "byok";
  } | null = null,
) {
  vi.resetModules();
  vi.doMock("./openrouter-index", () => ({
    listOpenRouterIndex: vi.fn(async () => index),
    getOpenRouterModelInfo: vi.fn(async () => null),
    loadOpenRouterIndex: vi.fn(async () => {}),
  }));
  vi.doMock("./model", () => ({
    getRootDefaultModel: vi.fn(async () => null),
    resolveAgentApiKey: vi.fn(async () => {
      if (endpoint) return endpoint;
      return {
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "platform-key",
        mode: "platform",
      };
    }),
    resolveProviderDefaultModel: vi.fn(async () => null),
  }));
  vi.doMock("./model-plan", () => ({
    getModelPlanLimit: vi.fn(async () => null),
    // The baseline of the cost scale: the price of Minddy's default.
    getBaselinePricing: vi.fn(async () => ({ inputUsdPerMTok: 1, outputUsdPerMTok: 1 })),
  }));
  vi.doMock("@/lib/server/app-config", () => ({
    getAppConfigValue: vi.fn(async () => recommendedConfig),
  }));
  vi.doMock("@/lib/managed-services", () => ({ isManagedAiEnabled: () => true }));
  return import("./models-catalog");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("./openrouter-index");
  vi.doUnmock("./model");
  vi.doUnmock("./model-plan");
  vi.doUnmock("@/lib/server/app-config");
  vi.doUnmock("@/lib/managed-services");
});

describe("getPlatformModelCatalog", () => {
  it("ne propose pas les aiguillages d'OpenRouter", async () => {
    // `openrouter/auto` is not a template, and `~…-latest` changes template
    // under the user's feet — prices and reasoning levels included.
    const { getPlatformModelCatalog } = await freshCatalog();
    const ids = (await getPlatformModelCatalog()).map((m) => m.id);
    expect(ids).not.toContain("openrouter/auto");
    expect(ids).not.toContain("openrouter/free");
    expect(ids).not.toContain("~anthropic/claude-opus-latest");
  });

  it("ne propose que ce qui rend du texte", async () => {
    // These two declare `tools`: the tool-calling filter does not catch them.
    const { getPlatformModelCatalog } = await freshCatalog();
    const ids = (await getPlatformModelCatalog()).map((m) => m.id);
    expect(ids).not.toContain("google/gemini-3-pro-image");
    expect(ids).not.toContain("openai/gpt-audio");
  });

  it("garde les vrais modèles, triés par id", async () => {
    const { getPlatformModelCatalog } = await freshCatalog();
    const ids = (await getPlatformModelCatalog()).map((m) => m.id);
    expect(ids).toEqual(["anthropic/claude-opus-5", "deepseek/deepseek-v4-flash"]);
  });
});

describe("getAgentModelsForUser", () => {
  it("sert la même liste filtrée au picker de l'agent", async () => {
    const { getAgentModelsForUser } = await freshCatalog();
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.models.map((m) => m.id)).toEqual([
      "anthropic/claude-opus-5",
      "deepseek/deepseek-v4-flash",
    ]);
  });

  it("remet l'adresse locale à la coquille sans jamais la sonder côté serveur", async () => {
    const { getAgentModelsForUser } = await freshCatalog(
      INDEX,
      null,
      {
        provider: "ollama",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "",
        mode: "byok",
      },
    );

    await expect(getAgentModelsForUser("user-1")).resolves.toMatchObject({
      provider: "ollama",
      localEndpoint: { provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1" },
      models: [],
    });
  });

  it("ne contacte pas OpenRouter pour ranger le catalogue d'un provider BYOK natif", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ id: "claude-sonnet-5", display_name: "Claude Sonnet 5" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getAgentModelsForUser } = await freshCatalog(
      INDEX,
      JSON.stringify(["claude-sonnet-5"]),
      {
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "user-key",
        mode: "byok",
      },
    );
    const { listOpenRouterIndex } = await import("./openrouter-index");

    const catalog = await getAgentModelsForUser("user-1");

    expect(catalog.recommended).toEqual(["claude-sonnet-5"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listOpenRouterIndex)).not.toHaveBeenCalled();
  });
});

describe("les modèles conseillés", () => {
  it("se rangent du MOINS CHER au plus cher, pas dans l'ordre de la config", async () => {
    // The admin setting is a set: the order is calculated, otherwise a rank
    // handwritten would survive the prices that justified it. Here the config
    // name the dear one first — it should come out second.
    const { getAgentModelsForUser } = await freshCatalog(
      INDEX,
      JSON.stringify(["anthropic/claude-opus-5", "deepseek/deepseek-v4-flash"]),
    );
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual([
      "deepseek/deepseek-v4-flash",
      "anthropic/claude-opus-5",
    ]);
  });

  it("relèguent en fin de liste un modèle sans prix connu", async () => {
    // We don't know where to place it: putting it in the middle would give it a rank
    // that we have not measured.
    const index = [...INDEX, entry({ id: "aaa/no-price", pricing: null })];
    const { getAgentModelsForUser } = await freshCatalog(
      index,
      JSON.stringify(["aaa/no-price", "anthropic/claude-opus-5", "deepseek/deepseek-v4-flash"]),
    );
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual([
      "deepseek/deepseek-v4-flash",
      "anthropic/claude-opus-5",
      "aaa/no-price",
    ]);
  });

  it("écartent un conseil que ce catalogue ne propose pas", async () => {
    // Advising an absent model would make a dead line in the picker — and
    // this is the common case in BYOK, whose ids are native.
    const { getAgentModelsForUser } = await freshCatalog(
      INDEX,
      JSON.stringify(["anthropic/claude-opus-5", "openai/gpt-audio", "nobody/nothing"]),
    );
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual(["anthropic/claude-opus-5"]);
  });

  it("retombent sur le repli produit quand rien n'est réglé", async () => {
    // The fallback is the list written in code: from this false index, it only crosses
    // Minddy's flaw — and it's this one that must stand out.
    const { getAgentModelsForUser } = await freshCatalog();
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual(["deepseek/deepseek-v4-flash"]);
  });

  it("survivent à une ligne app_config illisible", async () => {
    // A broken setting should not empty the picker: we fall back on the fallback
    // product, exactly as if the line did not exist, never on one
    // exception that would drop the entire catalog.
    const { getAgentModelsForUser } = await freshCatalog(INDEX, "{ pas du json");
    await expect(getAgentModelsForUser("user-1")).resolves.toMatchObject({
      recommended: ["deepseek/deepseek-v4-flash"],
    });
  });

  it("ouvrent sur une liste VIDE quand aucun conseil n'est lançable", async () => {
    // The case of a BYOK provider, whose ids are native (`claude-sonnet-5`):
    // no advice is right, and the picker must reopen on the catalog
    // integer rather than a selection of zero models.
    const { getAgentModelsForUser } = await freshCatalog(INDEX, JSON.stringify(["nobody/nothing"]));
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual([]);
  });

  it("accompagnent aussi le picker de review de PR", async () => {
    // It's a USER surface: same selection, same reason.
    const { getPrReviewModelCatalog } = await freshCatalog(
      INDEX,
      JSON.stringify(["anthropic/claude-opus-5"]),
    );
    const catalog = await getPrReviewModelCatalog("user-1");
    expect(catalog.recommended).toEqual(["anthropic/claude-opus-5"]);
  });

  it("ne touchent PAS le catalogue admin", async () => {
    // /admin is used to set `app_config`, transcription and embeddings included:
    // a list of advice would hide what we came to look for.
    const { getAdminModelCatalog } = await freshCatalog(
      INDEX,
      JSON.stringify(["anthropic/claude-opus-5"]),
    );
    const catalog = await getAdminModelCatalog();
    expect(catalog.recommended).toBeUndefined();
    expect(catalog.models.map((m) => m.id)).toEqual([
      "anthropic/claude-opus-5",
      "deepseek/deepseek-v4-flash",
    ]);
  });
});

describe("getAdminModelCatalog", () => {
  it("situe chaque modèle sur l'échelle de coût de minddy", async () => {
    // This is the working information on the screen: we choose what minddy
    // pays, and the sorting of the recommended selection is read there.
    const { getAdminModelCatalog } = await freshCatalog();
    const catalog = await getAdminModelCatalog();
    const byId = new Map(catalog.models.map((m) => [m.id, m.multiplier]));
    // Baseline mocked at (1 + 1) / 2 = 1 USD/Mtok.
    expect(byId.get("anthropic/claude-opus-5")).toBe(15);
    expect(byId.get("deepseek/deepseek-v4-flash")).toBe(0.21);
  });

  it("ne joint AUCUN plafond, donc ne grise rien", async () => {
    // A billing plan does not apply to an instance setting.
    const { getAdminModelCatalog } = await freshCatalog();
    expect((await getAdminModelCatalog()).maxMultiplier).toBeNull();
  });
});
