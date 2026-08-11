import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { modelCostMultiplier } from "@/lib/model-multiplier";

/**
 * La lecture de l'index OpenRouter — la seule source des prix, donc du
 * multiplicateur affiché et du plafond de plan. Ce qui compte : que la forme
 * réelle de `/models` (des prix en CHAÎNES, par TOKEN) ressorte en USD au
 * million de tokens, et qu'un id suffixé ne devienne pas « de prix inconnu »,
 * ce qui le ferait passer sous tous les plafonds.
 *
 * L'index est un cache de PROCESS : chaque test le réimporte à neuf
 * (`vi.resetModules()` + `import()` dynamique), sans quoi le premier test
 * chargé servirait tous les autres.
 */

/** Extrait fidèle de la réponse d'OpenRouter (prix par token, en chaînes). */
const PAYLOAD = {
  data: [
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      context_length: 163840,
      supported_parameters: ["tools", "reasoning"],
      architecture: { input_modalities: ["text"] },
      // Le vrai objet publié par OpenRouter : les efforts arrivent du PLUS LOURD
      // au plus léger, et `none` y est le mot pour « ne raisonne pas ».
      reasoning: {
        mandatory: false,
        default_effort: "medium",
        supported_efforts: ["xhigh", "high", "medium", "low", "none"],
      },
      pricing: { prompt: "0.00000010", completion: "0.00000032" },
    },
    {
      id: "anthropic/claude-opus-5",
      name: "Claude Opus 5",
      context_length: 200000,
      supported_parameters: ["tools"],
      architecture: { input_modalities: ["text", "image"] },
      // Les Claude : ils raisonnent, mais ne publient aucune énumération.
      reasoning: { mandatory: false },
      pricing: { prompt: "0.000005", completion: "0.000025" },
    },
    {
      id: "some/embedding-model",
      name: "Embeddings",
      supported_parameters: [],
      pricing: { prompt: "0.00000002", completion: "0" },
    },
  ],
};

/** Un index neuf, alimenté par `payload` (ou en échec upstream). */
async function freshIndex(payload: unknown = PAYLOAD, status = 200) {
  vi.resetModules();
  const fetchMock = vi.fn(
    async () => new Response(status === 200 ? JSON.stringify(payload) : "nope", { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { ...(await import("./openrouter-index")), fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getOpenRouterModelInfo", () => {
  it("convertit les prix par token en USD au million de tokens", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(info?.pricing).toEqual({ inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.32 });
  });

  it("lit aussi la fenêtre de contexte et l'entrée image", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const flash = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(flash?.contextLength).toBe(163840);
    expect(flash?.imageInput).toBe(false);
    const opus = await getOpenRouterModelInfo("anthropic/claude-opus-5");
    expect(opus?.imageInput).toBe(true);
  });

  it("retombe sur l'id NU pour un suffixe de routage", async () => {
    // Sans ce repli, coller « :nitro » suffirait à rendre un modèle « de prix
    // inconnu » — donc autorisé sous n'importe quel plafond.
    const { getOpenRouterModelInfo } = await freshIndex();
    const nitro = await getOpenRouterModelInfo("anthropic/claude-opus-5:nitro");
    expect(nitro?.id).toBe("anthropic/claude-opus-5");
  });

  it("rend null sur un modèle vraiment inconnu", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    expect(await getOpenRouterModelInfo("nobody/nothing")).toBeNull();
  });

  it("répond sans relire /models une fois l'index chaud", async () => {
    const { getOpenRouterModelInfo, listOpenRouterIndex, fetchMock } = await freshIndex();
    await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    await getOpenRouterModelInfo("anthropic/claude-opus-5");
    await listOpenRouterIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("déduplique les demandes concurrentes", async () => {
    // Au démarrage d'une invocation, le catalogue, la boucle et le plafond
    // demandent l'index dans la même milliseconde.
    const { getOpenRouterModelInfo, fetchMock } = await freshIndex();
    await Promise.all([
      getOpenRouterModelInfo("deepseek/deepseek-v4-flash"),
      getOpenRouterModelInfo("anthropic/claude-opus-5"),
      getOpenRouterModelInfo("nobody/nothing"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("marque le tool-calling, y compris quand rien n'est déclaré", async () => {
    // Une liste de paramètres VIDE n'est pas un refus : le modèle reste listable.
    const { getOpenRouterModelInfo } = await freshIndex();
    expect((await getOpenRouterModelInfo("some/embedding-model"))?.tools).toBe(true);
    expect((await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.tools).toBe(true);
  });
});

describe("l'index nourrit le multiplicateur", () => {
  it("situe Opus face au défaut de minddy", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const baseline = (await getOpenRouterModelInfo("deepseek/deepseek-v4-flash"))?.pricing;
    const opus = (await getOpenRouterModelInfo("anthropic/claude-opus-5"))?.pricing;
    // (5 + 25) / 2 = 15, contre (0.1 + 0.32) / 2 = 0.21.
    expect(modelCostMultiplier(opus, baseline)).toBe(71);
  });
});

describe("index illisible", () => {
  it("ne lève pas et ne situe plus personne", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getOpenRouterModelInfo, listOpenRouterIndex } = await freshIndex(null, 500);
    // Prix inconnus → multiplicateur null → aucun modèle refusé sur une
    // ignorance : c'est le budget d'usage qui reste le plafond dur.
    await expect(listOpenRouterIndex()).resolves.toEqual([]);
    await expect(getOpenRouterModelInfo("anthropic/claude-opus-5")).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("les paliers de raisonnement publiés par le modèle", () => {
  it("ressortent du moins cher au plus cher, `none` traduit en `off`", async () => {
    // Nos listes vont dans l'autre sens que celle d'OpenRouter, et `off` dit un
    // peu plus que leur `none` : n'envoyer AUCUN champ de raisonnement.
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("deepseek/deepseek-v4-flash");
    expect(info?.reasoning).toEqual({
      efforts: ["off", "low", "medium", "high", "xhigh"],
      mandatory: false,
    });
  });

  it("un modèle qui n'énumère rien garde un objet VIDE, pas `null`", async () => {
    // La nuance porte tout le sélecteur : `null` = rien de publié, liste vide =
    // il raisonne sans dire comment. Les deux retombent sur les paliers
    // génériques, mais `mandatory` n'a de sens que dans le second cas.
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("anthropic/claude-opus-5");
    expect(info?.reasoning).toEqual({ efforts: [], mandatory: false });
  });

  it("un modèle sans objet `reasoning` n'en invente pas", async () => {
    const { getOpenRouterModelInfo } = await freshIndex();
    const info = await getOpenRouterModelInfo("some/embedding-model");
    expect(info?.reasoning).toBeNull();
  });

  it("jette un palier qu'on ne sait pas nommer plutôt que de le deviner", async () => {
    // Un palier qu'on ne sait pas afficher ne doit pas non plus se sélectionner.
    const { getOpenRouterModelInfo } = await freshIndex({
      data: [
        {
          id: "x/y",
          name: "Y",
          reasoning: { mandatory: true, supported_efforts: ["ultra", "high", "low"] },
          pricing: { prompt: "0.000001", completion: "0.000001" },
        },
      ],
    });
    const info = await getOpenRouterModelInfo("x/y");
    expect(info?.reasoning).toEqual({ efforts: ["low", "high"], mandatory: true });
  });
});
