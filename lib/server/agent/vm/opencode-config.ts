import type { HarnessLayout } from "../harness-layout";
import { RUN_COMMAND_TIMEOUT_MS } from "../tools";
import { isLocalJob, type VmJob } from "./protocol";

/**
 * THE OPENCODE CONFIG FOR A LAP (MIN-286, batch 1) — what the supervisor asks
 * in `OPENCODE_CONFIG_CONTENT` before starting `opencode serve`.
 *
 * A PUR module: it takes the `VmJob` that the function has already written and returns a
 * JSON document. No IO, no secrets, no environment reading — it's
 * which makes it unit testable, and this is also what the mirror test of
 * [vm-bundle-secrets.test.ts](../vm-bundle-secrets.test.ts) checks on its
 * OUTPUT: the model key never enters the microVM, the firewall installs it
 * after exit and opencode sends the job placeholder.
 *
 * EVERYTHING GOES THROUGH THE ENVIRONMENT, WITHOUT A FILE. `OPENCODE_CONFIG_CONTENT` carries
 * the entire document — measured on `opencode-ai@1.18.16`: the server started with
 * gives him exactly this document on `GET /config`, in-house provider included.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS MEASURED, AND WHO DECIDED ON THE FORM BELOW
 *
 * (Real headless server, fake local OpenAI-compatible endpoint to read the
 * body of requests without spending a template. Figures are reproducible.)
 *
 * 1. **ONLY ONE PROVIDER, OURS, AND WE ARE THE ONE WHO PRICES IT.** We declare
 * `provider.minddy` on `@ai-sdk/openai-compatible` with the `baseURL` of the job.
 * This is the only form that covers the FIVE providers in the registry
 *    ([agent-providers.ts](../../../agent-providers.ts)) without changing the wire
 * format: all are addressed in `<baseUrl>/chat/completions` + `Bearer`.
 *
 * The consequence cannot be guessed: **a model declared without `cost`
 * makes `cost: 0`** — measured, exact tokens and zero cost, which would empty the
 * ledger in silence. With `cost` declared, opencode calculates to the nearest decimal
 * (1,000 in / 200 out at $3 / $15 → `0.006`, correct). Hence `job.pricing`:
 * **we give our prices**, those of the OpenRouter index, rather than depending on the
 * catalog models.dev. This resolves the only risk that the probe
 * cost of batch 0 had left open (docs/harness-opencode.md §2.5): the
 * CATALOG DRIFT. Unknown prices (BYOK excluding index) → no `cost`, and the
 * supervisor should mark the usage `estimated` rather than writing a zero.
 *
 * 2. **A slash model id passes.** `"minddy/deepseek/deepseek-chat-v3.1"` is
 * cut to FIRST `/`: provider `minddy`, model `deepseek/deepseek-chat-v3.1`.
 * Measured end-to-end, right down to the request body.
 *
 * 3. **The reasoning ONLY passes in its nested form.** `options.reasoning
 * = { effort }` (the OpenRouter form) arrives intact in the body; `options.
 * flat reasoning_effort` is **removed** by opencode on the main call
 * (it survives on the small model, which makes the fault all the more discreet).
 * OpenAI and Gemini, which expect the FLAT form, therefore lose their level of
 *    reasoning in 1.18.16; Anthropic expects its own `thinking` form:
 * this is the local proxy of
 * supervisor (§2.6 of the file) who will reinject him, and this is his second
 * reason for being after `generation_id`.
 *
 * 4. **`tools: { x: false }` does not REMOVE the integrated tool `x`**: it uses it when
 * same and sets a `deny` permission. What really takes away from an integrated is
 * the set of AGENT tools (`agent.<id>.tools`) — hence the two, placed
 * together: the global map for permission, the agent's game for
 *    absence.
 *
 * ⚠ **The “always served” conclusion was false** (MIN-362, MIN-363), and
 * the correction is due to the fact that there are TWO catalogs, which do not say the
 * same thing. A NU `deny` actually removes the tool from what is **offered
 * to model** — measured in the body of the request to the provider: `websearch`
 * and `todowrite` are not “refused”, they are not there. What continues to
 * list them, it is `GET /experimental/tool`, the REST catalog — the one that
 * read our probes, not the one the model reads. The measure was right;
 * the place to read it was not
 *    ([opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts),
 *    docs/harness-opencode.md §2.32).
 *
 * 5. **`agent.<id>.prompt` REPLACES the built-in system prompt**, and the
 * `instructions` are FILE PATHS whose contents are added to the
 * system message (measured: marker found in the body). minddy anchor
 * therefore travels through a file that the supervisor writes under `harnessDir` —
 * outside the depot, so that the `git add -A` at the end of the turn does not win
 * never in a commit from the user's repository.
 */

/** The provider id that we declare. Just one, regardless of the BYOK behind it. */
export const OPENCODE_PROVIDER_ID = "minddy";

/** The AI ​​SDK package that this provider loads: the OpenAI-compatible layer. */
export const OPENCODE_PROVIDER_NPM = "@ai-sdk/openai-compatible";

/** The PRIMARY agent of a round — the one that receives the prompt from the user. */
export const OPENCODE_PRIMARY_AGENT = "build";

