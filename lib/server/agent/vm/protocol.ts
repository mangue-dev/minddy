import { HARNESS_DIR, type ChangedFile } from "../repo-host";
import type { AgentCheckpoint } from "../runs";
import type { AgentChatMessage } from "../agent-loop";
import type { AgentAnchor } from "../prompt";
import type { ScopedFavorite } from "../subagent-config";
import type { AgentProviderId } from "@/lib/agent-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { Locale } from "@/i18n/config";

/**
 * LE CONTRAT ENTRE LA FONCTION ET LA MICROVM (MIN-224) — ce que la fonction pose
 * sur le disque de la VM avant de lancer la boucle, et ce que la boucle rend
 * quand le tour est fini.
 *
 * Un fichier de TYPES SEULS, importé des deux côtés. C'est ce qui fait que la
 * frontière est vérifiée par le compilateur au lieu d'être vérifiée en
 * production : un champ ajouté d'un côté et oublié de l'autre ne compile pas.
 *
 * LA RÈGLE QUI DÉCIDE DE CE QUI EST DANS LE JOB. Y entre ce que la fonction est
 * SEULE à pouvoir résoudre — une clé, un token de forge, un appel de forge, un
 * réglage de compte, le contexte du ticket. N'y entre pas ce que la VM peut lire
 * elle-même sur son propre disque, ni ce qui bouge PENDANT le tour : le steering,
 * le drapeau d'interruption et l'état de la pull request se demandent au plan de
 * contrôle, à chaque round, parce qu'un job figé au démarrage ne saurait rien
 * d'un « Stop » cliqué dix minutes plus tard.
 */

/** Le bundle du harness, écrit par la fonction avant chaque tour. */
export const VM_BUNDLE_PATH = `${HARNESS_DIR}/main.js`;
/** Le job du tour, écrit à côté. Relu par le bundle à son démarrage. */
export const VM_JOB_PATH = `${HARNESS_DIR}/job.json`;

/**
 * Plafond du checkpoint qu'une boucle en VM peut REMONTER (MIN-221 §2).
 *
 * Le plan de contrôle passe par une fonction Vercel, dont le corps de requête
 * est plafonné à 4,5 Mo — mesuré : 4 Mio passent, 4,3 Mio font 413. Or
 * `MAX_CHECKPOINT_BYTES` vaut 8 Mo : un checkpoint à son plafond d'aujourd'hui
 * NE REMONTERAIT PAS, et c'est la conversation entière qu'on perdrait, en
 * silence, à la fin d'un tour de deux heures.
 *
 * On abaisse donc le gabarit POUR CE CHEMIN — `fitCheckpoint` prend déjà son
 * plafond en argument. C'est le moins cher des deux rattrapages qu'ouvrait le
 * cadrage : sortir le checkpoint de cette route demanderait un second canal
 * (blob signé, upload direct), donc une seconde surface à garder, pour un cas
 * que les paliers de `fitCheckpoint` savent déjà absorber — ils lâchent d'abord
 * du RE-DEMANDABLE (historiques de filles, images, sorties de tools).
 *
 * Sous `CONTROL_PLANE_MAX_BODY_BYTES` (4 Mo), avec de la marge pour l'enveloppe
 * JSON du rapport de fin de tour, qui porte le checkpoint parmi d'autres champs.
 */
export const VM_MAX_CHECKPOINT_BYTES = 3_200_000;

/** Ce que la boucle a besoin de savoir des sous-agents, résolu côté fonction. */
export interface VmSubagentConfig {
  /** Le modèle des filles est-il choisissable (OpenRouter seulement) ? */
  models: boolean;
  favorites: ScopedFavorite[];
  maxParallel: number;
  /** Ids du catalogue au tamis du plan, et ceux qu'il refuse — cf. `scopeSubagentModels`. */
  allowedIds: string[];
  abovePlanIds: string[];
  maxMultiplier: number | null;
}

