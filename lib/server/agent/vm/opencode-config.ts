import { HARNESS_DIR, REPO_DIR } from "../repo-host";
import { RUN_COMMAND_TIMEOUT_MS } from "../tools";
import type { VmJob } from "./protocol";

/**
 * LA CONFIG D'OPENCODE POUR UN TOUR (MIN-286, lot 1) — ce que le superviseur pose
 * dans `OPENCODE_CONFIG_CONTENT` avant de démarrer `opencode serve`.
 *
 * Un module PUR : il prend le `VmJob` que la fonction a déjà écrit et rend un
 * document JSON. Aucune IO, aucun secret, aucune lecture d'environnement — c'est
 * ce qui le rend testable à l'unité, et c'est aussi ce que le test miroir de
 * [vm-bundle-secrets.test.ts](../vm-bundle-secrets.test.ts) vérifie sur sa
 * SORTIE : la clé du modèle n'entre jamais dans la microVM, le firewall la pose
 * après la sortie et opencode envoie le placeholder du job.
 *
 * TOUT PASSE PAR L'ENVIRONNEMENT, SANS FICHIER. `OPENCODE_CONFIG_CONTENT` porte
 * le document entier — mesuré sur `opencode-ai@1.18.16` : le serveur démarré avec
 * lui rend exactement ce document sur `GET /config`, provider maison compris.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, ET QUI DÉCIDE DE LA FORME CI-DESSOUS
 *
 * (Serveur headless réel, faux endpoint OpenAI-compatible local pour lire le
 * corps des requêtes sans dépenser de modèle. Les chiffres sont reproductibles.)
 *
 * 1. **UN SEUL PROVIDER, LE NÔTRE, ET C'EST NOUS QUI LE TARIFONS.** On déclare
 *    `provider.minddy` sur `@ai-sdk/openai-compatible` avec la `baseURL` du job.
 *    C'est la seule forme qui couvre les CINQ providers du registre
 *    ([agent-providers.ts](../../../agent-providers.ts)) sans changer de wire
 *    format : tous sont adressés en `<baseUrl>/chat/completions` + `Bearer`.
 *
 *    La conséquence, elle, ne se devine pas : **un modèle déclaré sans `cost`
 *    rend `cost: 0`** — mesuré, tokens exacts et coût nul, ce qui viderait le
 *    ledger en silence. Avec `cost` déclaré, opencode calcule au décimal près
 *    (1 000 in / 200 out à 3 $ / 15 $ → `0.006`, exact). D'où `job.pricing` :
 *    **on donne nos prix**, ceux de l'index OpenRouter, plutôt que de dépendre du
 *    catalogue models.dev. Ça règle au passage le seul risque que la sonde de
 *    coût du lot 0 avait laissé ouvert (docs/harness-opencode.md §2.5) : la
 *    DÉRIVE DE CATALOGUE. Prix inconnus (BYOK hors index) → pas de `cost`, et le
 *    superviseur devra marquer l'usage `estimated` plutôt que d'écrire un zéro.
 *
 * 2. **Un id de modèle à slash passe.** `"minddy/deepseek/deepseek-chat-v3.1"` est
 *    coupé au PREMIER `/` : provider `minddy`, modèle `deepseek/deepseek-chat-v3.1`.
 *    Mesuré de bout en bout, jusqu'au corps de requête.
 *
 * 3. **Le raisonnement ne passe QUE sous sa forme imbriquée.** `options.reasoning
 *    = { effort }` (la forme OpenRouter) arrive intact dans le corps ; `options.
 *    reasoning_effort` à plat est **retiré** par opencode sur l'appel principal
 *    (il survit sur le petit modèle, ce qui rend la faute d'autant plus discrète).
 *    Les couches compat openai / anthropic / google, qui attendent la forme
 *    PLATE ([agent-providers.ts](../../../agent-providers.ts), `reasoningField`),
 *    perdent donc leur niveau de raisonnement en 1.18.16 : c'est le proxy local du
 *    superviseur (§2.6 du dossier) qui le réinjectera, et c'est sa deuxième
 *    raison d'être après le `generation_id`.
 *
 * 4. **`tools: { x: false }` n'ENLÈVE pas le tool intégré `x`** : il le sert quand
 *    même et pose une permission `deny` (mesuré sur `todowrite`, toujours servi).
 *    Ce qui retire vraiment un intégré, c'est le jeu de tools de l'AGENT
 *    (`agent.<id>.tools`) — d'où les deux, posés ensemble : la carte globale pour
 *    la permission, le jeu de l'agent pour l'absence.
 *
 * 5. **`agent.<id>.prompt` REMPLACE le prompt système intégré**, et les
 *    `instructions` sont des CHEMINS DE FICHIER dont le contenu est ajouté au
 *    message système (mesuré : marqueur retrouvé dans le corps). L'ancrage minddy
 *    voyage donc par un fichier que le superviseur écrit sous `HARNESS_DIR` —
 *    hors de `REPO_DIR`, pour que le `git add -A` de fin de tour ne l'emporte
 *    jamais dans un commit du dépôt de l'utilisateur.
 */

