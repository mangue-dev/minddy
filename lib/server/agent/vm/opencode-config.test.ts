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
  OPENCODE_BASH_TIMEOUT_MS,
} from "./opencode-config";
import { cloudLayout, layoutForRoot } from "../harness-layout";
import { VM_PROTOCOL_VERSION, type VmJob } from "./protocol";

/**
 * MIN-286 batch 1 — one round opencode config.
 *
 * What this file keeps, and which is not reread: **the config is what SAYS this
 * that a trick has the right to do**. A read-only replay, a cap of
 * spend, a key placeholder — all of this stops being loop code for
 * become a JSON document, and a document does not throw when it is false. He
 * turns, and the turn does something other than what we think.
 *
 * The values ​​stated here are not tastes: each was **measured on
 * `opencode-ai@1.18.16`** (see the header of `opencode-config.ts`). The two who
 * would cost the most to rediscover:
 * - a model declared WITHOUT `cost` returns `cost: 0`, exact tokens — the ledger is
 *    would empty silently;
 * - flat `reasoning_effort` is removed from the request body, the form
 * nested pass.
 */

/**
 * MIN-354 — the job carries its layout, and all the paths in the config derive from it.
 * The fixture keeps that of the microVM (nothing moves in production); the last
 * block of the file verifies that EVERYTHING follows when the root changes.
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
    repoMode: "clone",
    committer: { name: "minddy agent", email: "agent@minddy.app" },
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
    // The OpenAI-compatible layer: it is the only wire format that our five
    // providers all speak (see agent-providers.ts).
    expect(provider.npm).toBe("@ai-sdk/openai-compatible");
  });

  it("réfère le modèle par `provider/modèle`, slash du modèle compris", () => {
    // Measured: opencode cuts at FIRST slash. A slash id (the normal case with
    // OpenRouter) therefore passes through intact.
    const cfg = buildOpencodeConfig(job());
    expect(cfg.model).toBe("minddy/deepseek/deepseek-v4-flash");
    expect(cfg.small_model).toBe(cfg.model);
    expect(Object.keys(cfg.provider[OPENCODE_PROVIDER_ID].models)).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
  });

  it("déclare la modalité image, sans quoi une maquette est remplacée par une erreur", () => {
    // MEASURED (§2.22): `attachment: true` alone is NOT enough. The binary tests
    // `capabilities.input.image`, which is declared by `modalities.input` — without
    // without it, opencode replaces the image with « ERROR: Cannot read … (this model does
    // not support image input). Inform the user. » and the model warns
    // the user of a limit that does not exist.
    const withImages = buildOpencodeConfig(job({ imageInput: true }));
    const model =
      withImages.provider[OPENCODE_PROVIDER_ID].models[
        "deepseek/deepseek-v4-flash"
      ];
    expect(model.attachment).toBe(true);
    expect(model.modalities).toEqual({
      input: ["text", "image"],
      output: ["text"],
    });

    // And the opposite: a run whose model does not see the images does not announce it
    // not — the control plan will not help him either.
    const without = buildOpencodeConfig(job({ imageInput: false }));
    const blind =
      without.provider[OPENCODE_PROVIDER_ID].models[
        "deepseek/deepseek-v4-flash"
      ];
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
    expect(
      cfg.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"]
        .cost,
    ).toEqual({
      input: 3,
      output: 15,
      cache_read: 0.3,
      cache_write: 3.75,
    });
  });

  it("n'invente aucun prix quand le job n'en porte pas", () => {
    // BYOK outside OpenRouter index. The cost returned will be worth zero, and it is
    // supervisor to write the usage in `estimated` — not the config to lie.
    const cfg = buildOpencodeConfig(job({ pricing: undefined }));
    expect(
      cfg.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"]
        .cost,
    ).toBeUndefined();
  });

  it("passe le raisonnement sous sa forme IMBRIQUÉE, la seule qui survive", () => {
    const cfg = buildOpencodeConfig(job({ reasoningLevel: "high" }));
    const model =
      cfg.provider[OPENCODE_PROVIDER_ID].models["deepseek/deepseek-v4-flash"];
    expect(model.options).toEqual({ reasoning: { effort: "high" } });
    expect(model.reasoning).toBe(true);
    // Measured: `reasoning_effort` flat is REMOVED from the body by opencode on
    // the main call. Writing it here would result in a setting that never goes away.
    expect(JSON.stringify(model.options)).not.toContain("reasoning_effort");
  });

  it("ne dit rien du raisonnement quand il est coupé", () => {
    const model = buildOpencodeConfig(job({ reasoningLevel: "off" })).provider[
      OPENCODE_PROVIDER_ID
    ].models["deepseek/deepseek-v4-flash"];
    expect(model.options).toBeUndefined();
    expect(model.reasoning).toBeUndefined();
  });
});

describe("canonical OpenCode capabilities", () => {
  it("auto-grants model actions without removing native tools", () => {
    const variants = [
      buildOpencodeConfig(job()),
      buildOpencodeConfig(job({ writesToRepo: false, anchor: "pr" })),
      buildOpencodeConfig(job({ interactive: false })),
      buildOpencodeConfig(job({ controlToken: "local-token" })),
    ];
    for (const cfg of variants) {
      expect(cfg.permission).toEqual({ "*": "allow" });
      expect(cfg.tools).toEqual({});
      expect(cfg.agent[OPENCODE_PRIMARY_AGENT].tools).toEqual({});
      expect(cfg.agent[OPENCODE_PRIMARY_AGENT].permission).toEqual({
        "*": "allow",
      });
    }
  });
});

/**
 * Sub-agents (MIN-286, lot 2, task 12).
 *
 * Two measurements from 2026-08-12 decide everything that follows, and neither
 * guess: the tool `task` has **no** field `model` (the model of a girl
 * comes from `agent.<id>.model`), and the server's tools folder is served to
 * EVERYONE — a girl therefore receives the 32 domain tools as long as one
 * `"*": false` does not take them away.
 */
