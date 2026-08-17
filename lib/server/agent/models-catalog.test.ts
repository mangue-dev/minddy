import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentProviderId } from "@/lib/agent-providers";
import type { OpenRouterModelInfo } from "./openrouter-index";

/**
 * Ce que le picker de modèles PROPOSE, à partir de l'index OpenRouter.
 *
 * Le catalogue est plus étroit que l'index, et c'est le sujet de ce fichier :
 * l'index doit tout garder (un id collé à la main reste chiffrable), le picker
 * ne doit montrer que des modèles de TEXTE réellement adressables. Trois choses
 * en sortent, dont deux qu'aucun `supported_parameters` ne trahit — les
 * aiguillages et les modèles d'image ou d'audio déclarent `tools` comme les
 * autres.
 *
 * On ne moque que la lecture d'OpenRouter et les deux modules serveur que le
 * catalogue importe (Supabase). Le cache est de PROCESS : chaque test réimporte
 * le module à neuf, sans quoi le premier servirait tous les autres.
 */

/** Une entrée d'index, tous champs par défaut à « modèle de texte ordinaire ». */
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
  // Prix réalistes et bien séparés : c'est eux qui rangent les conseils.
  entry({ id: "anthropic/claude-opus-5", pricing: { inputUsdPerMTok: 5, outputUsdPerMTok: 25 } }),
  entry({
    id: "deepseek/deepseek-v4-flash",
    pricing: { inputUsdPerMTok: 0.14, outputUsdPerMTok: 0.28 },
  }),
  // Aiguillages : `openrouter/auto` et l'alias `…-latest` d'une famille.
  entry({ id: "openrouter/auto", router: true, textOutput: false }),
  entry({ id: "~anthropic/claude-opus-latest", router: true }),
  entry({ id: "openrouter/free", router: true }),
  // Sorties non textuelles, `tools` déclaré quand même.
  entry({ id: "google/gemini-3-pro-image", textOutput: false }),
  entry({ id: "openai/gpt-audio", textOutput: false }),
  // Pas de tool-calling : l'exclusion qui existait déjà.
  entry({ id: "some/no-tools", tools: false }),
];

async function freshCatalog(
  index: OpenRouterModelInfo[] = INDEX,
  /** Valeur de la ligne `app_config.recommended_models` ; `null` = non réglée. */
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
    // Le baseline de l'échelle de coût : le prix du défaut de minddy.
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
    // `openrouter/auto` n'est pas un modèle, et `~…-latest` change de modèle
    // sous les pieds de l'utilisateur — prix et paliers de raisonnement compris.
    const { getPlatformModelCatalog } = await freshCatalog();
    const ids = (await getPlatformModelCatalog()).map((m) => m.id);
    expect(ids).not.toContain("openrouter/auto");
    expect(ids).not.toContain("openrouter/free");
    expect(ids).not.toContain("~anthropic/claude-opus-latest");
  });

  it("ne propose que ce qui rend du texte", async () => {
    // Ces deux-là déclarent `tools` : le filtre tool-calling ne les attrape pas.
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
    // Le réglage admin est un ensemble : l'ordre est calculé, sinon un rang
    // écrit à la main survivrait aux prix qui l'ont justifié. Ici la config
    // nomme le cher d'abord — il doit ressortir en second.
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
    // On ne sait pas où le situer : le mettre au milieu lui prêterait un rang
    // qu'on n'a pas mesuré.
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
    // Conseiller un modèle absent ferait une ligne morte dans le picker — et
    // c'est le cas courant en BYOK, dont les ids sont natifs.
    const { getAgentModelsForUser } = await freshCatalog(
      INDEX,
      JSON.stringify(["anthropic/claude-opus-5", "openai/gpt-audio", "nobody/nothing"]),
    );
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual(["anthropic/claude-opus-5"]);
  });

  it("retombent sur le repli produit quand rien n'est réglé", async () => {
    // Le repli est la liste écrite en code : de ce faux index, il ne croise que
    // le défaut de minddy — et c'est bien lui qui doit ressortir.
    const { getAgentModelsForUser } = await freshCatalog();
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual(["deepseek/deepseek-v4-flash"]);
  });

  it("survivent à une ligne app_config illisible", async () => {
    // Un réglage cassé ne doit pas vider le picker : on retombe sur le repli
    // produit, exactement comme si la ligne n'existait pas, jamais sur une
    // exception qui ferait tomber tout le catalogue.
    const { getAgentModelsForUser } = await freshCatalog(INDEX, "{ pas du json");
    await expect(getAgentModelsForUser("user-1")).resolves.toMatchObject({
      recommended: ["deepseek/deepseek-v4-flash"],
    });
  });

  it("ouvrent sur une liste VIDE quand aucun conseil n'est lançable", async () => {
    // Le cas d'un provider BYOK, dont les ids sont natifs (`claude-sonnet-5`) :
    // aucun conseil ne tombe juste, et le picker doit rouvrir sur le catalogue
    // entier plutôt que sur une sélection de zéro modèle.
    const { getAgentModelsForUser } = await freshCatalog(INDEX, JSON.stringify(["nobody/nothing"]));
    const catalog = await getAgentModelsForUser("user-1");
    expect(catalog.recommended).toEqual([]);
  });

  it("accompagnent aussi le picker de review de PR", async () => {
    // C'est une surface UTILISATEUR : même sélection, même raison.
    const { getPrReviewModelCatalog } = await freshCatalog(
      INDEX,
      JSON.stringify(["anthropic/claude-opus-5"]),
    );
    const catalog = await getPrReviewModelCatalog("user-1");
    expect(catalog.recommended).toEqual(["anthropic/claude-opus-5"]);
  });

  it("ne touchent PAS le catalogue admin", async () => {
    // /admin sert à régler `app_config`, transcription et embeddings compris :
    // une liste de conseils y masquerait ce qu'on est venu chercher.
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
    // C'est l'information de travail de l'écran : on y choisit ce que minddy
    // paye, et le tri de la sélection conseillée s'y lit.
    const { getAdminModelCatalog } = await freshCatalog();
    const catalog = await getAdminModelCatalog();
    const byId = new Map(catalog.models.map((m) => [m.id, m.multiplier]));
    // Baseline mocké à (1 + 1) / 2 = 1 USD/Mtok.
    expect(byId.get("anthropic/claude-opus-5")).toBe(15);
    expect(byId.get("deepseek/deepseek-v4-flash")).toBe(0.21);
  });

  it("ne joint AUCUN plafond, donc ne grise rien", async () => {
    // Un plan de facturation ne s'applique pas à un réglage d'instance.
    const { getAdminModelCatalog } = await freshCatalog();
    expect((await getAdminModelCatalog()).maxMultiplier).toBeNull();
  });
});