/**
 * OPENCODE PATHS, DERIVED FROM THE RUN LAYOUT (MIN-354).
 *
 * These were six module constants under `/vercel/sandbox/harness`. The trap
 * that they wore was not only `/vercel`: two runs launched at the
 * suite on the same machine would have shared **a single SQLite database**, a single
 * anchor file and a single tools folder — each rewriting the scenery of
 * the other, with symptoms that do not resemble their cause.
 */

/** The minddy anchor file, added to the system prompt by `instructions`. */
export function opencodeAnchorFile(layout: HarnessLayout): string {
  return `${layout.harnessDir}/minddy-anchor.md`;
}

/** Where the opencode state lives: SQLite, outside the repository (see §5). */
export function opencodeDbPath(layout: HarnessLayout): string {
  return `${layout.harnessDir}/opencode.db`;
}

/**
 * The `XDG_CONFIG_HOME` of the server, and the resulting tools folder.
 *
 * Measured: `$XDG_CONFIG_HOME/opencode/tool/*.ts` is loaded exactly as the
 * `.opencode/tool/` of a project — served to the model AND called. This is what allows
 * to ~35 living domain tools **outside the depot**: in the depot, they
 * would enter the end of turn `git add -A` and find themselves committed
 * at the user.
 */
export function opencodeConfigHome(layout: HarnessLayout): string {
  return `${layout.harnessDir}/config`;
}
export function opencodeToolDir(layout: HarnessLayout): string {
  return `${opencodeConfigHome(layout)}/opencode/tool`;
}

/**
 * THE TWO OTHER OPENCODE FILES, also brought back under `harnessDir`.
 *
 * Measured on 2026-08-12 (real server, disposable git repository): `XDG_DATA_HOME` receives
 * `opencode/repos/` — the working **snapshots**, which are git repositories —, and
 * `opencode/log/` ; `XDG_CACHE_HOME` receives the downloaded binaries. Without these
 * two variables, all this goes into the `$HOME` of the microVM: outside the repository,
 * so never in a `git add -A`, but out of our reach too — a
 * `$HOME` absent or placed on the repository by a sandbox image would be sufficient to
 * bringing entire git repositories into the tour commit. All state of opencode
 * fits under a single folder, and this folder is sibling to the repository.
 */
export function opencodeDataHome(layout: HarnessLayout): string {
  return `${layout.harnessDir}/data`;
}
export function opencodeCacheHome(layout: HarnessLayout): string {
  return `${layout.harnessDir}/cache`;
}

/**
 * Tool output truncation. Opencode defaults, restated here
 * because a defect that moves within one release would silently move a
 * boundary that the product knows (`READ_MAX_LINES`, `READ_MAX_BYTES`).
 */
const TOOL_OUTPUT = { max_lines: 2000, max_bytes: 250_000 } as const;

type PermissionAction = "allow" | "ask" | "deny";
type PermissionRule = PermissionAction | Record<string, PermissionAction>;

export interface OpencodeAgentConfig {
  mode?: "primary" | "subagent" | "all";
  model?: string;
  prompt?: string;
  description?: string;
  tools?: Record<string, boolean>;
  permission?: Record<string, PermissionRule>;
  maxSteps?: number;
}

export interface OpencodeConfig {
  $schema: string;
  model: string;
  small_model: string;
  /** Hierarchy at ONE level: a girl does not delegate (see `subagentToolsFor`). */
  subagent_depth: number;
  default_agent: string;
  instructions: string[];
  provider: Record<
    string,
    {
      npm: string;
      name: string;
      options: { apiKey: string; baseURL: string };
      models: Record<string, OpencodeModelDef>;
    }
  >;
  tools: Record<string, boolean>;
  permission: Record<string, PermissionRule>;
  tool_output: { max_lines: number; max_bytes: number };
  agent: Record<string, OpencodeAgentConfig>;
  plugin: string[];
}

interface OpencodeModelDef {
  name: string;
  tool_call: true;
  attachment?: boolean;
  /** `input`/`output` in the sense of models.dev — cf. `modelDef` for what depends on it. */
  modalities?: { input: string[]; output: string[] };
  reasoning?: boolean;
  options?: Record<string, unknown>;
  cost?: { input: number; output: number; cache_read?: number; cache_write?: number };
  limit?: { context: number; output: number };
}