/**
 * LE JOB D'UN TOUR. Écrit en JSON sous `/vercel/sandbox/harness` — hors de
 * `REPO_DIR`, pour que le `git add -A` de fin de tour n'emporte jamais
 * l'historique de la conversation dans un commit du dépôt de l'utilisateur.
 */
export interface VmJob {
  /** La ligne du run. `ledgerRunId` est `run.run_id ?? run.id` : l'identifiant
   *  sous lequel la DÉPENSE se compte, qui n'est pas celui de la ligne. */
  runId: string;
  ledgerRunId: string;
  projectId: string;
  /** Origine du plan de contrôle — le déploiement qui a lancé ce run, jamais la
   *  prod par défaut (cf. `agentControlOrigin`). */
  appOrigin: string;

  // ── Modèle ────────────────────────────────────────────────────────────────
  model: string;
  /** Base URL OpenAI-compatible. La CLÉ, elle, n'est pas ici : le firewall la
   *  pose après la sortie de la VM, et la boucle envoie un placeholder. */
  baseUrl: string;
  provider: AgentProviderId;
  /** Le placeholder que la boucle met dans `authorization` (cf. network-policy.ts). */
  llmPlaceholderKey: string;
  reasoningLevel: ReasoningLevel;
  contextWindow: number | null;

  // ── Ce que le tour a le droit de faire ────────────────────────────────────
  anchor: AgentAnchor;
  /** Faux sur une relecture de pull request : ni commit, ni push, ni `create_pr`. */
  writesToRepo: boolean;
  /** Faux pour un passage de routine : ni `ask_user`, ni `create_routine`. */
  interactive: boolean;
  /** Le run est une étape de chaîne → `report_verdict` est servi. */
  chain: boolean;
  imageInput: boolean;
  webSearch: boolean;
  /**
   * Plafond de recherches web du TOUR, partagé par le parent et ses filles.
   *
   * Résolu côté fonction, et ce n'est pas un caprice : la constante
   * (`MAX_WEB_SEARCHES_PER_TURN`) vit dans le module qui FACTURE la recherche,
   * lequel tient un client Supabase en clé de service — l'importer depuis la
   * boucle ferait entrer ce client dans le bundle de la microVM
   * (`vm-bundle-secrets.test.ts`). Le chiffre voyage donc, comme les réglages de
   * sous-agents, plutôt que d'être recopié à la main des deux côtés.
   */
  webSearchMax: number;
  subagents: VmSubagentConfig;

  // ── L'état du tour ────────────────────────────────────────────────────────
  /** Historique amorcé (tour froid) ou rehydraté depuis le checkpoint. */
  messages: AgentChatMessage[];
  instructions: { paths: string[]; bytes: number };
  usageSeqStart: number;
  /** Plafond restant, le plus serré du quota et du plafond de run. Absent = BYOK. */
  budgetUsd?: number;
  /**
   * Le tour reprend une conversation GARÉE en attente de ses sous-agents.
   *
   * Toujours faux dans la nouvelle forme, et le champ reste parce qu'il dit
   * pourquoi : une fille ne se met plus jamais en attente d'un chunk suivant,
   * puisqu'il n'y en a plus. Un run MIGRÉ dont le vieux checkpoint porte encore
   * le drapeau repart donc sans lui — au pire un aller-retour au modèle de plus,
   * pour lui faire constater qu'il n'attend personne.
   */
  parkedForSubagents: boolean;
  /** Fichiers édités que le type-check n'a pas encore vus (état de TOUR). */
  editedPaths: string[];
  repoTouched: boolean;
  /** Ancres de review déjà posées par ce run — le plafond des 5 est par RUN. */
  prInlineComments: number;

  // ── Le dépôt ──────────────────────────────────────────────────────────────
  baseBranch: string;
  workBranch: string;
  /** URL de push, token de forge ÉPHÉMÈRE compris. Il est déjà dans la microVM
   *  (c'est lui qui a cloné) ; la boucle en redemande un frais au plan de
   *  contrôle avant chaque push, un tour pouvant durer plus que le token. */
  authUrl: string;
  /** Référence lisible du run dans les messages de commit (`wip(...)`). */
  commitRef: string;
  /** Le point depuis lequel la fin de tour diffe : le dernier sha émis au fil
   *  (`checkpoint.lastFilesSha`), ou le HEAD d'entrée au tout premier tour. */
  filesFromSha: string;

