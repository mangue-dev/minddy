import { describe, expect, it } from "vitest";

import {
  buildOpencodeConfig,
  opencodeServerEnv,
  OPENCODE_ANCHOR_FILE,
  OPENCODE_DB_PATH,
  OPENCODE_PRIMARY_AGENT,
  OPENCODE_PROVIDER_ID,
} from "./opencode-config";
import { REPO_DIR } from "../repo-host";
import type { VmJob } from "./protocol";

/**
 * MIN-286 lot 1 — la config d'opencode d'un tour.
 *
 * Ce que ce fichier garde, et qui ne se relit pas : **la config est ce qui DIT ce
 * qu'un tour a le droit de faire**. Une lecture seule de relecture, un plafond de
 * dépense, un placeholder de clé — tout cela cesse d'être du code de boucle pour
 * devenir un document JSON, et un document ne lève pas quand il est faux. Il
 * tourne, et le tour fait autre chose que ce qu'on croit.
 *
 * Les valeurs asserties ici ne sont pas des goûts : chacune a été **mesurée sur
 * `opencode-ai@1.18.16`** (cf. l'en-tête d'`opencode-config.ts`). Les deux qui
 * coûteraient le plus cher à redécouvrir :
 *  - un modèle déclaré SANS `cost` rend `cost: 0`, tokens exacts — le ledger se
 *    viderait sans un mot ;
 *  - `reasoning_effort` à plat est retiré du corps de requête, la forme
 *    imbriquée passe.
 */

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    runId: "11111111-2222-4333-8444-555555555555",
    ledgerRunId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    projectId: "proj-1",
    appOrigin: "https://minddy.example",
    model: "deepseek/deepseek-v4-flash",
    baseUrl: "https://openrouter.ai/api/v1",
    provider: "openrouter",
    llmPlaceholderKey: "minddy-placeholder-key",
    reasoningLevel: "medium",
    contextWindow: 200_000,
    inputUsdPerMTok: 0.3,
    pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 },
    anchor: "issue",
    writesToRepo: true,
    interactive: true,
    chain: false,
    imageInput: false,
    webSearch: true,
    webSearchMax: 5,
    subagents: {
      models: false,
      favorites: [],
      maxParallel: 2,
      allowedIds: [],
      abovePlanIds: [],
      maxMultiplier: null,
    },
    messages: [{ role: "user", content: "salut" }],
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 0,
    parkedForSubagents: false,
    editedPaths: [],
    repoTouched: false,
    prInlineComments: 0,
    baseBranch: "main",
    workBranch: "minddy/agent/min-42-abcd1234",
    authUrl: "https://x-access-token:ghs_TOKEN_SECRET@github.com/org/repo.git",
    commitRef: "MIN-42",
    bootstrapMs: 0,
    filesFromSha: "",
    locale: "fr",
    feature: "agent_code",
    checkpointMaxBytes: 3_200_000,
    ...over,
  };
}