/** L'id de provider qu'on déclare. Un seul, quel que soit le BYOK derrière. */
export const OPENCODE_PROVIDER_ID = "minddy";

/** Le paquet AI SDK que ce provider charge : la couche OpenAI-compatible. */
export const OPENCODE_PROVIDER_NPM = "@ai-sdk/openai-compatible";

/** L'agent PRIMAIRE d'un tour — celui qui reçoit le prompt de l'utilisateur. */
export const OPENCODE_PRIMARY_AGENT = "build";

/** Le fichier d'ancrage minddy, ajouté au prompt système par `instructions`. */
export const OPENCODE_ANCHOR_FILE = `${HARNESS_DIR}/minddy-anchor.md`;

/** Où vit l'état d'opencode : SQLite, hors du dépôt (cf. §5). */
export const OPENCODE_DB_PATH = `${HARNESS_DIR}/opencode.db`;

/**
 * Le `XDG_CONFIG_HOME` du serveur, et le dossier de tools qui en découle.
 *
 * Mesuré : `$XDG_CONFIG_HOME/opencode/tool/*.ts` est chargé exactement comme le
 * `.opencode/tool/` d'un projet — servi au modèle ET appelé. C'est ce qui permet
 * aux ~35 tools de domaine de vivre **hors du dépôt** : dans le dépôt, ils
 * entreraient dans le `git add -A` de fin de tour et se retrouveraient commités
 * chez l'utilisateur.
 */
export const OPENCODE_CONFIG_HOME = `${HARNESS_DIR}/config`;
export const OPENCODE_TOOL_DIR = `${OPENCODE_CONFIG_HOME}/opencode/tool`;

/**
 * Troncature de sortie de tool. Les valeurs par défaut d'opencode, redites ici
 * parce qu'un défaut qui bouge à une release près déplacerait silencieusement une
 * frontière que le produit connaît (`READ_MAX_LINES`, `READ_MAX_BYTES`).
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
  /** Hiérarchie à UN niveau : une fille ne délègue pas (cf. `subagentToolsFor`). */
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
  reasoning?: boolean;
  options?: Record<string, unknown>;
  cost?: { input: number; output: number; cache_read?: number; cache_write?: number };
  limit?: { context: number; output: number };
}

/**
 * Les intégrés qu'on ÉTEINT, et pourquoi chacun — la liste est courte parce que
 * l'inventaire de parité (docs/harness-opencode.md §3) dit que le reste tombe
 * pile sur les nôtres.
 *
 * - `todowrite` : notre checklist EST le plan du ticket, et elle se synchronise
 *   ([plan-sync.ts](../plan-sync.ts)). Une todo locale ne se lit nulle part.
 * - `websearch` : il ne porterait ni le plafond du tour (`webSearchMax`) ni la
 *   facturation ([web-search.ts](../../web-search.ts)) — et il n'est de toute
 *   façon pas servi sur OpenRouter. Notre `web_search` de domaine le remplace.
 * - `skill` : les skills d'opencode lisent le disque de la microVM ; il n'y en a
 *   aucune, et un tool qui ne rend jamais rien coûte un round à le découvrir.
 */
const DISABLED_BUILTINS = ["todowrite", "websearch", "skill"] as const;

/** Les intégrés d'ÉCRITURE, retirés d'une session qui n'écrit pas (relecture). */
const WRITE_BUILTINS = ["edit", "write", "apply_patch"] as const;

/** Ce qu'un sous-agent `explore` a le droit de faire, et rien d'autre. */
const EXPLORE_TOOLS = ["read", "grep", "glob"] as const;

function modelRef(model: string): string {
  return `${OPENCODE_PROVIDER_ID}/${model}`;
}

/**
 * Le modèle du job, déclaré chez nous : ses prix (§1), sa fenêtre, ses capacités.
 *
 * `tool_call: true` est une affirmation et non une mesure — un modèle sans appel
 * d'outil ne sort jamais du catalogue de l'agent (`models-catalog.ts` le filtre),
 * donc celui qui arrive ici en a forcément.
 */