describe("les sous-agents", () => {
  const favorites = (): VmJob["subagents"] => ({
    models: true,
    favorites: [
      {
        id: "anthropic/claude-haiku-4.5",
        label: "Claude Haiku 4.5",
        use_case: "Middle gear.",
      },
      {
        id: "anthropic/claude-opus-4.8",
        label: "Claude Opus 4.8",
        use_case: "Hard analysis.",
      },
    ],
    maxParallel: 2,
    allowedIds: [],
    abovePlanIds: [],
    maxMultiplier: null,
    pricing: {
      "anthropic/claude-haiku-4.5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
      "anthropic/claude-opus-4.8": {
        inputUsdPerMTok: 15,
        outputUsdPerMTok: 75,
      },
    },
  });

  it("keeps delegation depth bounded by OpenCode", () => {
    const cfg = buildOpencodeConfig(job());
    expect(cfg.subagent_depth).toBe(1);
    // The joker removes `task` from the girl's game, and the ACL says it again: the
    // Cascading delegation is structural, never a prompt sentence.
    expect(cfg.agent.general.tools?.["*"]).toBe(false);
    expect(cfg.agent.general.tools?.task).toBeUndefined();
    expect(cfg.agent.general.permission).toEqual({ "*": "allow" });
  });

  it("fait de `explore` une lecture seule PAR SON JEU DE TOOLS", () => {
    const explore = buildOpencodeConfig(job()).agent.explore;
    expect(explore.mode).toBe("subagent");
    expect(explore.tools).toEqual({
      "*": false,
      read: true,
      grep: true,
      glob: true,
    });
    expect(explore.permission?.["*"]).toBe("deny");
  });

  it("retire à une fille les tools de DOMAINE, qui appartiennent au parent", () => {
    // `SUBAGENT_FORBIDDEN_TOOLS` (MIN-112): the ticket, the notebook, the sweaters
    // requests, the session plan. Without the `"*": false`, they were served —
    // they live in the server's tools folder, so everyone.
    const cfg = buildOpencodeConfig(job());
    for (const agent of [cfg.agent.explore, cfg.agent.general]) {
      expect(agent.tools?.["*"]).toBe(false);
      for (const name of [
        "update_issue",
        "create_pr",
        "update_plan",
        "read_scratchpad",
      ]) {
        expect(agent.tools?.[name]).toBeUndefined();
      }
    }
    // `web_search` is the only exception, and it is that of `subagentToolsFor`:
    // it is charged and capped by us, not forbidden to a girl.
    expect(cfg.agent.general.tools?.web_search).toBe(true);
    expect(
      buildOpencodeConfig(job({ webSearch: false })).agent.general.tools
        ?.web_search,
    ).toBe(undefined);
  });

  it("keeps all three editing interfaces for implementation sub-agents", () => {
    // It is opencode which decides according to the model OF THE GIRL (`apply_patch` on
    // the `gpt-*`): designating one here would freeze it on that of the parent.
    const cfg = buildOpencodeConfig(job());
    for (const name of ["edit", "write", "apply_patch"]) {
      expect(cfg.agent.general.tools?.[name]).toBe(true);
      expect(cfg.agent.explore.tools?.[name]).toBeUndefined();
    }
    const review = buildOpencodeConfig(job({ writesToRepo: false }));
    for (const name of ["edit", "write", "apply_patch"]) {
      expect(review.agent.general.tools?.[name]).toBe(true);
    }
  });

  it("does not hide delegation through a run-mode tool profile", () => {
    const none = job({
      subagents: { ...job().subagents, maxParallel: 0 },
    });
    expect(
      buildOpencodeConfig(none).agent[OPENCODE_PRIMARY_AGENT].tools?.task,
    ).toBeUndefined();
    expect(
      buildOpencodeConfig(job()).agent[OPENCODE_PRIMARY_AGENT].tools?.task,
    ).toBeUndefined();
  });

  it("auto-grants delegation", () => {
    expect(buildOpencodeConfig(job()).permission).toEqual({ "*": "allow" });
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
    // Fashion remains fashion: a chosen model does not make a girl write.
    expect(cfg.agent["explore-anthropic-claude-haiku-4-5"].tools).toEqual(
      cfg.agent.explore.tools,
    );
  });

  it("décrit chaque sous-agent — c'est la SEULE chose que le parent en lit", () => {
    // Without `description`, opencode writes “This subagent should only be called
    // manually by the user” in the description of the tool `task`: the offer
    // disappears and the model no longer delegates.
    const cfg = buildOpencodeConfig(job({ subagents: favorites() }));
    for (const [name, agent] of Object.entries(cfg.agent)) {
      if (name === OPENCODE_PRIMARY_AGENT) continue;
      expect(agent.description?.length ?? 0).toBeGreaterThan(20);
    }
    const haiku =
      cfg.agent["general-anthropic-claude-haiku-4-5"].description ?? "";
    expect(haiku).toContain("Claude Haiku 4.5");
    expect(haiku).toContain("Middle gear.");
  });

  it("TARIFE tout modèle de fille qu'il offre, et n'offre pas ce qu'il ne sait pas tarifer", () => {
    // A model declared without `cost` makes `cost: 0`: a free girl at
    // ledger. Not offering it is the only choice that doesn't lie.
    const cfg = buildOpencodeConfig(job({ subagents: favorites() }));
    const models = cfg.provider[OPENCODE_PROVIDER_ID].models;
    expect(models["anthropic/claude-haiku-4.5"].cost).toEqual({
      input: 1,
      output: 5,
    });
    expect(models["anthropic/claude-opus-4.8"].cost).toEqual({
      input: 15,
      output: 75,
    });

    const unpriced = favorites();
    unpriced.pricing = {
      "anthropic/claude-haiku-4.5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
    };
    const partial = buildOpencodeConfig(job({ subagents: unpriced }));
    expect(partial.agent["general-anthropic-claude-opus-4-8"]).toBeUndefined();
    expect(
      partial.provider[OPENCODE_PROVIDER_ID].models[
        "anthropic/claude-opus-4.8"
      ],
    ).toBeUndefined();
  });

  it("n'offre AUCUN autre modèle en BYOK", () => {
    // Same all-or-nothing rule as the `model` field of `spawn_agent`: one run
    // BYOK Anthropic cannot run `deepseek/…`.
    const byok = buildOpencodeConfig(
      job({ subagents: { ...favorites(), models: false } }),
    );
    expect(Object.keys(byok.agent).sort()).toEqual(
      [OPENCODE_PRIMARY_AGENT, "explore", "general"].sort(),
    );
    expect(Object.keys(byok.provider[OPENCODE_PROVIDER_ID].models)).toEqual([
      "deepseek/deepseek-v4-flash",
    ]);
  });

  it("borne la liste des modèles offerts", () => {
    // Each model costs two agents and two lines in the tool description
    // `task`: an admin setting of thirty would make it grow silently.
    const many = favorites();
    many.favorites = Array.from(
      { length: MAX_SUBAGENT_MODELS + 4 },
      (_, i) => ({
        id: `vendor/model-${i}`,
        label: `Model ${i}`,
        use_case: "x",
      }),
    );
    many.pricing = Object.fromEntries(
      many.favorites.map((f) => [
        f.id,
        { inputUsdPerMTok: 1, outputUsdPerMTok: 2 },
      ]),
    );
    const cfg = buildOpencodeConfig(job({ subagents: many }));
    expect(
      subagentAgentTable(job({ subagents: many })).filter((a) => a.modelId),
    ).toHaveLength(MAX_SUBAGENT_MODELS * 2);
    expect(Object.keys(cfg.agent)).toHaveLength(
      1 + 2 + MAX_SUBAGENT_MODELS * 2,
    );
  });

  it("ne se propose jamais lui-même comme modèle de fille", () => {
    // The run model is already `explore` / `general`: restore it under a
    // second name would offer the same thing twice.
    const same = favorites();
    same.favorites = [
      { id: "deepseek/deepseek-v4-flash", label: "Same", use_case: "x" },
    ];
    same.pricing = {
      "deepseek/deepseek-v4-flash": { inputUsdPerMTok: 1, outputUsdPerMTok: 2 },
    };
    expect(
      subagentAgentTable(job({ subagents: same })).filter((a) => a.modelId),
    ).toEqual([]);
  });
});

