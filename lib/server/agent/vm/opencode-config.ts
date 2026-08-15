import type { HarnessLayout } from "../harness-layout";
import { RUN_COMMAND_TIMEOUT_MS } from "../tools";
import { isLocalJob, type VmJob } from "./protocol";

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
 *    voyage donc par un fichier que le superviseur écrit sous `harnessDir` —
 *    hors du dépôt, pour que le `git add -A` de fin de tour ne l'emporte
 *    jamais dans un commit du dépôt de l'utilisateur.
 */

/** L'id de provider qu'on déclare. Un seul, quel que soit le BYOK derrière. */
export const OPENCODE_PROVIDER_ID = "minddy";

/** Le paquet AI SDK que ce provider charge : la couche OpenAI-compatible. */
export const OPENCODE_PROVIDER_NPM = "@ai-sdk/openai-compatible";

/** L'agent PRIMAIRE d'un tour — celui qui reçoit le prompt de l'utilisateur. */
export const OPENCODE_PRIMARY_AGENT = "build";

/**
 * LES CHEMINS D'OPENCODE, DÉRIVÉS DU LAYOUT DU RUN (MIN-354).
 *
 * C'étaient six constantes de module sous `/vercel/sandbox/harness`. Le piège
 * qu'elles portaient n'était pas seulement `/vercel` : deux runs lancés à la
 * suite sur une même machine auraient partagé **une seule base SQLite**, un seul
 * fichier d'ancrage et un seul dossier de tools — chacun réécrivant le décor de
 * l'autre, avec des symptômes qui ne ressemblent pas à leur cause.
 */

/** Le fichier d'ancrage minddy, ajouté au prompt système par `instructions`. */
export function opencodeAnchorFile(layout: HarnessLayout): string {
  return `${layout.harnessDir}/minddy-anchor.md`;
}

/** Où vit l'état d'opencode : SQLite, hors du dépôt (cf. §5). */
export function opencodeDbPath(layout: HarnessLayout): string {
  return `${layout.harnessDir}/opencode.db`;
}

/**
 * Le `XDG_CONFIG_HOME` du serveur, et le dossier de tools qui en découle.
 *
 * Mesuré : `$XDG_CONFIG_HOME/opencode/tool/*.ts` est chargé exactement comme le
 * `.opencode/tool/` d'un projet — servi au modèle ET appelé. C'est ce qui permet
 * aux ~35 tools de domaine de vivre **hors du dépôt** : dans le dépôt, ils
 * entreraient dans le `git add -A` de fin de tour et se retrouveraient commités
 * chez l'utilisateur.
 */
export function opencodeConfigHome(layout: HarnessLayout): string {
  return `${layout.harnessDir}/config`;
}
export function opencodeToolDir(layout: HarnessLayout): string {
  return `${opencodeConfigHome(layout)}/opencode/tool`;
}

/**
 * LES DEUX AUTRES DOSSIERS D'OPENCODE, ramenés eux aussi sous `harnessDir`.
 *
 * Mesuré le 2026-08-12 (serveur réel, dépôt git jetable) : `XDG_DATA_HOME` reçoit
 * `opencode/repos/` — les **snapshots** de travail, qui sont des dépôts git —, et
 * `opencode/log/` ; `XDG_CACHE_HOME` reçoit les binaires téléchargés. Sans ces
 * deux variables, tout cela part dans le `$HOME` de la microVM : hors du dépôt,
 * donc jamais dans un `git add -A`, mais hors de notre portée aussi — un
 * `$HOME` absent ou posé sur le dépôt par une image de sandbox suffirait à
 * ramener des dépôts git entiers dans le commit du tour. Tout l'état d'opencode
 * tient sous un seul dossier, et ce dossier est frère du dépôt.
 */
export function opencodeDataHome(layout: HarnessLayout): string {
  return `${layout.harnessDir}/data`;
}
export function opencodeCacheHome(layout: HarnessLayout): string {
  return `${layout.harnessDir}/cache`;
}

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
  /** `input`/`output` au sens models.dev — cf. `modelDef` pour ce qui en dépend. */
  modalities?: { input: string[]; output: string[] };
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