  // ── Divers ────────────────────────────────────────────────────────────────
  locale: Locale;
  /** Feature de ledger des appels LLM : `routine_code` pour un passage de routine. */
  feature: "agent_code" | "routine_code";
  /** Sous quel gabarit la boucle rabote son checkpoint avant de le remonter. */
  checkpointMaxBytes: number;
}

/** Ce qu'un push a produit, tel que `commitAndPush` le rend. */
export interface VmPushResult {
  committed: boolean;
  remoteUpdated: boolean;
  headSha: string;
  pushed: boolean;
}

/**
 * LE RAPPORT DE FIN DE TOUR. La boucle a fini (ou s'est arrêtée), a poussé son
 * travail, et rend la main : à partir d'ici, tout ce qui reste — l'événement
 * `files_changed`, la réouverture d'une PR refusée, la mise au repos de la ligne,
 * la notification — est fait par la FONCTION, sur son propre accès à la base et à
 * la forge. La VM n'en fait aucune partie, et n'a rien à en croire.
 */
export interface VmTurnReport {
  /** Les mêmes états que `AgentLoopResult`, moins `suspended` : un tour qui vit
   *  dans la VM ne se découpe plus, donc il ne suspend plus. */
  status: "completed" | "interrupted" | "error" | "budget_exhausted";
  reply?: string;
  askedUser?: boolean;
  errorMessage?: string;
  /** Coût du tour, filles comprises. S'ajoute à `agent_runs.cost_usd`. */
  costUsd: number;
  /**
   * Le checkpoint, DÉJÀ raboté au gabarit par la boucle.
   *
   * ABSENT quand le tour a LEVÉ, et c'est le seul cas. La boucle a alors laissé
   * son historique dans un état qu'on n'a aucune raison de croire cohérent — un
   * `tool_call` sans son `tool_result` casserait le tour suivant au premier
   * aller-retour. Le dernier checkpoint PÉRIODIQUE, lui, a été écrit à une
   * frontière de round sûre : la fonction le GARDE, et n'écrit rien par-dessus.
   */
  checkpoint?: AgentCheckpoint;
  /** Les paliers que `fitCheckpoint` a dû lâcher — `history` se dit au fil. */
  checkpointDropped: string[];
  /** Taille AVANT rabotage : c'est elle qui dit si le tour a explosé. */
  checkpointBytes: number;
  /** Résultat du push de fin de tour. Null si le tour n'écrit pas (relecture). */
  pushed: VmPushResult | null;
  /** La branche de travail du tour. Remontée plutôt que relue : au PREMIER push
   *  d'un run, `agent_runs.branch_name` est encore nul — c'est ce push-là qui la
   *  fait exister, et la fonction doit savoir laquelle enregistrer. */
  workBranch: string;
  /** Message d'un push qui a ÉCHOUÉ — signal visible, pas un silence. */
  pushError?: string;
  /** Le diff du tour, calculé par git dans la VM. */
  changed?: { files: ChangedFile[]; truncated: boolean };
  /** Wall-clock de la microVM sur ce tour (début → fin) — la moitié compute de
   *  la facture, que plus personne ne tiendrait sans la boucle (MIN-221 §3). */
  sandboxMs: number;
}

/** Réponse du plan de contrôle à un tool de plateforme. */
export interface VmToolResponse {
  result: unknown;
  success: boolean;
  /** Images renvoyées par le tool (`read_resource` sur une maquette) — la forme
   *  d'`AgentToolImage`, redite ici pour que ce fichier reste des types de
   *  frontière et n'impose pas son import au serveur. */
  images?: Array<{ url: string; name?: string }>;
  /** Ancres posées, recompté côté fonction — le plafond des 5 vit là-bas. */
  inlineUsed?: number;
}