/**
 * The built-ins that we turn OFF, and why each one — the list is short because
 * the parity inventory (docs/harness-opencode.md §3) says the rest falls
 * right on top of ours.
 *
 * - `todowrite`: our checklist IS the ticket plan, and it synchronizes
 * ([plan-sync.ts](../plan-sync.ts)). A local todo cannot be read anywhere.
 * **Measured (MIN-364, batch 9)**: this tool does not write anywhere outside of opencode and
 * does not post any permissions. The “20 network entries” that the audit of 08/15
 *   criticized (§3 #12) actually targeted OUR `update_plan`, which mirrors to
 * the ticket plan — and that’s where we settled it (see `update_plan` in
 *   [supervisor.ts](supervisor.ts): an identical plan is not synchronized again).
 * Withdrawal therefore remains a PRODUCT decision – a single checklist – and not
 * a story of cost.
 * - `websearch`: it would neither carry the turn ceiling (`webSearchMax`) nor the
 * billing ([web-search.ts](../../web-search.ts)) — and it is definitely not
 * way not served on OpenRouter. Our domain `web_search` replaces it.
 * - `skill`: **and the reason written here was false** (MIN-364, lot 9). He said
 * “the skills read the microVM disk; there are none.” Measure :
 * the discovery reads **`$HOME`**, which the harness does not relocate — so, on
 * a Mac, `~/.claude/skills/` and `~/.agents/skills/`, plus the rise of the
 * session folder up to the root of the repository.
 *
 * So it’s not “nothing” that we’re removing, it’s **the Claude Code skills of
 * the user AND those of the repository**. And it is the second half which decides:
 * a `SKILL.md` is written by anyone who can commit, it is INSTRUCTED by
 * nature, and it enters the context without passing through our border note
 * ([repo-instructions.ts](../repo-instructions.ts)) — that is, exactly
 * the injection surface that batch 6 has just closed for `AGENTS.md`.
 *
 * The lever exists the day Minddy wants to serve HER skills:
 * `skills.paths` NAMES them, and survives `OPENCODE_DISABLE_EXTERNAL_SKILLS`
 * (measured, [opencode-capabilities.probe.test.ts](opencode-capabilities.probe.test.ts)).
 */
const DISABLED_BUILTINS = ["todowrite", "websearch", "skill"] as const;

/** Prompt-callable capabilities that are unsafe on a user's host. */
const LOCAL_DISABLED_BUILTINS = ["bash", "webfetch"] as const;

/** WRITE built-ins, removed from a session that is not writing (replay). */
const WRITE_BUILTINS = ["edit", "write", "apply_patch"] as const;

/** What a sub-agent `explore` has the right to do, and nothing else. */
const EXPLORE_TOOLS = ["read", "grep", "glob"] as const;

/**
 * HOW MANY GIRL MODELS ARE DECLARED AT MOST.
 *
 * Each model offered costs TWO agents (one per mode) and two lines in the
 * description of the tool `task` — this is where the model reads the offer (measured: the
 * serveur y colle « Available agent types and the tools they have access to: »
 * followed by a `- <nom>: <description>` per non-primary agent). The list of
 * favorites has four by default; this ceiling limits a list of admins who
 * would start at thirty, otherwise the description of the tool would grow without
 * no one sees it.
 */
export const MAX_SUBAGENT_MODELS = 8;

function modelRef(model: string): string {
  return `${OPENCODE_PROVIDER_ID}/${model}`;
}

/**
 * The job model, declared with us: its prices (§1), its window, its capacities.
 *
 * `tool_call: true` is a statement and not a measurement — a clear model
 * tool never leaves the agent catalog (`models-catalog.ts` the filter),
 * so whoever arrives here necessarily has some.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE IMAGES REQUEST **TWO** STATEMENTS, AND `attachment` IS NOT THE RIGHT ONE
 *
 * Measured on 2026-08-12 (file §2.22): with `attachment: true` alone, an image
 * rendered by a tool is well routed until the last moment, then **replaced
 * by an error text** just before the call — “ERROR: Cannot read "x.png"
 * (this model does not support image input). Inform the user. » Model reads
 * therefore a sentence which invites him to warn the user of a limit which does not exist
 * not, and the model is lost in silence.
 *
 * What the binary tests is `capabilities.input.image`, which is declared as
 * config by **`modalities.input`** — hence the two fields below, set
 * together and on the same `job.imageInput`. Never put one without the other.
 */
function modelDef(job: VmJob): OpencodeModelDef {
  const def: OpencodeModelDef = {
    name: job.model,
    tool_call: true,
    attachment: job.imageInput,
    modalities: {
      input: job.imageInput ? ["text", "image"] : ["text"],
      output: ["text"],
    },
  };
  if (job.pricing) {
    def.cost = {
      input: job.pricing.inputUsdPerMTok,
      output: job.pricing.outputUsdPerMTok,
      ...(job.pricing.cacheReadUsdPerMTok != null
        ? { cache_read: job.pricing.cacheReadUsdPerMTok }
        : {}),
      ...(job.pricing.cacheWriteUsdPerMTok != null
        ? { cache_write: job.pricing.cacheWriteUsdPerMTok }
        : {}),
    };
  }
  if (job.contextWindow) {
    // `output` is required by the schema as soon as `limit` is given. 8192 is the
    // `maxTokens` that our request profile is already sending (agent-providers.ts).
    def.limit = { context: job.contextWindow, output: 8192 };
  }
  const reasoning = reasoningOptions(job);
  if (reasoning) {
    def.reasoning = true;
    def.options = reasoning;
  }
  return def;
}

/**
 * TOUR MODELS: that of the run, plus one per sub-agent model offered.
 *
 * An undeclared model does not work — and a declared model without price makes
 * `cost: 0` (§1). The two reasons why this table is the same as
 * that of agents: what is priceless is not offered
 * (`subagentModelChoices`), and what is offered is priced here.
 *
 * The recommended `thinking_effort` of the favorite is NOT reported: the level of
 * reasoning is a TEMPLATE option at opencode, so asking it would be
 * to freeze it for all the girls of this model. They inherit that of the run,
 * exactly like `spawn_agent` without `thinking_effort`.
 */