/**
 * COMBIEN DE MODÈLES DE FILLE ON DÉCLARE AU PLUS.
 *
 * Chaque modèle offert coûte DEUX agents (un par mode) et deux lignes dans la
 * description du tool `task` — c'est là que le modèle lit l'offre (mesuré : le
 * serveur y colle « Available agent types and the tools they have access to: »
 * suivi d'un `- <nom>: <description>` par agent non primaire). La liste des
 * favoris en compte quatre par défaut ; ce plafond borne une liste d'admin qui
 * partirait à trente, sans quoi la description du tool grossirait sans que
 * personne ne le voie.
 */
export const MAX_SUBAGENT_MODELS = 8;

function modelRef(model: string): string {
  return `${OPENCODE_PROVIDER_ID}/${model}`;
}

/**
 * Le modèle du job, déclaré chez nous : ses prix (§1), sa fenêtre, ses capacités.
 *
 * `tool_call: true` est une affirmation et non une mesure — un modèle sans appel
 * d'outil ne sort jamais du catalogue de l'agent (`models-catalog.ts` le filtre),
 * donc celui qui arrive ici en a forcément.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES IMAGES DEMANDENT **DEUX** DÉCLARATIONS, ET `attachment` N'EST PAS LA BONNE
 *
 * Mesuré le 2026-08-12 (dossier §2.22) : avec `attachment: true` seul, une image
 * rendue par un tool est bien acheminée jusqu'au dernier moment, puis **remplacée
 * par un texte d'erreur** juste avant l'appel — « ERROR: Cannot read "x.png"
 * (this model does not support image input). Inform the user. » Le modèle lit
 * donc une phrase qui l'invite à prévenir l'utilisateur d'une limite qui n'existe
 * pas, et la maquette est perdue en silence.
 *
 * Ce que le binaire teste, c'est `capabilities.input.image`, qui se déclare en
 * config par **`modalities.input`** — d'où les deux champs ci-dessous, posés
 * ensemble et sur le même `job.imageInput`. Ne jamais en poser un sans l'autre.
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
 * LES MODÈLES DU TOUR : celui du run, plus un par modèle de sous-agent offert.
 *
 * Un modèle non déclaré ne tourne pas — et un modèle déclaré sans prix rend
 * `cost: 0` (§1). Les deux raisons pour lesquelles cette table est la même que
 * celle des agents : ce qui n'a pas de prix n'est pas offert
 * (`subagentModelChoices`), et ce qui est offert est tarifé ici.
 *
 * Le `thinking_effort` conseillé du favori n'est PAS reporté : le niveau de
 * raisonnement est une option de MODÈLE chez opencode, donc le poser reviendrait
 * à le figer pour toutes les filles de ce modèle. Elles héritent de celui du run,
 * exactement comme `spawn_agent` sans `thinking_effort`.
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
  /**
   * `ask` ET NON `allow` sur une session qui écrit, et ça n'est pas de la
   * prudence : `.git/` n'est protégé par personne chez opencode — mesuré, un
   * `write` sur `<dépôt>/.git/config` l'a écrasé. `ask` est ce qui donne la main
   * au superviseur, qui y rejoue `assertNotGit` et `resolveWithin`
   * ([opencode-permissions.ts](opencode-permissions.ts)).
   */
  const write: PermissionAction = job.writesToRepo ? "ask" : "deny";
  const local = isLocalJob(job);
  return {
    /**
     * `read` (MIN-360) — `allow` en microVM, `ask` sur la machine de quelqu'un.
     *
     * `allow` n'était pas neutre : opencode LIVRE `{"*.env": "ask", "*.env.*":
     * "ask", "*.env.example": "allow"}` dans son ruleset par défaut, nos règles
     * sont concaténées APRÈS, et la dernière qui matche gagne — notre `allow`
     * effaçait donc la question sur les `.env`. Sur un clone jetable, sans
     * enjeu ; en mode dépôt courant, c'est le `.env` réel de l'utilisateur.
     *
     * On ne remet pas leur glob : on prend la main. Un `ask` global fait passer
     * chaque lecture par `decidePermission`, qui est à nous, testé, et ne dépend
     * ni de l'ordre de concaténation ni de la sémantique de glob d'une version.
     * Le coût est un aller-retour HTTP en boucle locale par lecture — le même
     * que `bash` paie depuis toujours.
     */
    read: local ? "ask" : "allow",
    glob: "allow",
    grep: "allow",
    list: "allow",
    // Chaque commande passe par nous : c'est là que `command-guard` s'exécute.
    bash: "ask",
    edit: write,
    // Second rideau seulement : la permission `question` n'est PAS consultée
    // (mesuré). Ce qui retire vraiment `ask_user` d'une routine est le jeu de
    // tools de l'agent (`primaryTools`).
    question: job.interactive ? "ask" : "deny",
    /**
     * `webfetch` (MIN-360) — `allow` en microVM, `ask` sur une machine.
     *
     * En `allow`, il n'est JAMAIS publié en permission : `decidePermission` ne
     * voyait aucun fetch. Dans la microVM c'était sans conséquence, la boucle
     * locale ne portant que nos deux serveurs et le firewall bornant le reste.
     * Sur un Mac, la même ligne atteint le proxy LLM (donc la clé), le pont de
     * tools — qui n'authentifie rien —, les serveurs de dév de l'utilisateur, un
     * Ollama, un NAS, et tout ce que son VPN rend joignable.
     */
    webfetch: local ? "ask" : "allow",
    websearch: "deny",
    todowrite: "deny",
    /**
     * `ask` ET NON `allow` : la demande de permission d'un `task` porte le
     * `subagent_type` demandé (mesuré : `patterns: ["explore-cheap"]`,
     * `metadata: {description, subagent_type}`), et elle arrive AVANT
     * qu'opencode ne résolve l'agent. C'est donc le seul endroit d'où tenir les
     * deux choses que la config ne sait pas dire : le PLAFOND DE PARALLÉLISME
     * (`maxParallel`, réglé en `app_config`) et le mot au modèle quand il
     * demande un sous-agent qui n'existe pas — « voilà ce qui est offert »
     * plutôt qu'« Unknown agent type ».
     */
    task: "ask",
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
  /**
   * `ask_user` N'EXISTE PAS POUR UNE ROUTINE (MIN-185) : personne ne répondra à
   * 9 h du matin. Le RETRAIT est ici et pas seulement dans l'ACL, parce que la
   * permission `question` n'est pas consultée — mesuré : avec `question: "ask"`
   * en config, aucune `permission.asked` n'est publiée, le tool s'exécute et
   * publie directement `question.asked`. Seul le jeu de tools de l'agent le
   * retire vraiment (§4).
   */
  tools.question = job.interactive;
  return tools;
}