describe("l'environnement du serveur", () => {
  it("passe tout par l'environnement, sans un seul fichier de config", () => {
    const env = opencodeServerEnv(job());
    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toEqual(
      buildOpencodeConfig(job()),
    );
    expect(env.OPENCODE_DB).toBe(opencodeDbPath(LAYOUT));
  });

  it("garde l'état d'opencode HORS du dépôt", () => {
    // Otherwise the `git add -A` at the end of the turn takes away the basis of the conversation
    // in a commit of the user's repository (same rule as the harness).
    expect(opencodeDbPath(LAYOUT).startsWith(`${LAYOUT.repoDir}/`)).toBe(false);
    expect(opencodeAnchorFile(LAYOUT).startsWith(`${LAYOUT.repoDir}/`)).toBe(
      false,
    );
  });

  it("ramène les TROIS dossiers d'opencode sous le harness, pas seulement la config", () => {
    /**
     * Measured on 2026-08-12 on binary: `XDG_DATA_HOME` receives
     * `opencode/repos/` — **snapshot git repositories** — and `opencode/log/`.
     * Left at `$HOME` of the microVM, they are beyond our reach: a
     * `$HOME` absent, or placed on the repository by a sandbox image, would bring back
     * entire git repositories in the tour commit.
     */
    const env = opencodeServerEnv(job());
    for (const dir of [
      env.XDG_CONFIG_HOME,
      env.XDG_DATA_HOME,
      env.XDG_CACHE_HOME,
    ]) {
      expect(dir.startsWith(`${LAYOUT.harnessDir}/`)).toBe(true);
      expect(dir.startsWith(`${LAYOUT.repoDir}/`)).toBe(false);
    }
  });

  it("ne dépend d'aucun service en ligne pour démarrer", () => {
    const env = opencodeServerEnv(job());
    expect(env.OPENCODE_DISABLE_MODELS_FETCH).toBe("1");
    expect(env.OPENCODE_DISABLE_AUTOUPDATE).toBe("1");
  });

  it("applies the bash command timeout explicitly", () => {
    expect(
      opencodeServerEnv(job()).OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS,
    ).toBe(String(OPENCODE_BASH_TIMEOUT_MS));
  });
});