function providerModels(job: VmJob): Record<string, OpencodeModelDef> {
  const models: Record<string, OpencodeModelDef> = { [job.model]: modelDef(job) };
  const pricing = job.subagents.pricing ?? {};
  for (const entry of subagentAgentTable(job)) {
    if (!entry.modelId || models[entry.modelId]) continue;
    const price = pricing[entry.modelId];
    if (!price) continue;
    models[entry.modelId] = {
      name: entry.label ?? entry.modelId,
      tool_call: true,
      cost: {
        input: price.inputUsdPerMTok,
        output: price.outputUsdPerMTok,
        ...(price.cacheReadUsdPerMTok != null ? { cache_read: price.cacheReadUsdPerMTok } : {}),
        ...(price.cacheWriteUsdPerMTok != null ? { cache_write: price.cacheWriteUsdPerMTok } : {}),
      },
      ...(reasoningOptions(job) ? { reasoning: true, options: reasoningOptions(job)! } : {}),
    };
  }
  return models;
}

/**
 * The level of reasoning, in the ONLY form that survives (§3): nested.
 *
 * `off` is not said here — it is the absence of the field. Send `effort: "none"` to
 * an endpoint that does not know the field returns to 400, and our own
 * request profile already only sends it to providers that accept it.
 */
function reasoningOptions(job: VmJob): Record<string, unknown> | null {
  if (job.reasoningLevel === "off") return null;
  return { reasoning: { effort: job.reasoningLevel } };
}

/**
 * The permissions of the round — an ACL, last winning rule, `resource` overall.
 *
 * What they are NOT: order guardrail. `command-guard.ts` and
 * `repo-path.ts` remain pure functions replayed by the supervisor on
 * `POST /permission/:id/reply` — hence `bash: "ask"`, which is what GIVES IT the
 * hand. A global ACL cannot say “`rm -rf` outside the repository”, and a
 * rule that approves everything would take away the supervisor's point of control.
 */
function permissions(job: VmJob): Record<string, PermissionRule> {
  /**
   * `ask` AND NOT `allow` on a session which writes, and that is not
   * caution: `.git/` is not protected by anyone at opencode — measured, a
   * `write` over `<repository>/.git/config` overwrote it. `ask` is what gives the hand
   * to the supervisor, who replays `assertNotGit` and `resolveWithin`
   * ([opencode-permissions.ts](opencode-permissions.ts)).
   */
  const write: PermissionAction = job.writesToRepo ? "ask" : "deny";
  const local = isLocalJob(job);
  return {
    /**
     * `read` (MIN-360) — `allow` in microVM, `ask` on someone's machine.
     *
     * `allow` was not neutral: opencode BOOK `{"*.env": "ask", "*.env.*":
     * "ask", "*.env.example": "allow"}` in its default ruleset, our rules
     * are concatenated AFTER, and the last one to match wins — our `allow`
     * therefore deleted the question on `.env`. On a disposable clone, without
     * stake ; in current deposit mode, this is the user's real `.env`.
     *
     * We don't hand over their glob: we take the hand. A global `ask` passes
     * each reading by `decidePermission`, which is ours, tested, and does not depend
     * neither the concatenation order nor the glob semantics of a version.
     * The cost is one local loop HTTP round trip per read — the same
     * that `bash` has always paid.
     */
    read: local ? "ask" : "allow",
    glob: "allow",
    grep: "allow",
    /**
     * ⚠ THERE IS NO `list` HERE, AND THIS IS DELIBERATE (MIN-363).
     *
     * The `list: "allow"` line lived there; it didn't solve anything. **There is no
     * no tool `list` in 1.18.16.** Found on `GET /experimental/tool` of a
     * bare server (agent `build`, non-`gpt-*` model, therefore without `apply_patch`):
     * `invalid question bash read glob grep edit write task webfetch todowrite
     * skill`, and nothing else. It is `read` on a directory that lists
     * (docs/harness-opencode.md §3.1). An ACL placed on an action that does not exist
     * you never see yourself failing: it reads like a guarantee.
     */
    // Cloud commands retain the existing command guard. Local runs have no
    // prompt-callable shell because it would inherit the host's authority.
    bash: local ? "deny" : "ask",
    edit: write,
    // Second curtain only: permission `question` is NOT consulted
    // (measure). What really takes `ask_user` out of a routine is the game of
     // the agent's tools (`primaryTools`).
    question: job.interactive ? "ask" : "deny",
    /**
     * Cloud webfetch is bounded by the microVM firewall. Local webfetch is
     * removed because application-level URL classification cannot constrain
     * redirects, DNS rebinding, or arbitrary services reachable from the host.
     */
    webfetch: local ? "deny" : "allow",
    websearch: "deny",
    todowrite: "deny",
    /**
     * `ask` AND NOT `allow`: the permission request for a `task` bears the
     * `subagent_type` requested (measured: `patterns: ["explore-cheap"]`,
     * `metadata: {description, subagent_type}`), and it arrives BEFORE
     * that opencode does not resolve the agent. It is therefore the only place from which to hold the
     * two things that the config does not know how to say: the PARALLELISM CEILING
     * (`maxParallel`, set to `app_config`) and the word to the model when it
     * asks for a subagent that doesn't exist — "this is what's offered"
     * rather than “Unknown agent type”.
     */
    task: "ask",
    /** External paths are outside the capability set in every run mode. */
    external_directory: "deny",
  };
}