/**
 * LES SOUS-AGENTS D'UN TOUR (MIN-286, lot 2) — nos deux modes (MIN-112), fois
 * les modèles qu'on accepte de leur donner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN AGENT PAR (MODE × MODÈLE), ET PAS UN CHAMP `model` SUR L'APPEL
 *
 * Mesuré sur le binaire : le tool `task` prend `{description, prompt,
 * subagent_type, task_id}` — **et rien d'autre**. Il n'a pas de champ `model`, et
 * le modèle d'une fille vient de `agent.<id>.model` (`b.model ?? le modèle du
 * message parent`, lu dans `TaskTool.execute`). Le `model` de `spawn_agent` n'a
 * donc qu'une traduction possible : le NOM DE L'AGENT le porte.
 *
 * D'où la forme : `explore` / `general` sur le modèle du run, puis
 * `explore-<slug>` / `general-<slug>` par favori. Le modèle lit l'offre dans la
 * description du tool `task`, où le serveur colle un `- <nom>: <description>` par
 * agent non primaire (mesuré) — c'est là que le libellé et le `use_case` du
 * favori atterrissent.
 *
 * CE QUE CETTE FORME RESSERRE, et il faut le dire : `spawn_agent` acceptait
 * n'importe quel id du catalogue (`allowedIds`, ~345 modèles). Les énumérer en
 * agents gonflerait la description du tool de 700 lignes. L'offre devient donc
 * **les favoris curatés**, déjà passés au plafond du plan par `scopeSubagentModels`
 * — le plafond est ainsi tenu PAR CONSTRUCTION, il n'y a plus d'id libre à
 * refuser. Ce qu'un modèle demanderait hors liste revient en erreur de tool par
 * le superviseur, qui lui redonne l'offre ([opencode-permissions.ts](opencode-permissions.ts)).
 *
 * La lecture seule d'`explore` reste une propriété du JEU DE TOOLS doublée d'une
 * ACL — pas une phrase de prompt qu'un modèle peut ignorer, même doctrine que
 * `subagentToolsFor`. Mesuré sur le binaire : une fille `{"*": false, read: true}`
 * reçoit exactement UN tool dans le corps de sa requête.
 */