describe("le modèle et son fournisseur", () => {
  it("déclare UN provider, celui du job, avec le placeholder et jamais une clé", () => {
    const cfg = buildOpencodeConfig(job());
    expect(Object.keys(cfg.provider)).toEqual([OPENCODE_PROVIDER_ID]);
    const provider = cfg.provider[OPENCODE_PROVIDER_ID];
    expect(provider.options.apiKey).toBe("minddy-placeholder-key");
    expect(provider.options.baseURL).toBe("https://openrouter.ai/api/v1");
    // La couche OpenAI-compatible : c'est le seul wire format que nos cinq
    // providers parlent tous (cf. agent-providers.ts).
    expect(provider.npm).toBe("@ai-sdk/openai-compatible");
  });

  it("réfère le modèle par `provider/modèle`, slash du modèle compris", () => {
    // Mesuré : opencode coupe au PREMIER slash. Un id à slash (le cas normal chez
    // OpenRouter) traverse donc intact.
    const cfg = buildOpencodeConfig(job());
    expect(cfg.model).toBe("minddy/deepseek/deepseek-v4-flash");
    expect(cfg.small_model).toBe(cfg.model);
    expect(Object.keys(cfg.provider[OPENCODE_PROVIDER_ID].models)).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
  });

  it("donne NOS prix au modèle — sans eux opencode facture zéro", () => {
    const cfg = buildOpencodeConfig(
      job({
        pricing: {
          inputUsdPerMTok: 3,
          outputUsdPerMTok: 15,
          cacheReadUsdPerMTok: 0.3,
          cacheWriteUsdPerMTok: 3.75,
        },
      }),
    );
    expect(cfg.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"].cost).toEqual({
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    });
  });

  it("n'invente aucun prix quand le job n'en porte pas", () => {
    // BYOK hors index OpenRouter. Le coût rendu vaudra zéro, et c'est au
    // superviseur d'écrire l'usage en `estimated` — pas à la config de mentir.
    const cfg = buildOpencodeConfig(job({ pricing: undefined }));
    expect(
      cfg.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"].cost,
    ).toBeUndefined();
  });

  it("passe le raisonnement sous sa forme IMBRIQUÉE, la seule qui survive", () => {
    const cfg = buildOpencodeConfig(job({ reasoningLevel: "high" }));
    const model = cfg.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"];
    expect(model.options).toEqual({ reasoning: { effort: "high" } });
    expect(model.reasoning).toBe(true);
    // Mesuré : `reasoning_effort` à plat est RETIRÉ du corps par opencode sur
    // l'appel principal. L'écrire ici donnerait un réglage qui ne part jamais.
    expect(JSON.stringify(model.options)).not.toContain("reasoning_effort");
  });

  it("ne dit rien du raisonnement quand il est coupé", () => {
    const model =
      buildOpencodeConfig(job({ reasoningLevel: "off" })).provider[OPENCODE_PROVIDER_ID].models[
        "deepseek/deepseek-v4-flash"
      ];
    expect(model.options).toBeUndefined();
    expect(model.reasoning).toBeUndefined();
  });
});

describe("ce que le tour a le droit de faire", () => {
  it("laisse le shell en `ask` — c'est ce qui donne la main à command-guard", () => {
    // La règle de commande n'est PAS une ACL en glob : `command-guard.ts` reste
    // une fonction pure que le superviseur rejoue sur /permission/:id/reply. Une
    // permission `allow` lui retirerait son point de contrôle, en silence.
    expect(buildOpencodeConfig(job()).permission.bash).toBe("ask");
  });

  it("refuse l'écriture et retire les tools d'écriture sur une relecture", () => {
    const cfg = buildOpencodeConfig(job({ writesToRepo: false, anchor: "pr" }));
    expect(cfg.permission.edit).toBe("deny");
    // Les deux moitiés de la même garantie : l'ACL ET l'absence du tool. Mesuré :
    // `tools: {x: false}` ne retire pas l'intégré, il pose un `deny` — c'est le
    // jeu de tools de l'agent qui le fait disparaître.
    for (const name of ["edit", "write", "apply_patch"]) {
      expect(cfg.tools[name]).toBe(false);
      expect(cfg.agent[OPENCODE_PRIMARY_AGENT].tools?.[name]).toBe(false);
    }
  });

  it("écrit quand la session écrit", () => {
    const cfg = buildOpencodeConfig(job({ writesToRepo: true }));
    expect(cfg.permission.edit).toBe("allow");
    expect(cfg.agent[OPENCODE_PRIMARY_AGENT].tools?.edit).toBeUndefined();
  });

  it("coupe la question quand personne ne peut répondre (routine)", () => {
    expect(buildOpencodeConfig(job({ interactive: false })).permission.question).toBe("deny");
    expect(buildOpencodeConfig(job({ interactive: true })).permission.question).toBe("ask");
  });

  it("éteint les intégrés qui n'ont pas de lecteur chez nous", () => {
    const cfg = buildOpencodeConfig(job());
    // `todowrite` : notre checklist est le plan du ticket. `websearch` : il ne
    // porterait ni le plafond du tour ni la facturation. `skill` : il n'y en a pas.
    for (const name of ["todowrite", "websearch", "skill"]) {
      expect(cfg.tools[name]).toBe(false);
      expect(cfg.agent[OPENCODE_PRIMARY_AGENT].tools?.[name]).toBe(false);
    }
  });
});