/** The global map of integrated people — permission, not withdrawal (§4). */
function toolMap(job: VmJob): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const name of DISABLED_BUILTINS) map[name] = false;
  if (isLocalJob(job)) for (const name of LOCAL_DISABLED_BUILTINS) map[name] = false;
  if (!job.writesToRepo) for (const name of WRITE_BUILTINS) map[name] = false;
  return map;
}

/**
 * The PRIMARY agent toolset: what remains of the built-ins after removal.
 *
 * `apply_patch` is left to opencode, which switches to it on the `gpt-*` models
 * exactly like our `usesApplyPatch` ([patch.ts](../patch.ts), MIN-115) — the
 * rocker is measured identical (docs/harness-opencode.md §2.3), so the
 * redeclaring here would just create a second place where it can diverge.
 */
function primaryTools(job: VmJob): Record<string, boolean> {
  const tools: Record<string, boolean> = {};
  for (const name of DISABLED_BUILTINS) tools[name] = false;
  if (isLocalJob(job)) for (const name of LOCAL_DISABLED_BUILTINS) tools[name] = false;
  if (!job.writesToRepo) for (const name of WRITE_BUILTINS) tools[name] = false;
  // Delegation is the `task` tool: it disappears when the turn has no
  // subagents to give, rather than being served and refusing.
  tools.task = job.subagents.maxParallel > 0;
  /**
   * `ask_user` DOES NOT EXIST FOR A ROUTINE (MIN-185): no one will respond to
   * 9 a.m. The WITHDRAWAL is here and not just in the ACL, because the
   * permission `question` is not consulted — measured: with `question: "ask"`
   * in config, no `permission.asked` is published, the tool runs and
   * directly publishes `question.asked`. Only the agent toolset
   * retire vraiment (§4).
   */
  tools.question = job.interactive;
  return tools;
}

/**
 * THE SUB-AGENTS OF A TOUR (MIN-286, lot 2) — our two modes (MIN-112), times
 * the models that we agree to give them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN AGENT BY (MODE × MODEL), AND NOT A `model` FIELD ON THE CALL
 *
 * Measured on the binary: the tool `task` takes `{description, prompt,
 * subagent_type, task_id}` — **and nothing else**. It has no `model` field, and
 * the model of a girl comes from `agent.<id>.model` (`b.model ?? the model of
 * parent message`, read in `TaskTool.execute`). The `model` of `spawn_agent` has
 * so only one possible translation: the NAME OF THE AGENT bears it.
 *
 * Hence the form: `explore` / `general` on the run model, then
 * `explore-<slug>` / `general-<slug>` by favorite. The model reads the offer in the
 * description of the tool `task`, where the server pastes a `- <nom>: <description>` by
 * non-primary (measured) agent — this is where the wording and `use_case` of the
 * favori atterrissent.
 *
 * WHAT THIS FORM TIGHTENS, and it must be said: `spawn_agent` accepted
 * any catalog id (`allowedIds`, ~345 models). List them in
 * agents would inflate the tool description by 700 lines. The offer therefore becomes
 * **curated favorites**, already passed to the plan ceiling by `scopeSubagentModels`
 * — the ceiling is thus held BY CONSTRUCTION, there is no longer any free id to
 * refuse. What a model would request outside the list returns as a tool error by
 * the supervisor, who gives him the offer again ([opencode-permissions.ts](opencode-permissions.ts)).
 *
 * The reading only of `explore` remains a property of the TOOLSET coupled with a
 * ACL — not a prompt phrase that a model can ignore, same doctrine as
 * `subagentToolsFor`. Measured on the binary: a girl `{"*": false, read: true}`
 * receives exactly ONE tool in the body of its request.
 */
export interface SubagentAgentEntry {
  /** The `subagent_type` that the model will change to `task`. */
  name: string;
  /** Our mode, the one that the thread displays (`subagent_mode`). */
  mode: "explore" | "implement";
  /** The girl's model, or absent when she inherits that of the run. */
  modelId?: string;
  /** The label of the favorite — what `spawn_agent` displayed in `model`. */
  label?: string;
  /** The `use_case` of the favorite, written TO be read by a model who chooses. */
  useCase?: string;
}