describe("aucun secret ne peut entrer dans la config", () => {
  /**
   * The mirror of [vm-bundle-secrets.test.ts](../vm-bundle-secrets.test.ts), of
   * OUTPUT side: this test keeps the bundle import graph, this one
   * keeps the document that the bundle produces. The two together say "nothing
   * “what goes into the microVM doesn’t hold a secret.”
   *
   * The fault it catches has no symptoms: the config works perfectly
   * with a real key inside — even better, since the firewall would no longer have
   * nothing to transform. It is only seen on the day the model does `env` or
   * reads `~/.config`, and that day it is too late.
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
    // `authUrl` carries an ephemeral token from the forge. He has nothing to do in a
    // config read by the harness — and it would end up in the server logs.
    expect(opencodeServerEnv(job()).OPENCODE_CONFIG_CONTENT).not.toContain(
      "ghs_TOKEN_SECRET",
    );
  });

  it("n'emporte rien du job qui ne serve pas à opencode", () => {
    // The job carries the history, the edited paths, the origin of the plan
    // control. The config doesn't want any: what doesn't fit there can't fit into it.
    // to go out. Assertion on FIRST level keys, so that adding a
    // adding a field must be a conscious change.
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
 * MIN-354 — THE DECOR FOLLOWS THE RUN, AND NOT A CONSTANT.
 *
 * Six opencode paths were module `const` under
 * `/vercel/sandbox/harness`. What this block keeps is not their value, it is
 * that no one remained behind: a single fixed path and **two runs of a
 * same machine would share an SQLite** database, an anchor file and a
 * tools folder — each rewriting the decor of the other.
 */
describe("un run qui ne vit pas dans une microVM", () => {
  const LOCAL = layoutForRoot(
    "/Users/dev/Library/Application Support/minddy/runs/r-7",
    "/Users/dev/oc",
  );
  const local = () => job({ layout: LOCAL });

  it("pose TOUT l'état d'opencode sous le harness DE CE RUN", () => {
    const env = opencodeServerEnv(local());
    for (const value of [
      env.OPENCODE_DB,
      env.XDG_CONFIG_HOME,
      env.XDG_DATA_HOME,
      env.XDG_CACHE_HOME,
    ]) {
      expect(value.startsWith(`${LOCAL.harnessDir}/`)).toBe(true);
    }
    // And nothing points to the microVM anymore.
    expect(JSON.stringify(env)).not.toContain("/vercel/");
  });

  // MIN-363: `OPENCODE_SHELL_CWD` was removed — the variable does not exist in
  // binary (0 occurrences in 1.18.16). What gives its deposit to the server is
  // the client's `directory`, not the environment. Nothing to be assured here.

  it("fait lire l'ancrage là où le superviseur l'écrit", () => {
    expect(buildOpencodeConfig(local()).instructions).toEqual([
      opencodeAnchorFile(LOCAL),
    ]);
  });

  it("ne partage aucun de ces chemins avec un autre run", () => {
    const other = layoutForRoot(
      "/Users/dev/Library/Application Support/minddy/runs/r-8",
      "/Users/dev/oc",
    );
    const mine = opencodeServerEnv(local());
    const theirs = opencodeServerEnv(job({ layout: other }));
    for (const key of [
      "OPENCODE_DB",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_CACHE_HOME",
    ] as const) {
      expect(mine[key]).not.toBe(theirs[key]);
    }
  });
});

/**
 * MIN-360 — THE SAFEGUARDS THAT GOING LOCAL MAKES OBLIGATORY.
 *
 * Two things here, and the second matters as much as the first: what the config
 * CLOSED for everyone (auto-discovery of plugins and config from a repository),
 * and what it ONLY tightens on the local path — because tightening the
 * runs cloud would make them pay a round trip permission per read for a
 * a risk that does not exist in a disposable clone.
 *
 * What distinguishes a local job from a cloud job is the presence of the token
 * (`isLocalJob`), and this is intended: a `local: true` flag next to it would be
 * a second truth about the same fact.
 */
describe("l'auto-découverte depuis le dépôt (MIN-360)", () => {
  it("coupe les plugins et la config de projet, dans les deux mondes", () => {
    // Measured in binary 1.18.16: `pure` empty `plugin_origins` server side,
    // `DISABLE_PROJECT_CONFIG` stops the ascent to `.opencode/` and
    // `opencode.json`. Without them, the contents of a repository execute code.
    for (const j of [job(), job({ controlToken: "jeton" })]) {
      const env = opencodeServerEnv(j);
      expect(env.OPENCODE_PURE).toBe("1");
      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("1");
      // MIN-368: no default plugin or speculative FFF index should be
      // delay the first prompt. Standard tools remain served by
      // OpenCode and our tools are explicitly declared by the harness.
      expect(env.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBe("1");
      expect(env.OPENCODE_DISABLE_FFF).toBe("1");
      // MIN-364, lot 9: `skill` must never implicitly pick up the
      // skills Claude Code / HOME agents nor those of the depot. The day when
      // Minddy uses them, they go through `skills.paths`, explicitly named.
      expect(env.OPENCODE_DISABLE_EXTERNAL_SKILLS).toBe("1");
      // `ask_user` is tool `question`. His presence is now a contract
      // of the local path (D7), not an effect of the client `cli` chosen by default.
      expect(env.OPENCODE_ENABLE_QUESTION_TOOL).toBe("1");
    }
  });

  it("garde NOTRE dossier de tools, qui ne passe pas par cette remontée", () => {
    // `Path.config` (therefore `XDG_CONFIG_HOME`) remains included unconditionally:
    // the ~35 domain tools are served, the hatch does not take them.
    const env = opencodeServerEnv(job());
    expect(env.XDG_CONFIG_HOME).toBe(`${LAYOUT.harnessDir}/config`);
  });

  it("rend explicitement les conventions du dépôt qu'elle vient de lui retirer", () => {
    const repoFiles = [
      `${LAYOUT.repoDir}/AGENTS.md`,
      `${LAYOUT.repoDir}/CLAUDE.md`,
    ];
    const cfg = buildOpencodeConfig(job(), { repoInstructionFiles: repoFiles });
    // The minddy anchor FIRST: it's ours, and it's non-negotiable.
    expect(cfg.instructions).toEqual([
      opencodeAnchorFile(LAYOUT),
      ...repoFiles,
    ]);
  });

  it("n'invente aucun fichier quand le superviseur n'en a trouvé aucun", () => {
    expect(buildOpencodeConfig(job()).instructions).toEqual([
      opencodeAnchorFile(LAYOUT),
    ]);
  });
});

describe("local and cloud capability parity", () => {
  const cloud = () => buildOpencodeConfig(job());
  const onMachine = () =>
    buildOpencodeConfig(job({ controlToken: "jeton-de-bail" }));

  it("keeps native tools and permissions identical", () => {
    expect(onMachine().permission).toEqual(cloud().permission);
    expect(onMachine().tools).toEqual(cloud().tools);
    expect(onMachine().agent[OPENCODE_PRIMARY_AGENT]).toEqual(
      cloud().agent[OPENCODE_PRIMARY_AGENT],
    );
    expect(onMachine().agent.explore.tools).toEqual(
      cloud().agent.explore.tools,
    );
    expect(onMachine().agent.general.tools).toEqual(
      cloud().agent.general.tools,
    );
  });
});