describe("les sous-agents", () => {
  it("tient la hiérarchie à UN niveau", () => {
    const cfg = buildOpencodeConfig(job());
    expect(cfg.subagent_depth).toBe(1);
    expect(cfg.agent.general.tools?.task).toBe(false);
  });

  it("fait de `explore` une lecture seule PAR SON JEU DE TOOLS", () => {
    const explore = buildOpencodeConfig(job()).agent.explore;
    expect(explore.mode).toBe("subagent");
    expect(explore.tools).toEqual({ "*": false, read: true, grep: true, glob: true });
    expect(explore.permission?.["*"]).toBe("deny");
  });

  it("retire la délégation quand le tour n'a pas de fille à donner", () => {
    const none = job({
      subagents: { ...job().subagents, maxParallel: 0 },
    });
    expect(buildOpencodeConfig(none).agent[OPENCODE_PRIMARY_AGENT].tools?.task).toBe(false);
    expect(buildOpencodeConfig(job()).agent[OPENCODE_PRIMARY_AGENT].tools?.task).toBe(true);
  });

  it("ne fige AUCUN modèle de fille en config", () => {
    // Le scoping par plan (`allowedIds` / `maxMultiplier`) se joue à l'appel de
    // `task`, où le superviseur rejoue `makeSubagentModelResolver`. Un modèle
    // posé ici vaudrait pour toutes les filles du tour.
    const cfg = buildOpencodeConfig(job());
    expect(cfg.agent.explore.model).toBeUndefined();
    expect(cfg.agent.general.model).toBeUndefined();
  });
});

describe("l'environnement du serveur", () => {
  it("passe tout par l'environnement, sans un seul fichier de config", () => {
    const env = opencodeServerEnv(job());
    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toEqual(buildOpencodeConfig(job()));
    expect(env.OPENCODE_DB).toBe(OPENCODE_DB_PATH);
  });

  it("garde l'état d'opencode HORS du dépôt", () => {
    // Sinon le `git add -A` de fin de tour emporte la base de la conversation
    // dans un commit du dépôt de l'utilisateur (même règle que `HARNESS_DIR`).
    expect(OPENCODE_DB_PATH.startsWith(`${REPO_DIR}/`)).toBe(false);
    expect(OPENCODE_ANCHOR_FILE.startsWith(`${REPO_DIR}/`)).toBe(false);
  });

  it("ne dépend d'aucun service en ligne pour démarrer", () => {
    const env = opencodeServerEnv(job());
    expect(env.OPENCODE_DISABLE_MODELS_FETCH).toBe("1");
    expect(env.OPENCODE_DISABLE_AUTOUPDATE).toBe("1");
  });
});

describe("aucun secret ne peut entrer dans la config", () => {
  /**
   * Le miroir de [vm-bundle-secrets.test.ts](../vm-bundle-secrets.test.ts), du
   * côté de la SORTIE : ce test-là garde le graphe d'imports du bundle, celui-ci
   * garde le document que le bundle produit. Les deux ensemble disent « rien de
   * ce qui part dans la microVM ne détient un secret ».
   *
   * La faute qu'il attrape n'a aucun symptôme : la config marche parfaitement
   * avec une vraie clé dedans — mieux, même, puisque le firewall n'aurait plus
   * rien à transformer. Elle ne se voit que le jour où le modèle fait `env` ou
   * lit `~/.config`, et ce jour-là il est trop tard.
   */
  it("ne porte que le placeholder, jamais une clé de fournisseur", () => {
    const serialized = opencodeServerEnv(
      job({ llmPlaceholderKey: "minddy-placeholder-key" }),
    ).OPENCODE_CONFIG_CONTENT;
    expect(serialized).toContain("minddy-placeholder-key");
    for (const shape of ["sk-or-v1-", "sk-ant-", "sk-proj-", "AIza", "eyJ"]) {
      expect(serialized).not.toContain(shape);
    }
  });

  it("ne laisse pas fuiter le token de forge de l'URL de push", () => {
    // `authUrl` porte un token éphémère de la forge. Il n'a rien à faire dans une
    // config lue par le harness — et il finirait dans les logs du serveur.
    expect(opencodeServerEnv(job()).OPENCODE_CONFIG_CONTENT).not.toContain("ghs_TOKEN_SECRET");
  });

  it("n'emporte rien du job qui ne serve pas à opencode", () => {
    // Le job porte l'historique, les chemins édités, l'origine du plan de
    // contrôle. La config n'en veut aucun : ce qui n'y entre pas ne peut pas en
    // sortir. Assertion sur les clés de PREMIER niveau, pour que l'ajout d'un
    // champ soit un geste conscient.
    expect(Object.keys(buildOpencodeConfig(job())).sort()).toEqual(
      [
        "$schema",
        "agent",
        "default_agent",
        "instructions",
        "model",
        "permission",
        "plugin",
        "provider",
        "small_model",
        "subagent_depth",
        "tool_output",
        "tools",
      ].sort(),
    );
  });
});