/** The agent name of a mode and model. `null` = the run model. */
export function subagentAgentName(mode: "explore" | "implement", modelId: string | null): string {
  const base = mode === "explore" ? "explore" : "general";
  if (!modelId) return base;
  // An agent name also serves as a permission PATTERN (`permission.task`), where it
  // is compared to the glob: we therefore only leave letters, numbers and
  // dashes. The slug does not have to be reversible — the supervisor keeps the table.
  const slug = modelId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base}-${slug}`;
}

/**
 * THE TOUR SUB-AGENT TABLE. Exported because it is read twice: here
 * to write the config, and by the supervisor to return to the thread the `mode` and the
 * `model` that a `spawn_agent` carried (the agent name cannot be read again).
 */
export function subagentAgentTable(job: VmJob): SubagentAgentEntry[] {
  const entries: SubagentAgentEntry[] = [
    { name: subagentAgentName("explore", null), mode: "explore" },
    { name: subagentAgentName("implement", null), mode: "implement" },
  ];
  for (const favorite of subagentModelChoices(job)) {
    for (const mode of ["explore", "implement"] as const) {
      entries.push({
        name: subagentAgentName(mode, favorite.id),
        mode,
        modelId: favorite.id,
        label: favorite.label,
        ...(favorite.useCase ? { useCase: favorite.useCase } : {}),
      });
    }
  }
  return entries;
}

/**
 * The models we agree to give to girls: the favorites ALREADY passed
 * ceiling of the plan, the price of which is known, within the limit of the list ceiling.
 *
 * The price filter is not accounting prudence: a declared model
 * without `cost` renders `cost: 0` to opencode (§1), so a free girl at
 * ledger. Not offering it is the only choice that doesn't lie.
 */
function subagentModelChoices(job: VmJob): Array<{ id: string; label: string; useCase?: string }> {
  if (!job.subagents.models) return [];
  const pricing = job.subagents.pricing ?? {};
  return job.subagents.favorites
    .filter((f) => f.id !== job.model && pricing[f.id])
    .slice(0, MAX_SUBAGENT_MODELS)
    .map((f) => ({ id: f.id, label: f.label, useCase: f.use_case }));
}

/**
 * What a girl is allowed to do, mode by mode — translation into config
 * de [subagentToolsFor](../tools.ts).
 *
 * `"*": false` THEN the list: this is what removes the ~32 tools from DOMAIN, which
 * `SUBAGENT_FORBIDDEN_TOOLS` forbidden to a girl (the ticket, the notebook, the sweaters
 * requests, the session plan belongs to the parent — a daughter who checks the
 * plan of the user would be acting on behalf of a conversation that she has not read).
 * Without the joker, these tools were served to the girl: they are in the file
 * of server tools, so everyone by default.
 *
 * `web_search` is the only exception, and that is `subagentToolsFor`.
 */
function subagentTools(job: VmJob, mode: "explore" | "implement"): Record<string, boolean> {
  const tools: Record<string, boolean> = { "*": false };
  for (const name of EXPLORE_TOOLS) tools[name] = true;
  if (mode === "explore") return tools;

  if (!isLocalJob(job)) {
    tools.bash = true;
    tools.webfetch = true;
  }
  // The three writing interfaces are open together: it is opencode which
  // slice according to the model OF THE GIRL (`apply_patch` on the `gpt-*`, the tools
  // per chain otherwise), and it decides before this game applies. In
  // designating one here would freeze it on the PARENT model.
  if (job.writesToRepo) for (const name of WRITE_BUILTINS) tools[name] = true;
  if (job.webSearch) tools.web_search = true;
  return tools;
}

function subagentAgents(job: VmJob): Record<string, OpencodeAgentConfig> {
  const agents: Record<string, OpencodeAgentConfig> = {};
  for (const entry of subagentAgentTable(job)) {
    const explore = entry.mode === "explore";
    agents[entry.name] = {
      mode: "subagent",
      // This is the ONLY thing the parent reads about a sub-agent (she goes into
      // the description of the tool `task`): without it, opencode writes “This subagent
      // should only be called manually by the user” and the offer disappears.
      description: subagentDescription(entry, job),
      tools: subagentTools(job, entry.mode),
      permission: explore
        ? // `read` follows the same rule as the parent (MIN-360), and it's here
          // that she matters the most: a `explore` girl only has that to do.
          { "*": "deny", read: isLocalJob(job) ? "ask" : "allow", grep: "allow", glob: "allow" }
        : // A girl does not delegate (one-level hierarchy, coupled with
          // `subagent_depth: 1` of opencode) and does not ask questions: it
          // reports to the parent, who decides.
          { ...permissions(job), task: "deny", question: "deny" },
      ...(entry.modelId ? { model: modelRef(entry.modelId) } : {}),
    };
  }
  return agents;
}

/** What the parent reads to choose: the mode, then the model and its use. */
function subagentDescription(entry: SubagentAgentEntry, job: VmJob): string {
  const what =
    entry.mode === "explore"
      ? "READ-ONLY investigation: it can read, search and list files, nothing else. Parallelisable."
      : isLocalJob(job)
        ? "Edits only this repository: reading, searching and editing files. Host commands and arbitrary network requests are unavailable. It cannot open a pull request, touch the ticket, the notebook or the session plan — it reports back, you decide."
        : "Edits the repository: reading, searching, editing, running commands. It cannot open a pull request, touch the ticket, the notebook or the session plan — it reports back, you decide.";
  const on = entry.modelId
    ? `Runs on ${entry.label ?? entry.modelId} (${entry.modelId}).${entry.useCase ? ` ${entry.useCase}` : ""}`
    : "Runs on your own model.";
  return `${what} ${on}`;
}

export interface BuildOpencodeConfigOptions {
  /** Paths of plugins that the supervisor wrote. Still empty: the decision
   * of MIN-286 (docs/harness-opencode.md §2.15) is to pose none. */
  plugins?: string[];
  baseUrl?: string;
  /**
   * The repository convention files (`AGENTS.md`, `CLAUDE.md`) that the
   * supervisor FOUND — absolute paths, repository root only.
   *
   * They replace what opencode did on its own before
   * `OPENCODE_DISABLE_PROJECT_CONFIG` does not take it away (MIN-360).
   */
  repoInstructionFiles?: string[];
}

/**
 * THE SETUP OF A TOUR. Pure: same job, same document, down to the byte — that’s what
 * which allows you to compare it in a test instead of rereading it.
 */
export function buildOpencodeConfig(
  job: VmJob,
  opts: BuildOpencodeConfigOptions = {},
): OpencodeConfig {
  const ref = modelRef(job.model);
  return {
    $schema: "https://opencode.ai/config.json",
    model: ref,
    // The small model (title, summary) is the SAME: a second model would be a
    // second prize, a second catalog and a second ledger line that
    // nobody chose.
    small_model: ref,
    subagent_depth: 1,
    default_agent: OPENCODE_PRIMARY_AGENT,
    /**
     * The minddy anchor, THEN the repository conventions (MIN-360).
     *
     * Opencode would fetch `AGENTS.md` / `CLAUDE.md` on its own while walking up
     * from the depot. `OPENCODE_DISABLE_PROJECT_CONFIG` — which we now ask,
     * cf. `opencodeServerEnv` — removes this gesture AT THE SAME TIME as the tools and
     * the plugins from the repository, because it's the same feedback. We therefore return them
     * explicitly: named, at the root, and without executing anything.
     */
    instructions: [opencodeAnchorFile(job.layout), ...(opts.repoInstructionFiles ?? [])],
    provider: {
      [OPENCODE_PROVIDER_ID]: {
        npm: OPENCODE_PROVIDER_NPM,
        name: "minddy",
        options: {
          /**
           * THE PLACEHOLDER, NEVER THE KEY — and this is true of BOTH worlds, for
           * two different reasons.
           *
           * This document leaves on the disk of a process where the model executes
           * arbitrary shell, and it enters the server environment
           * opencode (`OPENCODE_CONFIG_CONTENT`): a `env` is enough to read it.
           * In the microVM, the real key is placed by the firewall at the exit
           * (see `network-policy.ts`); on the user's machine, where he
           * there is no firewall, it is installed by the LLM proxy — in memory,
           * on the only route it serves ([llm-proxy.ts](llm-proxy.ts), MIN-357).
           * This field doesn't change from one world to the next, and that's the goal.
           */
          apiKey: job.llmPlaceholderKey,
          /**
           * THE LOCAL PROXY WHEN THERE IS ONE (lot 2), the supplier otherwise.
           *
           * `127.0.0.1` does not release anything: the proxy runs IN the microVM, it
           * relays to this same provider URL with the same placeholder,
           * and it is always the firewall which places the key at the exit. What he
           * adds — `generation_id`, invoiced cost, layer reasoning
           * compat — has no other point of observation
           * ([llm-proxy.ts](llm-proxy.ts)).
           */
          baseURL: opts.baseUrl ?? job.baseUrl,
        },
        models: providerModels(job),
      },
    },
    tools: toolMap(job),
    permission: permissions(job),
    tool_output: { ...TOOL_OUTPUT },
    agent: {
      [OPENCODE_PRIMARY_AGENT]: {
        mode: "primary",
        tools: primaryTools(job),
        permission: permissions(job),
      },
      ...subagentAgents(job),
    },
    plugin: opts.plugins ?? [],
  };
}

/**
 * THE opencode SERVER ENVIRONMENT, as the supervisor will pass it.
 *
 * Everything is here, and nothing is a config file: `OPENCODE_CONFIG_CONTENT`
 * carries the document, `OPENCODE_DB` relocates the state out of the repository.
 *
 * The three `DISABLE` are not reluctance: a run should not depend on either
 * models.dev (we give our prices, §1), neither an LSP download, nor a
 * auto-update — measured at batch 0, startup without an online catalog is
 * identical (1248 ms versus 1336 ms), and an automatic update would change
 * from the harness in the middle of a run.
 */
export function opencodeServerEnv(
  job: VmJob,
  opts: BuildOpencodeConfigOptions = {},
): Record<string, string> {
  return {
    OPENCODE_CONFIG_CONTENT: JSON.stringify(buildOpencodeConfig(job, opts)),
    OPENCODE_DB: opencodeDbPath(job.layout),
    /**
     * THE TWO HATCHES THAT SELF-DISCOVERY (MIN-360) — and they do not
     * are not prudent, they close ARBITRARY CODE EXECUTION
     * FROM THE CONTENTS OF A REPOSITORY, on the user's machine.
     *
     * Noted in binary (1.18.16, `opencode-darwin-arm64`), not deduced:
     *
     * - `OPENCODE_PURE` → the SERVER plugin loader does
     * `let A = flags.pure ? [] : config.plugin_origins ?? []`. No plugins
     * external is not loaded — neither those of a `opencode.json` of the repository, nor the
     * `*.ts` that the binary picks up under `.opencode/plugin(s)/`. Our plugins
     * we are not concerned: there are none (§2.15 of the file);
     * - `OPENCODE_DISABLE_PROJECT_CONFIG` → `ConfigPaths.directories` cesse de
     * go back to find `.opencode/` from the repository, and `ConfigPaths.files` from
     * go back to search for `opencode.json(c)`. This closes the TOOLS of the repository (of
     * `*.ts` executed as soon as the model calls them) and its MCP servers (a
     * process launched at the start of the session), that our config could not
     * not neutralize: it is fused AFTER, so it WINS on what is
     * replaces, but these three ADD.
     *
     * What the second also removes, and which is returned elsewhere: the `AGENTS.md`
     * and `CLAUDE.md` from the repository, which opencode loaded by the same upload. They
     * go through `instructions` (see `BuildOpencodeConfigOptions`). Our
     * tools folder is intact — it comes from `Path.config`
     * (`XDG_CONFIG_HOME`), which remains included unconditionally.
     */
    OPENCODE_PURE: "1",
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    /**
     * `PURE` closes external plugins, but not plugins delivered by
     * OpenCode. These do not participate in our harness: provider, agents,
     * permissions and tools are all declared explicitly above. THE
     * load to each server nevertheless triggers their initialization before the
     * first prompt. Cutting them keeps the built-ins we serve, while
     * removing this start-up work with no functional surface used.
     */
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    /**
     * THE THIRD HATCH (MIN-364, lot 9) — the one that was missing, and of which
     * the absence was only visible because another setting covered it.
     *
     * Opencode skills discovery reads **`$HOME`** (`~/.claude/skills/`,
     * `~/.agents/skills/`) and goes back from the session folder to the root of the repository.
     * The harness relocates `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and
     * `XDG_CACHE_HOME` — **but not `HOME`**, which must remain the user's
     * the user so that his `PATH`, his `nvm`, his `~/.gitconfig` work.
     *
     * Today `tools.skill` is at `false`, so nothing is loading. But the
     * day when someone passes it to `true` thinking of offering “the skills of
     * deposit”, he ALSO opens the Claude Code skills file of his
     * owner — without any line saying so. This hatch means that
     * that day, you will have to NAME what you are serving (`skills.paths`, measured as the
     * only selective form) instead of taking everything.
     *
     * Measured: `OPENCODE_DISABLE_EXTERNAL_SKILLS` cuts implicit discovery
     * ENTIRE and lets `skills.paths` pass
     * ([opencode-capabilities.probe.test.ts](opencode-capabilities.probe.test.ts)).
     */
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    /**
     * AND THE QUESTION, PINED (MIN-364) — because it became
     * load-bearing and that it was only due to one flaw.
     *
     * Noted in binary 1.18.16: the tool `question` does not enter into the game of
     * included only if `["app","cli","desktop"].includes(client) ||
     * enableQuestionTool`, where `client` comes from `OPENCODE_CLIENT` with `"cli"`
     * for defect. We don't set `OPENCODE_CLIENT`, so it works — **by
     * fault accident**.
     *
     * But `ask_user` IS `question`, and since D7 he no longer ends the round: he
     * suspends it. If an opencode version changed this defect, or if someone
     * posed `OPENCODE_CLIENT=sdk` believing that it was doing the right thing, `ask_user` would disappear
     * of the toolset **without a word** — the model would simply cease to be able to
     * ask. An explicit variable costs one line and closes this case.
     */
    OPENCODE_ENABLE_QUESTION_TOOL: "1",
    // It is he who puts the domain tools outside the repository (see `opencodeToolDir`).
    XDG_CONFIG_HOME: opencodeConfigHome(job.layout),
    // Downloaded snapshots, logs and binaries — under the harness
    // eux aussi (cf. `opencodeDataHome`).
    XDG_DATA_HOME: opencodeDataHome(job.layout),
    XDG_CACHE_HOME: opencodeCacheHome(job.layout),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    OPENCODE_DISABLE_EMBEDDED_WEB_UI: "1",
    // OpenCode otherwise silently falls back to 120 seconds. Keep its built-in
    // bash tool aligned with the product-level command ceiling.
    OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: String(
      OPENCODE_BASH_TIMEOUT_MS,
    ),
    /**
     * FFF builds a search index per project and starts its watcher at
     * first prompt. Our harness already uses the `glob` and `grep` tools
     * integrated; keeping this speculative index cost several seconds
     * before the first model query for a benefit that is never required
     * by the turn. OpenCode falls back to its normal search implementation.
     */
    OPENCODE_DISABLE_FFF: "1",
    /**
     * ⚠ THERE IS NO `OPENCODE_SHELL_CWD` HERE, AND THIS IS A FIX (MIN-363).
     *
     * This key lived there, with a comment that said "the opencode shell
     * is PERSISTENT and starts where it is told: the deposit”. The variable
     * does not exist: **zero occurrences** in `opencode-darwin-arm64` in 1.18.16
     * (noted at `strings`, to be compared to 6 of `OPENCODE_PURE` and 7 of
     * `OPENCODE_DISABLE_PROJECT_CONFIG` just above, which are read).
     *
     * What gives the server its deposit is the client's `directory`
     * ([opencode-host.ts](opencode-host.ts)) — it travels to query on each
     * road. The `cwd` of the shell is not bound by anything on our side: there is no
     * therefore **no reasoning to be based on a persistent shell which would remain
     * in the deposit between two rounds**. The only place where an intention to
     * path is declared reliably is the `workdir` parameter of the tool `bash`.
     */
  };
}

/**
 * The time limit of an order, carried over to that of the product — the defect
 * opencode's is 120 s, ours is 180 s (`RUN_COMMAND_TIMEOUT_MS`). Exported and not
 * placed in the config: it is an argument for calling the tool `bash`, not a setting
 * global, and the supervisor is the only one who knows how many turns are left.
 */
export const OPENCODE_BASH_TIMEOUT_MS = RUN_COMMAND_TIMEOUT_MS;
