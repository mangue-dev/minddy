import { describe, expect, it } from "vitest";

import {
  buildOpencodeConfig,
  opencodeServerEnv,
  opencodeAnchorFile,
  opencodeDbPath,
  OPENCODE_PRIMARY_AGENT,
  OPENCODE_PROVIDER_ID,
  MAX_SUBAGENT_MODELS,
  subagentAgentTable,
} from "./opencode-config";
import { cloudLayout, layoutForRoot } from "../harness-layout";
import { VM_PROTOCOL_VERSION, type VmJob } from "./protocol";

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

/**
 * MIN-354 — le job porte son layout, et tous les chemins de la config en dérivent.
 * Le fixture garde celui de la microVM (rien ne bouge en production) ; le dernier
 * bloc du fichier vérifie que TOUT suit quand la racine change.
 */
const LAYOUT = cloudLayout();

function job(over: Partial<VmJob> = {}): VmJob {
  return {
    protocolVersion: VM_PROTOCOL_VERSION,
    layout: LAYOUT,
    runId: "11111111-2222-4333-8444-555555555555",
    ledgerRunId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    projectId: "proj-1",
    appOrigin: "https://minddy.example",
    opencodeInput: { prompt: "vas-y", anchorInstructions: "# ancrage" },
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
    instructions: { paths: [], bytes: 0 },
    usageSeqStart: 0,
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

  it("déclare la modalité image, sans quoi une maquette est remplacée par une erreur", () => {
    // MESURÉ (§2.22) : `attachment: true` seul ne suffit PAS. Le binaire teste
    // `capabilities.input.image`, qui se déclare par `modalities.input` — sans
    // lui, opencode remplace l'image par « ERROR: Cannot read … (this model does
    // not support image input). Inform the user. » et le modèle prévient
    // l'utilisateur d'une limite qui n'existe pas.
    const withImages = buildOpencodeConfig(job({ imageInput: true }));
    const model = withImages.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"];
    expect(model.attachment).toBe(true);
    expect(model.modalities).toEqual({ input: ["text", "image"], output: ["text"] });

    // Et l'inverse : un run dont le modèle ne voit pas les images ne l'annonce
    // pas — le plan de contrôle ne lui en servira pas non plus.
    const without = buildOpencodeConfig(job({ imageInput: false }));
    const blind = without.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"];
    expect(blind.attachment).toBe(false);
    expect(blind.modalities).toEqual({ input: ["text"], output: ["text"] });
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

  it("laisse l'écriture en `ask` — c'est ce qui protège `.git/`", () => {
    // Mesuré : `.git/` n'est gardé par personne chez opencode, un `write` sur
    // `<dépôt>/.git/config` l'écrase. `ask` est ce qui donne la main au
    // superviseur, qui y rejoue `assertNotGit` et `resolveWithin`.
    const cfg = buildOpencodeConfig(job({ writesToRepo: true }));
    expect(cfg.permission.edit).toBe("ask");
    expect(cfg.agent[OPENCODE_PRIMARY_AGENT].tools?.edit).toBeUndefined();
  });

  it("coupe la question quand personne ne peut répondre (routine)", () => {
    const routine = buildOpencodeConfig(job({ interactive: false }));
    // Le RETRAIT du tool, et pas seulement l'ACL : mesuré, la permission
    // `question` n'est pas consultée — le tool s'exécute et publie sa question.
    expect(routine.agent[OPENCODE_PRIMARY_AGENT].tools?.question).toBe(false);
    expect(routine.permission.question).toBe("deny");
    const interactive = buildOpencodeConfig(job({ interactive: true }));
    expect(interactive.agent[OPENCODE_PRIMARY_AGENT].tools?.question).toBe(true);
    expect(interactive.permission.question).toBe("ask");
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

/**
 * Les sous-agents (MIN-286, lot 2, tâche 12).
 *
 * Deux mesures du 2026-08-12 décident de tout ce qui suit, et aucune ne se
 * devine : le tool `task` n'a **pas** de champ `model` (le modèle d'une fille
 * vient de `agent.<id>.model`), et le dossier de tools du serveur est servi à
 * TOUT LE MONDE — une fille reçoit donc les 32 tools de domaine tant qu'un
 * `"*": false` ne les lui retire pas.
 */
describe("les sous-agents", () => {
  const favorites = (): VmJob["subagents"] => ({
    models: true,
    favorites: [
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", use_case: "Middle gear." },
      { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", use_case: "Hard analysis." },
    ],
    maxParallel: 2,
    allowedIds: [],
    abovePlanIds: [],
    maxMultiplier: null,
    pricing: {
      "anthropic/claude-haiku-4.5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
      "anthropic/claude-opus-4.8": { inputUsdPerMTok: 15, outputUsdPerMTok: 75 },
    },
  });

  it("tient la hiérarchie à UN niveau", () => {
    const cfg = buildOpencodeConfig(job());
    expect(cfg.subagent_depth).toBe(1);
    // Le joker retire `task` du jeu de la fille, et l'ACL le redit : la
    // délégation en cascade est structurelle, jamais une phrase de prompt.
    expect(cfg.agent.general.tools?.["*"]).toBe(false);
    expect(cfg.agent.general.tools?.task).toBeUndefined();
    expect(cfg.agent.general.permission?.task).toBe("deny");
  });

  it("fait de `explore` une lecture seule PAR SON JEU DE TOOLS", () => {
    const explore = buildOpencodeConfig(job()).agent.explore;
    expect(explore.mode).toBe("subagent");
    expect(explore.tools).toEqual({ "*": false, read: true, grep: true, glob: true });
    expect(explore.permission?.["*"]).toBe("deny");
  });

  it("retire à une fille les tools de DOMAINE, qui appartiennent au parent", () => {
    // `SUBAGENT_FORBIDDEN_TOOLS` (MIN-112) : le ticket, le carnet, les pull
    // requests, le plan de session. Sans le `"*": false`, ils étaient servis —
    // ils vivent dans le dossier de tools du serveur, donc à tout le monde.
    const cfg = buildOpencodeConfig(job());
    for (const agent of [cfg.agent.explore, cfg.agent.general]) {
      expect(agent.tools?.["*"]).toBe(false);
      for (const name of ["update_issue", "create_pr", "update_plan", "read_scratchpad"]) {
        expect(agent.tools?.[name]).toBeUndefined();
      }
    }
    // `web_search` est la seule exception, et c'est celle de `subagentToolsFor` :
    // il est facturé et plafonné par nous, pas interdit à une fille.
    expect(cfg.agent.general.tools?.web_search).toBe(true);
    expect(buildOpencodeConfig(job({ webSearch: false })).agent.general.tools?.web_search).toBe(
      undefined,
    );
  });

  it("ouvre les TROIS interfaces d'écriture à une fille qui écrit", () => {
    // C'est opencode qui tranche selon le modèle DE LA FILLE (`apply_patch` sur
    // les `gpt-*`) : en désigner une ici la figerait sur celui du parent.
    const cfg = buildOpencodeConfig(job());
    for (const name of ["edit", "write", "apply_patch"]) {
      expect(cfg.agent.general.tools?.[name]).toBe(true);
      expect(cfg.agent.explore.tools?.[name]).toBeUndefined();
    }
    const review = buildOpencodeConfig(job({ writesToRepo: false }));
    for (const name of ["edit", "write", "apply_patch"]) {
      expect(review.agent.general.tools?.[name]).toBeUndefined();
    }
  });

  it("retire la délégation quand le tour n'a pas de fille à donner", () => {
    const none = job({
      subagents: { ...job().subagents, maxParallel: 0 },
    });
    expect(buildOpencodeConfig(none).agent[OPENCODE_PRIMARY_AGENT].tools?.task).toBe(false);
    expect(buildOpencodeConfig(job()).agent[OPENCODE_PRIMARY_AGENT].tools?.task).toBe(true);
  });

  it("laisse le superviseur arbitrer chaque délégation", () => {
    // `ask` et non `allow` : la demande porte le `subagent_type` et arrive AVANT
    // qu'opencode ne résolve l'agent — c'est le seul endroit d'où tenir le
    // plafond de simultané et rendre l'offre au modèle qui se trompe de nom.
    expect(buildOpencodeConfig(job()).permission.task).toBe("ask");
  });

  it("donne un agent par (mode × modèle offert), puisque `task` n'a pas de `model`", () => {
    const cfg = buildOpencodeConfig(job({ subagents: favorites() }));
    expect(Object.keys(cfg.agent).sort()).toEqual(
      [
        OPENCODE_PRIMARY_AGENT,
        "explore",
        "explore-anthropic-claude-haiku-4-5",
        "explore-anthropic-claude-opus-4-8",
        "general",
        "general-anthropic-claude-haiku-4-5",
        "general-anthropic-claude-opus-4-8",
      ].sort(),
    );
    expect(cfg.agent["explore-anthropic-claude-haiku-4-5"].model).toBe(
      `${OPENCODE_PROVIDER_ID}/anthropic/claude-haiku-4.5`,
    );
    // Le mode reste le mode : un modèle choisi ne rend pas une fille écrivante.
    expect(cfg.agent["explore-anthropic-claude-haiku-4-5"].tools).toEqual(
      cfg.agent.explore.tools,
    );
  });

  it("décrit chaque sous-agent — c'est la SEULE chose que le parent en lit", () => {
    // Sans `description`, opencode écrit « This subagent should only be called
    // manually by the user » dans la description du tool `task` : l'offre
    // disparaît et le modèle ne délègue plus.
    const cfg = buildOpencodeConfig(job({ subagents: favorites() }));
    for (const [name, agent] of Object.entries(cfg.agent)) {
      if (name === OPENCODE_PRIMARY_AGENT) continue;
      expect(agent.description?.length ?? 0).toBeGreaterThan(20);
    }
    const haiku = cfg.agent["general-anthropic-claude-haiku-4-5"].description ?? "";
    expect(haiku).toContain("Claude Haiku 4.5");
    expect(haiku).toContain("Middle gear.");
  });

  it("TARIFE tout modèle de fille qu'il offre, et n'offre pas ce qu'il ne sait pas tarifer", () => {
    // Un modèle déclaré sans `cost` rend `cost: 0` : une fille gratuite au
    // ledger. Ne pas l'offrir est le seul choix qui ne mente pas.
    const cfg = buildOpencodeConfig(job({ subagents: favorites() }));
    const models = cfg.provider[OPENCODE_PROVIDER_ID].models;
    expect(models["anthropic/claude-haiku-4.5"].cost).toEqual({ input: 1, output: 5 });
    expect(models["anthropic/claude-opus-4.8"].cost).toEqual({ input: 15, output: 75 });

    const unpriced = favorites();
    unpriced.pricing = { "anthropic/claude-haiku-4.5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 } };
    const partial = buildOpencodeConfig(job({ subagents: unpriced }));
    expect(partial.agent["general-anthropic-claude-opus-4-8"]).toBeUndefined();
    expect(partial.provider[OPENCODE_PROVIDER_ID].models["anthropic/claude-opus-4.8"]).toBeUndefined();
  });

  it("n'offre AUCUN autre modèle en BYOK", () => {
    // Même règle du tout ou rien que le champ `model` de `spawn_agent` : un run
    // BYOK Anthropic ne peut pas faire tourner `deepseek/…`.
    const byok = buildOpencodeConfig(job({ subagents: { ...favorites(), models: false } }));
    expect(Object.keys(byok.agent).sort()).toEqual([OPENCODE_PRIMARY_AGENT, "explore", "general"].sort());
    expect(Object.keys(byok.provider[OPENCODE_PROVIDER_ID].models)).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
  });

  it("borne la liste des modèles offerts", () => {
    // Chaque modèle coûte deux agents et deux lignes dans la description du tool
    // `task` : un réglage d'admin parti à trente la ferait grossir en silence.
    const many = favorites();
    many.favorites = Array.from({ length: MAX_SUBAGENT_MODELS + 4 }, (_, i) => ({
      id: `vendor/model-${i}`,
      label: `Model ${i}`,
      use_case: "x",
    }));
    many.pricing = Object.fromEntries(
      many.favorites.map((f) => [f.id, { inputUsdPerMTok: 1, outputUsdPerMTok: 2 }]),
    );
    const cfg = buildOpencodeConfig(job({ subagents: many }));
    expect(subagentAgentTable(job({ subagents: many })).filter((a) => a.modelId)).toHaveLength(
      MAX_SUBAGENT_MODELS * 2,
    );
    expect(Object.keys(cfg.agent)).toHaveLength(1 + 2 + MAX_SUBAGENT_MODELS * 2);
  });

  it("ne se propose jamais lui-même comme modèle de fille", () => {
    // Le modèle du run est déjà `explore` / `general` : le redonner sous un
    // deuxième nom offrirait deux fois la même chose.
    const same = favorites();
    same.favorites = [{ id: "deepseek/deepseek-v4-flash", label: "Same", use_case: "x" }];
    same.pricing = { "deepseek/deepseek-v4-flash": { inputUsdPerMTok: 1, outputUsdPerMTok: 2 } };
    expect(subagentAgentTable(job({ subagents: same })).filter((a) => a.modelId)).toEqual([]);
  });
});

describe("l'environnement du serveur", () => {
  it("passe tout par l'environnement, sans un seul fichier de config", () => {
    const env = opencodeServerEnv(job());
    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toEqual(buildOpencodeConfig(job()));
    expect(env.OPENCODE_DB).toBe(opencodeDbPath(LAYOUT));
  });

  it("garde l'état d'opencode HORS du dépôt", () => {
    // Sinon le `git add -A` de fin de tour emporte la base de la conversation
    // dans un commit du dépôt de l'utilisateur (même règle que le harness).
    expect(opencodeDbPath(LAYOUT).startsWith(`${LAYOUT.repoDir}/`)).toBe(false);
    expect(opencodeAnchorFile(LAYOUT).startsWith(`${LAYOUT.repoDir}/`)).toBe(false);
  });

  it("ramène les TROIS dossiers d'opencode sous le harness, pas seulement la config", () => {
    /**
     * Mesuré le 2026-08-12 sur le binaire : `XDG_DATA_HOME` reçoit
     * `opencode/repos/` — des **dépôts git de snapshot** — et `opencode/log/`.
     * Laissés au `$HOME` de la microVM, ils sont hors de notre portée : un
     * `$HOME` absent, ou posé sur le dépôt par une image de sandbox, ramènerait
     * des dépôts git entiers dans le commit du tour.
     */
    const env = opencodeServerEnv(job());
    for (const dir of [env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME]) {
      expect(dir.startsWith(`${LAYOUT.harnessDir}/`)).toBe(true);
      expect(dir.startsWith(`${LAYOUT.repoDir}/`)).toBe(false);
    }
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

/**
 * MIN-354 — LE DÉCOR SUIT LE RUN, ET PAS UNE CONSTANTE.
 *
 * Six chemins d'opencode étaient des `const` de module sous
 * `/vercel/sandbox/harness`. Ce que ce bloc garde n'est pas leur valeur, c'est
 * qu'aucun ne soit resté en arrière : un seul chemin figé et **deux runs d'une
 * même machine partageraient une base SQLite**, un fichier d'ancrage et un
 * dossier de tools — chacun réécrivant le décor de l'autre.
 */
describe("un run qui ne vit pas dans une microVM", () => {
  const LOCAL = layoutForRoot("/Users/dev/Library/Application Support/minddy/runs/r-7", "/Users/dev/oc");
  const local = () => job({ layout: LOCAL });

  it("pose TOUT l'état d'opencode sous le harness DE CE RUN", () => {
    const env = opencodeServerEnv(local());
    for (const value of [env.OPENCODE_DB, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME]) {
      expect(value.startsWith(`${LOCAL.harnessDir}/`)).toBe(true);
    }
    // Et plus rien ne pointe vers la microVM.
    expect(JSON.stringify(env)).not.toContain("/vercel/");
  });

  it("donne au shell d'opencode le dépôt DE CE RUN", () => {
    expect(opencodeServerEnv(local()).OPENCODE_SHELL_CWD).toBe(LOCAL.repoDir);
  });

  it("fait lire l'ancrage là où le superviseur l'écrit", () => {
    expect(buildOpencodeConfig(local()).instructions).toEqual([opencodeAnchorFile(LOCAL)]);
  });

  it("ne partage aucun de ces chemins avec un autre run", () => {
    const other = layoutForRoot("/Users/dev/Library/Application Support/minddy/runs/r-8", "/Users/dev/oc");
    const mine = opencodeServerEnv(local());
    const theirs = opencodeServerEnv(job({ layout: other }));
    for (const key of ["OPENCODE_DB", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "OPENCODE_SHELL_CWD"] as const) {
      expect(mine[key]).not.toBe(theirs[key]);
    }
  });
});