function modelDef(job: VmJob): OpencodeModelDef {
  const def: OpencodeModelDef = {
    name: job.model,
    tool_call: true,
    attachment: job.imageInput,
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
    // `output` est requis par le schéma dès qu'on donne `limit`. 8192 est le
    // `maxTokens` que notre profil de requête envoie déjà (agent-providers.ts).
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
 * Le niveau de raisonnement, dans la SEULE forme qui survive (§3) : imbriquée.
 *
 * `off` ne se dit pas ici — c'est l'absence du champ. Envoyer `effort: "none"` à
 * un endpoint qui ne connaît pas le champ revient en 400, et notre propre
 * profil de requête ne l'envoie déjà que sur les providers qui l'acceptent.
 */
function reasoningOptions(job: VmJob): Record<string, unknown> | null {
  if (job.reasoningLevel === "off") return null;
  return { reasoning: { effort: job.reasoningLevel } };
}

/**
 * Les permissions du tour — une ACL, dernière règle gagnante, `resource` en glob.
 *
 * Ce qu'elles ne sont PAS : le garde-fou des commandes. `command-guard.ts` et
 * `repo-path.ts` restent des fonctions pures rejouées par le superviseur sur
 * `POST /permission/:id/reply` — d'où `bash: "ask"`, qui est ce qui LUI DONNE la
 * main. Une ACL en glob ne saurait pas dire « `rm -rf` hors du dépôt », et une
 * règle qui approuve tout retirerait au superviseur son point de contrôle.
 */
function permissions(job: VmJob): Record<string, PermissionRule> {
  const write: PermissionAction = job.writesToRepo ? "allow" : "deny";
  return {
    read: "allow",
    glob: "allow",
    grep: "allow",
    list: "allow",
    // Chaque commande passe par nous : c'est là que `command-guard` s'exécute.
    bash: "ask",
    edit: write,
    // `ask_user` n'existe pas pour une ROUTINE (MIN-185) : personne ne répondra.
    question: job.interactive ? "ask" : "deny",
    webfetch: "allow",
    websearch: "deny",
    todowrite: "deny",
    task: "allow",
    // La microVM n'a qu'un dépôt et un harness ; tout le reste est hors sujet.
    external_directory: "deny",
  };
}

/** La carte globale des intégrés — permission, pas retrait (§4). */
function toolMap(job: VmJob): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const name of DISABLED_BUILTINS) map[name] = false;
  if (!job.writesToRepo) for (const name of WRITE_BUILTINS) map[name] = false;
  return map;
}

/**
 * Le jeu de tools de l'agent PRIMAIRE : ce qui reste des intégrés après retrait.
 *
 * `apply_patch` est laissé à opencode, qui bascule dessus sur les modèles `gpt-*`
 * exactement comme notre `usesApplyPatch` ([patch.ts](../patch.ts), MIN-115) — la
 * bascule est mesurée identique (docs/harness-opencode.md §2.3), donc la
 * redéclarer ici ne ferait que créer un deuxième endroit où elle peut diverger.
 */
function primaryTools(job: VmJob): Record<string, boolean> {
  const tools: Record<string, boolean> = {};
  for (const name of DISABLED_BUILTINS) tools[name] = false;
  if (!job.writesToRepo) for (const name of WRITE_BUILTINS) tools[name] = false;
  // La délégation est le tool `task` : il disparaît quand le tour n'a pas de
  // sous-agents à donner, plutôt que d'être servi et de refuser.
  tools.task = job.subagents.maxParallel > 0;
  return tools;
}

/**
 * Les deux sous-agents, qui sont nos deux modes (MIN-112).
 *
 * `explore` = lecture seule, et c'est une propriété du JEU DE TOOLS doublée d'une
 * ACL — pas une phrase de prompt qu'un modèle peut ignorer, même doctrine que
 * `subagentToolsFor`. `general` = notre `implement`.
 *
 * Le modèle des filles n'est PAS posé ici : le scoping par plan
 * (`allowedIds` / `abovePlanIds` / `maxMultiplier`) se joue à l'appel de `task`,
 * où le superviseur rejoue `makeSubagentModelResolver`. Poser un modèle en config
 * le figerait pour toutes les filles du tour, ce que le tool sait choisir.
 */