export interface SubagentAgentEntry {
  /** Le `subagent_type` que le modèle passera à `task`. */
  name: string;
  /** Notre mode, celui que le fil affiche (`subagent_mode`). */
  mode: "explore" | "implement";
  /** Le modèle de la fille, ou absent quand elle hérite de celui du run. */
  modelId?: string;
  /** Le libellé du favori — ce que `spawn_agent` affichait dans `model`. */
  label?: string;
  /** Le `use_case` du favori, écrit POUR être lu par un modèle qui choisit. */
  useCase?: string;
}

/** Le nom d'agent d'un mode et d'un modèle. `null` = le modèle du run. */
export function subagentAgentName(mode: "explore" | "implement", modelId: string | null): string {
  const base = mode === "explore" ? "explore" : "general";
  if (!modelId) return base;
  // Un nom d'agent sert aussi de PATRON de permission (`permission.task`), où il
  // est comparé au glob : on n'y laisse donc que des lettres, des chiffres et des
  // tirets. Le slug n'a pas à être réversible — le superviseur garde la table.
  const slug = modelId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base}-${slug}`;
}

/**
 * LA TABLE DES SOUS-AGENTS DU TOUR. Exportée parce qu'elle est lue deux fois : ici
 * pour écrire la config, et par le superviseur pour rendre au fil le `mode` et le
 * `model` qu'un `spawn_agent` portait (le nom d'agent, lui, ne se relit pas).
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
 * Les modèles qu'on accepte de donner aux filles : les favoris DÉJÀ passés au
 * plafond du plan, dont on connaît le prix, dans la limite du plafond de liste.
 *
 * Le filtre sur le prix n'est pas de la prudence comptable : un modèle déclaré
 * sans `cost` fait rendre `cost: 0` à opencode (§1), donc une fille gratuite au
 * ledger. Ne pas l'offrir est le seul choix qui ne mente pas.
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
 * Ce qu'une fille a le droit de faire, mode par mode — la traduction en config
 * de [subagentToolsFor](../tools.ts).
 *
 * `"*": false` PUIS la liste : c'est ce qui retire les ~32 tools de DOMAINE, que
 * `SUBAGENT_FORBIDDEN_TOOLS` interdit à une fille (le ticket, le carnet, les pull
 * requests, le plan de session appartiennent au parent — une fille qui coche le
 * plan de l'utilisateur agirait au nom d'une conversation qu'elle n'a pas lue).
 * Sans le joker, ces tools-là étaient servis à la fille : ils sont dans le dossier
 * de tools du serveur, donc à tout le monde par défaut.
 *
 * `web_search` est la seule exception, et c'est celle de `subagentToolsFor`.
 */
function subagentTools(job: VmJob, mode: "explore" | "implement"): Record<string, boolean> {
  const tools: Record<string, boolean> = { "*": false };
  for (const name of EXPLORE_TOOLS) tools[name] = true;
  if (mode === "explore") return tools;

  tools.bash = true;
  tools.webfetch = true;
  // Les trois interfaces d'écriture sont ouvertes ensemble : c'est opencode qui
  // tranche selon le modèle DE LA FILLE (`apply_patch` sur les `gpt-*`, les tools
  // par chaîne sinon), et il tranche avant que ce jeu-ci ne s'applique. En
  // désigner une ici la figerait sur le modèle du PARENT.
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
      // C'est la SEULE chose que le parent lit sur un sous-agent (elle part dans
      // la description du tool `task`) : sans elle, opencode écrit « This subagent
      // should only be called manually by the user » et l'offre disparaît.
      description: subagentDescription(entry),
      tools: subagentTools(job, entry.mode),
      permission: explore
        ? // `read` suit la même règle que celle du parent (MIN-360), et c'est ici
          // qu'elle compte le plus : une fille `explore` n'a que ça à faire.
          { "*": "deny", read: isLocalJob(job) ? "ask" : "allow", grep: "allow", glob: "allow" }
        : // Une fille ne délègue pas (hiérarchie à un niveau, doublée du
          // `subagent_depth: 1` d'opencode) et ne pose pas de question : elle
          // rapporte au parent, qui décide.
          { ...permissions(job), task: "deny", question: "deny" },
      ...(entry.modelId ? { model: modelRef(entry.modelId) } : {}),
    };
  }
  return agents;
}

/** Ce que le parent lit pour choisir : le mode, puis le modèle et son usage. */
function subagentDescription(entry: SubagentAgentEntry): string {
  const what =
    entry.mode === "explore"
      ? "READ-ONLY investigation: it can read, search and list files, nothing else. Parallelisable."
      : "Edits the repository: reading, searching, editing, running commands. It cannot open a pull request, touch the ticket, the notebook or the session plan — it reports back, you decide.";
  const on = entry.modelId
    ? `Runs on ${entry.label ?? entry.modelId} (${entry.modelId}).${entry.useCase ? ` ${entry.useCase}` : ""}`
    : "Runs on your own model.";
  return `${what} ${on}`;
}

export interface BuildOpencodeConfigOptions {
  /** Chemins des plugins que le superviseur a écrits. Toujours vide : la décision
   *  de MIN-286 (docs/harness-opencode.md §2.15) est de n'en poser aucun. */
  plugins?: string[];
  baseUrl?: string;
  /**
   * Les fichiers de conventions du dépôt (`AGENTS.md`, `CLAUDE.md`) que le
   * superviseur a TROUVÉS — chemins absolus, racine du dépôt seulement.
   *
   * Ils remplacent ce qu'opencode faisait tout seul avant que
   * `OPENCODE_DISABLE_PROJECT_CONFIG` ne le lui retire (MIN-360).
   */
  repoInstructionFiles?: string[];
}

/**
 * LA CONFIG D'UN TOUR. Pure : même job, même document, à l'octet près — c'est ce
 * qui permet de la comparer dans un test au lieu de la relire.
 */
export function buildOpencodeConfig(
  job: VmJob,
  opts: BuildOpencodeConfigOptions = {},
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
    /**
     * L'ancrage minddy, PUIS les conventions du dépôt (MIN-360).
     *
     * Opencode allait chercher `AGENTS.md` / `CLAUDE.md` tout seul en remontant
     * depuis le dépôt. `OPENCODE_DISABLE_PROJECT_CONFIG` — qu'on pose désormais,
     * cf. `opencodeServerEnv` — lui retire ce geste EN MÊME TEMPS que les tools et
     * les plugins du dépôt, parce que c'est la même remontée. On les rend donc
     * explicitement : nommés, à la racine, et sans rien exécuter.
     */
    instructions: [opencodeAnchorFile(job.layout), ...(opts.repoInstructionFiles ?? [])],
    provider: {
      [OPENCODE_PROVIDER_ID]: {
        npm: OPENCODE_PROVIDER_NPM,
        name: "minddy",
        options: {
          /**
           * LE PLACEHOLDER, JAMAIS LA CLÉ — et c'est vrai des DEUX mondes, pour
           * deux raisons différentes.
           *
           * Ce document part sur le disque d'un process où le modèle exécute du
           * shell arbitraire, et il entre dans l'environnement du serveur
           * opencode (`OPENCODE_CONFIG_CONTENT`) : un `env` suffit à le lire.
           * Dans la microVM, la vraie clé est posée par le firewall à la sortie
           * (cf. `network-policy.ts`) ; sur la machine de l'utilisateur, où il
           * n'y a pas de firewall, elle est posée par le proxy LLM — en mémoire,
           * sur la seule route qu'il sert ([llm-proxy.ts](llm-proxy.ts), MIN-357).
           * Ce champ-ci ne change pas d'un monde à l'autre, et c'est le but.
           */
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
  opts: BuildOpencodeConfigOptions = {},
): Record<string, string> {
  return {
    OPENCODE_CONFIG_CONTENT: JSON.stringify(buildOpencodeConfig(job, opts)),
    OPENCODE_DB: opencodeDbPath(job.layout),
    /**
     * LES DEUX ÉCOUTILLES QUI FERMENT L'AUTO-DÉCOUVERTE (MIN-360) — et elles ne
     * sont pas de la prudence, elles ferment de l'EXÉCUTION DE CODE ARBITRAIRE
     * DEPUIS LE CONTENU D'UN DÉPÔT, sur la machine de l'utilisateur.
     *
     * Relevé dans le binaire (1.18.16, `opencode-darwin-arm64`), pas déduit :
     *
     * - `OPENCODE_PURE` → le chargeur de plugins SERVEUR fait
     *   `let A = flags.pure ? [] : config.plugin_origins ?? []`. Aucun plugin
     *   externe n'est chargé — ni ceux d'un `opencode.json` du dépôt, ni les
     *   `*.ts` que le binaire ramasse sous `.opencode/plugin(s)/`. Nos plugins à
     *   nous ne sont pas concernés : il n'y en a aucun (§2.15 du dossier) ;
     * - `OPENCODE_DISABLE_PROJECT_CONFIG` → `ConfigPaths.directories` cesse de
     *   remonter chercher `.opencode/` depuis le dépôt, et `ConfigPaths.files` de
     *   remonter chercher `opencode.json(c)`. Ça ferme les TOOLS du dépôt (des
     *   `*.ts` exécutés dès que le modèle les appelle) et ses serveurs MCP (un
     *   process lancé au démarrage de la session), que notre config ne pouvait
     *   pas neutraliser : elle est fusionnée APRÈS, donc elle GAGNE sur ce qui se
     *   remplace, mais ces trois-là s'AJOUTENT.
     *
     * Ce que la seconde retire aussi, et qui est rendu ailleurs : les `AGENTS.md`
     * et `CLAUDE.md` du dépôt, qu'opencode chargeait par la même remontée. Ils
     * repassent par `instructions` (cf. `BuildOpencodeConfigOptions`). Notre
     * dossier de tools, lui, est intact — il vient de `Path.config`
     * (`XDG_CONFIG_HOME`), qui reste inclus inconditionnellement.
     */
    OPENCODE_PURE: "1",
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    // C'est lui qui met les tools de domaine hors du dépôt (cf. `opencodeToolDir`).
    XDG_CONFIG_HOME: opencodeConfigHome(job.layout),
    // Les snapshots, les journaux et les binaires téléchargés — sous le harness
    // eux aussi (cf. `opencodeDataHome`).
    XDG_DATA_HOME: opencodeDataHome(job.layout),
    XDG_CACHE_HOME: opencodeCacheHome(job.layout),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    OPENCODE_DISABLE_EMBEDDED_WEB_UI: "1",
    // Le shell d'opencode est PERSISTANT et démarre où on le lui dit : le dépôt.
    OPENCODE_SHELL_CWD: job.layout.repoDir,
  };
}

/**
 * Le plafond de temps d'une commande, reporté sur celui du produit — le défaut
 * d'opencode est 120 s, le nôtre 180 s (`RUN_COMMAND_TIMEOUT_MS`). Exporté et non
 * posé dans la config : c'est un argument d'appel du tool `bash`, pas un réglage
 * global, et le superviseur est le seul à savoir combien de tour il reste.
 */
export const OPENCODE_BASH_TIMEOUT_MS = RUN_COMMAND_TIMEOUT_MS;