function subagentAgents(job: VmJob): Record<string, OpencodeAgentConfig> {
  const exploreTools: Record<string, boolean> = { "*": false };
  for (const name of EXPLORE_TOOLS) exploreTools[name] = true;

  const generalTools: Record<string, boolean> = { ...primaryTools(job) };
  // Une fille ne délègue pas (hiérarchie à un niveau) et n'a pas de question à
  // poser : elle rapporte au parent, qui décide.
  generalTools.task = false;
  generalTools.question = false;

  return {
    explore: {
      mode: "subagent",
      tools: exploreTools,
      permission: { "*": "deny", read: "allow", grep: "allow", glob: "allow" },
    },
    general: {
      mode: "subagent",
      tools: generalTools,
      permission: { ...permissions(job), task: "deny", question: "deny" },
    },
  };
}

/**
 * LA CONFIG D'UN TOUR. Pure : même job, même document, à l'octet près — c'est ce
 * qui permet de la comparer dans un test au lieu de la relire.
 *
 * `plugins` porte les chemins des plugins que le superviseur a écrits (règles de
 * livraison, gate, self-review). Vide tant que le lot 2 ne les a pas posés.
 */
export function buildOpencodeConfig(
  job: VmJob,
  opts: { plugins?: string[]; baseUrl?: string } = {},
): OpencodeConfig {
  const ref = modelRef(job.model);
  return {
    $schema: "https://opencode.ai/config.json",
    model: ref,
    // Le petit modèle (titre, résumé) est le MÊME : un deuxième modèle serait un
    // deuxième prix, un deuxième catalogue et une deuxième ligne de ledger que
    // personne n'a choisis.
    small_model: ref,
    subagent_depth: 1,
    default_agent: OPENCODE_PRIMARY_AGENT,
    instructions: [OPENCODE_ANCHOR_FILE],
    provider: {
      [OPENCODE_PROVIDER_ID]: {
        npm: OPENCODE_PROVIDER_NPM,
        name: "minddy",
        options: {
          // LE PLACEHOLDER, JAMAIS LA CLÉ. Le firewall la pose à la sortie de la
          // microVM (cf. `network-policy.ts`) : ce document part sur le disque
          // d'un process où le modèle exécute du shell arbitraire.
          apiKey: job.llmPlaceholderKey,
          /**
           * LE PROXY LOCAL QUAND IL Y EN A UN (lot 2), le fournisseur sinon.
           *
           * `127.0.0.1` ne relâche rien : le proxy tourne DANS la microVM, il
           * relaie vers cette même URL de fournisseur avec le même placeholder,
           * et c'est toujours le firewall qui pose la clé à la sortie. Ce qu'il
           * ajoute — `generation_id`, coût facturé, raisonnement des couches
           * compat — n'a aucun autre point d'observation
           * ([llm-proxy.ts](llm-proxy.ts)).
           */
          baseURL: opts.baseUrl ?? job.baseUrl,
        },
        models: { [job.model]: modelDef(job) },
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
 * L'ENVIRONNEMENT DU SERVEUR opencode, tel que le superviseur le passera.
 *
 * Tout est ici, et rien n'est un fichier de config : `OPENCODE_CONFIG_CONTENT`
 * porte le document, `OPENCODE_DB` relocalise l'état hors du dépôt.
 *
 * Les trois `DISABLE` ne sont pas de la frilosité : un run ne doit dépendre ni de
 * models.dev (on donne nos prix, §1), ni d'un téléchargement de LSP, ni de
 * l'auto-update — mesuré au lot 0, le démarrage sans catalogue en ligne est
 * identique (1 248 ms contre 1 336 ms), et une mise à jour automatique changerait
 * de harness au milieu d'un run.
 */
export function opencodeServerEnv(
  job: VmJob,
  opts: { plugins?: string[]; baseUrl?: string } = {},
): Record<string, string> {
  return {
    OPENCODE_CONFIG_CONTENT: JSON.stringify(buildOpencodeConfig(job, opts)),
    OPENCODE_DB: OPENCODE_DB_PATH,
    // C'est lui qui met les tools de domaine hors du dépôt (cf. `OPENCODE_TOOL_DIR`).
    XDG_CONFIG_HOME: OPENCODE_CONFIG_HOME,
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    OPENCODE_DISABLE_EMBEDDED_WEB_UI: "1",
    // Le shell d'opencode est PERSISTANT et démarre où on le lui dit : le dépôt.
    OPENCODE_SHELL_CWD: REPO_DIR,
  };
}

/**
 * Le plafond de temps d'une commande, reporté sur celui du produit — le défaut
 * d'opencode est 120 s, le nôtre 180 s (`RUN_COMMAND_TIMEOUT_MS`). Exporté et non
 * posé dans la config : c'est un argument d'appel du tool `bash`, pas un réglage
 * global, et le superviseur est le seul à savoir combien de tour il reste.
 */
export const OPENCODE_BASH_TIMEOUT_MS = RUN_COMMAND_TIMEOUT_MS;
