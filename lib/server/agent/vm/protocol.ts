import { assertUsableLayout, type HarnessLayout } from "../harness-layout";
import type { ChangedFile } from "../repo-host";
import type { AgentCheckpoint } from "../runs";
import type { AgentAnchor } from "../prompt";
import type { ScopedFavorite } from "../subagent-config";
import type { AgentProviderId } from "@/lib/agent-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { Locale } from "@/i18n/config";
import type { AgentLiveDiff } from "../agent-contract";

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

/**
 * LA VERSION DU CONTRAT (MIN-354). À incrémenter dès qu'un champ change de sens
 * ou disparaît — pas quand on en AJOUTE un que l'ancien harness peut ignorer sans
 * mal.
 *
 * Ce qu'elle protège n'existait pas avant elle. Le harness n'est plus forcément
 * écrit par le déploiement qui le lance : il est téléchargé, puis MIS EN CACHE
 * sur une machine qu'on ne contrôle pas. Un bundle d'hier qui lit un job de forme
 * neuve ne lèverait pas — il lirait les champs qu'il connaît, ignorerait les
 * autres en silence, et jouerait le tour avec les anciens chemins. Sur ce lot-ci
 * précisément, ça veut dire : écrire dans `/vercel/sandbox` sur un Mac, donc
 * nulle part.
 *
 * D'où un refus EXPLICITE côté harness (`parseVmJob`), et pas une tolérance.
 *
 * **2 (MIN-358)** — `repoMode` est apparu, et c'est le cas d'école de la règle
 * ci-dessus lue à l'envers : un champ AJOUTÉ, mais qu'un harness d'hier ne peut
 * pas ignorer « sans mal ». Ignoré, il ferait un `git add -A` et un
 * `git checkout -b` dans le dépôt de quelqu'un — c'est-à-dire précisément ce que
 * ce lot existe pour empêcher. Le refus vaut mieux que le tour.
 */
export const VM_PROTOCOL_VERSION = 2;

/**
 * `vmBundlePath` et `vmJobPath` vivent désormais dans
 * [harness-layout.ts](../harness-layout.ts) et sont re-exportés ici pour leurs
 * lecteurs historiques.
 *
 * Ce n'est pas du rangement : ce fichier type-importe `../runs`, qui est
 * `server-only`, et le lanceur de l'app de bureau a besoin de ces deux
 * chemins-là. L'y suivre ferait entrer la moitié du serveur dans le type-check
 * de la coquille — mesuré : il tombe alors sur une quarantaine de fichiers qui
 * n'ont rien à voir avec elle. `harness-layout.ts`, lui, n'a aucun import, et
 * c'est ce qui en fait le seul module que les deux côtés peuvent lire.
 */
export { vmBundlePath, vmJobPath } from "../harness-layout";

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

/**
 * LES PRIX DU MODÈLE DU TOUR, au million de tokens (MIN-286).
 *
 * Pourquoi ils voyagent, alors que `inputUsdPerMTok` suffisait au seuil de
 * compaction : opencode CALCULE le coût de chaque round depuis un catalogue de
 * prix, et un modèle déclaré sans prix rend `cost: 0` — mesuré, tokens exacts et
 * coût nul, ce qui viderait le ledger en silence. En donnant NOS prix (ceux de
 * l'index OpenRouter, la même source que le multiplicateur et le plafond de
 * plan), le coût qu'opencode rend est le nôtre, et la seule inconnue que la sonde
 * de coût du lot 0 avait laissée ouverte — la dérive du catalogue models.dev —
 * disparaît (docs/harness-opencode.md §2.5).
 *
 * ABSENT = prix inconnus (BYOK hors index OpenRouter). Le coût rendu vaudra alors
 * zéro, et c'est au superviseur d'écrire l'usage en `estimated` plutôt que
 * d'inscrire un zéro au ledger.
 */
export interface VmModelPricing {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  /** Prix du cache, quand le fournisseur les publie — nos runs cachent beaucoup. */
  cacheReadUsdPerMTok?: number;
  cacheWriteUsdPerMTok?: number;
}

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
  /**
   * LES PRIX DES MODÈLES DE FILLE, par id (MIN-286) — même rôle et même source
   * que `VmJob.pricing`, pour la même raison : un modèle déclaré à opencode sans
   * prix fait rendre `cost: 0`, et la dépense d'une fille sortirait du ledger
   * sans un mot. Mesuré : une fille sur un modèle tarifé rend son coût comme la
   * mère (`1.4e-06` sur la sonde de délégation du 2026-08-12).
   *
   * Un favori dont le prix manque n'est PAS déclaré en agent : mieux vaut ne pas
   * l'offrir que de l'offrir gratuit.
   */
  pricing?: Record<string, VmModelPricing>;
}

/** Projet connu de cette machine pendant un tour local. */
export interface VmLocalProject {
  id: string;
  name: string;
  key: string;
  repoFullName: string | null;
  /** `null` signifie que ce projet n'a aucun dossier local valide sur ce Mac. */
  localPath: string | null;
}

/**
 * LE JOB D'UN TOUR. Écrit en JSON sous `layout.harnessDir` — hors du dépôt, pour
 * que le `git add -A` de fin de tour n'emporte jamais l'historique de la
 * conversation dans un commit du dépôt de l'utilisateur.
 */
export interface VmJob {
  /** La version du contrat (cf. `VM_PROTOCOL_VERSION`). Le harness REFUSE ce
   *  qu'il ne reconnaît pas plutôt que d'en ignorer les champs en silence. */
  protocolVersion: number;
  /**
   * OÙ CE TOUR TRAVAILLE (MIN-354) — dépôt, sorties de tools, harness, opencode.
   *
   * C'était six constantes de module sous `/vercel/sandbox`. C'est devenu une
   * valeur du run pour deux raisons qui n'en font qu'une : `/vercel` n'existe pas
   * sur une machine ordinaire, et une machine ordinaire peut porter deux runs à
   * la fois — là où une microVM en portait un par construction
   * ([harness-layout.ts](../harness-layout.ts)).
   */
  layout: HarnessLayout;
  /** La ligne du run. `ledgerRunId` est `run.run_id ?? run.id` : l'identifiant
   *  sous lequel la DÉPENSE se compte, qui n'est pas celui de la ligne. */
  runId: string;
  ledgerRunId: string;
  projectId: string;
  /** Origine du plan de contrôle — le déploiement qui a lancé ce run, jamais la
   *  prod par défaut (cf. `agentControlOrigin`). */
  appOrigin: string;
  /**
   * LE JETON D'EXÉCUTION LOCALE (MIN-355) — présent SEULEMENT quand le tour joue
   * sur la machine de l'utilisateur. En microVM, il n'y a rien à porter : le
   * firewall signe après la sortie de la VM.
   *
   * Il est ici, donc sur un disque que le modèle peut lire, et ce n'est pas une
   * négligence — un secret posé sur la machine qu'on soupçonne ne se cache pas.
   * Ce qui est traité, c'est son pouvoir (cf. `handleControlPlaneRequest`), et sa
   * durée : quinze minutes.
   *
   * LU AVANT TOUTE VALIDATION par [main.ts](main.ts), et il faut que ça reste
   * vrai : un harness qui REFUSE son job doit encore pouvoir dire pourquoi, et
   * sur le chemin local, parler demande ce jeton.
   */
  controlToken?: string;
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
  /** Prix d'entrée du modèle (USD/Mtok) — dimensionne le seuil de compaction, qui
   *  borne un COÛT par round et non un nombre de tokens. `null` = inconnu. */
  inputUsdPerMTok: number | null;
  /** Tous les prix du modèle, pour la config d'opencode (cf. `VmModelPricing`). */
  pricing?: VmModelPricing;

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
  /**
   * L'ÉTAT D'OPENCODE du tour précédent (MIN-286) — le journal d'événements que
   * le superviseur rejoue pour retrouver sa session. C'est LA mémoire d'un run :
   * absent sur un tour froid, présent dès le deuxième.
   *
   * Ce n'est PAS une conversation sérialisée : c'est un journal append-only,
   * incrémental par `seq`, dont la sonde du lot 0 a montré qu'il restaure une
   * session avec son id, ses messages et son coût cumulé sur une microVM qui n'a
   * jamais vu la conversation (86 events, 61 Ko, 95 ms).
   */
  opencode?: {
    sessionId: string;
    events: Record<string, unknown>[];
    seq: Record<string, number>;
  };
  /**
   * CE QUE LE SUPERVISEUR POSTE, ET L'ANCRAGE QU'IL INJECTE (MIN-286).
   *
   * Opencode a son PROPRE prompt système ; ce qui vient de nous, c'est
   * `anchorInstructions` (servi en `instructions`) et le message d'utilisateur.
   *
   * `anchorInstructions` est reconstruit à CHAQUE tour, et c'est un gain plutôt
   * qu'une redite : le fichier d'ancrage est relu par opencode à chaque démarrage,
   * donc l'instantané du ticket qu'il porte ne peut pas rester périmé une semaine
   * dans un historique.
   *
   * `prompt` est vide sur un tour REPRIS : la demande y arrive par le steering,
   * que le superviseur draine au démarrage (`pullSteering`). Un tour froid, lui,
   * porte ici le contexte du ticket et la demande du lanceur.
   */
  opencodeInput: { prompt: string; anchorInstructions: string };
  instructions: { paths: string[]; bytes: number };
  usageSeqStart: number;
  /** Plafond restant, le plus serré du quota et du plafond de run. */
  budgetUsd?: number;
  /** Fichiers édités que le type-check n'a pas encore vus (état de TOUR). */
  editedPaths: string[];
  repoTouched: boolean;
  /** Ancres de review déjà posées par ce run — le plafond des 5 est par RUN. */
  prInlineComments: number;

  // ── Le dépôt ──────────────────────────────────────────────────────────────
  baseBranch: string;
  workBranch: string;
  /**
   * La branche de travail peut-elle déjà exister sur le remote ?
   *
   * Faux sur le premier tour d'un run neuf : le mode dépôt courant part alors de
   * HEAD sans tenter un fetch réseau impossible. Absent vaut vrai pour garder un
   * harness ancien conservateur et ne jamais perdre une reprise distante.
   */
  remoteWorkMayExist?: boolean;
  /**
   * DANS QUEL DÉPÔT CE TOUR ÉCRIT (MIN-358, décision D2).
   *
   * - `clone` : un clone créé pour ce tour, à nous seuls (la microVM, et le mode
   *   worktree du jour où il existera). `git add -A` y est sans conséquence ;
   * - `current` : le checkout que l'utilisateur a déjà sur son disque, avec sa
   *   branche, son index et son WIP. La fin de tour y passe par
   *   [current-repo.ts](../current-repo.ts), qui ne touche à aucun des trois.
   *
   * Une VALEUR et non une déduction de `controlToken` : le mode d'exécution
   * (cloud/local) et la forme du dépôt sont deux questions, et D2 fait déjà du
   * worktree dédié une option d'une conversation locale.
   */
  repoMode: "clone" | "current";
  /**
   * Catalogue joint par l'app de bureau, uniquement pour les tours locaux.
   * Les chemins ne traversent jamais le plan de contrôle ni la base.
   */
  localProjects?: readonly VmLocalProject[];
  /**
   * IDENTITÉ GIT DES COMMITS DE L'AGENT (MIN-358). Elle voyage depuis que le
   * clone ne l'écrit plus dans `.git/config` : elle se pose par `git -c`, sur la
   * seule commande qui commite. Côté GitHub c'est le bot de l'App — une identité
   * rattachable à un vrai compte, sans quoi Vercel bloque le déploiement.
   */
  committer: { name: string; email: string };
  /** URL de push, token de forge ÉPHÉMÈRE compris. Il est déjà dans la microVM
   *  (c'est lui qui a cloné) ; la boucle en redemande un frais au plan de
   *  contrôle avant chaque push, un tour pouvant durer plus que le token. */
  authUrl: string;
  /** Référence lisible du run dans les messages de commit (`wip(...)`). */
  commitRef: string;
  /**
   * CE QUE L'AMORÇAGE A COÛTÉ EN MICROVM, et pourquoi il voyage.
   *
   * Le wall-clock facturé au ledger est tenu par la boucle, du début à la fin du
   * tour (MIN-221 §3) — mais son horloge ne démarre qu'au lancement du process
   * node. Avant lui, la fonction a réveillé ou CRÉÉ la microVM, posé la politique
   * réseau, cloné le dépôt sur un tour froid (~22 s mesurées, MIN-222) et écrit
   * 280 Ko de bundle. Cette tranche-là est du compute que la plateforme nous
   * facture, et qui ne tombait dans aucun compteur : la fonction ne facture plus
   * rien pour ces runs, et la VM ne pouvait pas connaître une durée d'avant sa
   * propre naissance.
   *
   * Une DURÉE, jamais un horodatage : deux horloges (celle de la fonction, celle
   * de la microVM) n'ont aucune raison d'être d'accord à la milliseconde près, et
   * un écart de sens inverse rendrait une durée négative. La mesure est prise
   * dans la fonction, de bout en bout, et ne traverse le réseau que comme un
   * nombre de millisecondes.
   */
  bootstrapMs: number;
  /** Le point depuis lequel la fin de tour diffe : le dernier sha émis au fil
   *  (`checkpoint.lastFilesSha`), ou le HEAD d'entrée au tout premier tour. */
  filesFromSha: string;

  // ── Divers ────────────────────────────────────────────────────────────────
  locale: Locale;
  /** Feature de ledger des appels LLM : `routine_code` pour un passage de routine. */
  feature: "agent_code" | "routine_code";
}

/**
 * LE JOB, RELU PAR LE HARNESS — et REFUSÉ s'il ne vient pas du même contrat.
 *
 * Trois refus, dans cet ordre, et chacun ferme une porte que le harness ne peut
 * pas refermer plus tard :
 *
 * 1. **Version inconnue.** Un bundle mis en cache sur une machine survit à son
 *    déploiement ; le jour où un champ change de sens, c'est ici, et nulle part
 *    ailleurs, qu'on peut encore s'en apercevoir. Un refus qui se dit vaut
 *    infiniment mieux qu'un tour qui joue avec la moitié d'un job.
 * 2. **Layout absent.** Sans lui, le harness n'a aucune raison de croire à un
 *    chemin plutôt qu'à un autre — et retomber sur `/vercel` serait exactement la
 *    tolérance silencieuse que la version existe pour supprimer.
 * 3. **Layout inutilisable** (`assertUsableLayout`) : c'est la racine de sécurité
 *    des garde-fous d'écriture, et elle arrive désormais par un JSON.
 *
 * LÈVE plutôt que de rendre un `null` : l'appelant est `main.ts`, dont le contrat
 * est de TOUJOURS rendre un rapport — un throw y devient un rapport d'erreur
 * visible dans le fil, un `null` y deviendrait une branche de plus à oublier.
 */
export function parseVmJob(raw: unknown): VmJob {
  const job = raw as Partial<VmJob> | null;
  if (!job || typeof job !== "object") {
    throw new Error("vm job: expected an object");
  }
  if (job.protocolVersion !== VM_PROTOCOL_VERSION) {
    throw new Error(
      `vm job: unsupported protocol version ${JSON.stringify(job.protocolVersion)} ` +
        `(this harness speaks ${VM_PROTOCOL_VERSION}) — the harness bundle is out of date`,
    );
  }
  if (!job.layout || typeof job.layout !== "object") {
    throw new Error("vm job: missing layout");
  }
  assertUsableLayout(job.layout);
  // MIN-358 : le mode du dépôt n'a PAS de défaut. Un job muet ne peut pas être
  // traité comme un clone — c'est le mode `current` qui est dangereux à jouer par
  // erreur, et c'est justement celui qu'un job d'une forme inattendue tairait.
  if (job.repoMode !== "clone" && job.repoMode !== "current") {
    throw new Error(`vm job: unknown repoMode ${JSON.stringify(job.repoMode)}`);
  }
  return job as VmJob;
}

/**
 * CE TOUR ÉCRIT-IL DANS LE DÉPÔT DE QUELQU'UN D'AUTRE ? (MIN-358)
 *
 * Nommé plutôt que testé sur place, pour la raison de `isLocalJob` juste en
 * dessous : la question se pose à quatre endroits (la préparation, le push, le
 * périmètre des diffs de fin de tour, le prompt), et un test recopié quatre fois
 * finit par ne plus vouloir dire la même chose partout.
 */
export function isCurrentRepoJob(job: Pick<VmJob, "repoMode">): boolean {
  return job.repoMode === "current";
}

/**
 * CE TOUR JOUE-T-IL SUR LA MACHINE DE L'UTILISATEUR ? (MIN-357)
 *
 * La réponse est la présence du JETON, et c'est voulu : un drapeau `local: true`
 * à côté de lui serait une seconde vérité sur le même fait, donc un jour une
 * divergence — un job qui se dit local sans jeton ne peut pas parler, un job qui
 * porte un jeton n'est rien d'autre qu'un job local (cf. `VmJob.controlToken`).
 *
 * Nommé ici plutôt que testé sur place : deux appelants aujourd'hui (le proxy
 * LLM par le superviseur, et le renouvellement de jeton demain, MIN-294), et ce
 * genre de test recopié est exactement ce qui finit par ne plus vouloir dire la
 * même chose des deux côtés.
 */
export function isLocalJob(job: Pick<VmJob, "controlToken">): boolean {
  return Boolean(job.controlToken?.trim());
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
   *  dans la VM ne se découpe plus, donc il ne suspend plus. Ce que la boucle
   *  appelle `suspended` arrive ici en `error`, et sa CAUSE voyage dans
   *  `errorCode` — sans quoi les trois causes seraient indiscernables. */
  status: "completed" | "interrupted" | "error" | "budget_exhausted";
  reply?: string;
  askedUser?: boolean;
  /**
   * POURQUOI le tour s'est arrêté, quand ce n'est pas une erreur quelconque.
   *
   * Les MÊMES codes que l'ancienne forme ([execute.ts](../execute.ts), le
   * garde-fou anti-runaway) — délibérément, et c'est ce qui rend ce champ bon
   * marché : `ERROR_CODE_KEYS`
   * ([agent-event-feed.tsx](../../../../components/agent/agent-event-feed.tsx))
   * et les deux catalogues `messages/*.json` les connaissent déjà, donc le fil
   * raconte la même chose des deux côtés sans une clé de plus.
   *
   * `turnTooBig` n'a PAS d'équivalent ici, et ce n'est pas un oubli : ce chemin
   * rabote son checkpoint par `fitCheckpoint` et dit `turnHistoryReset` quand il
   * a dû lâcher la conversation. Un tour ne meurt donc jamais de son volume.
   *
   * ABSENT = une erreur ordinaire, déjà racontée au fil par celui qui l'a levée
   * (la boucle sur une erreur LLM fatale, `main.ts` sur un tour qui lève).
   */
  errorCode?: "turnTooLong" | "providerUnavailable";
  /**
   * Ce que le fournisseur a répondu en dernier, sur un `providerUnavailable` —
   * la seule trace qui dise LAQUELLE des pannes (429, 502, réseau) a arrêté le
   * tour. À ne pas jeter au profit d'une phrase fixe : elle est tout ce qui
   * reste pour comprendre, et la phrase, elle, se déduit du code.
   */
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
  /**
   * Le diff du tour, calculé par git dans la VM.
   *
   * ABSENT hors fin de tour NATURELLE : `lastFilesSha` (la baseline du diff)
   * n'avance qu'en `completed`, et l'event `files_changed` est défini comme le
   * geste qui la fait avancer. Un tour interrompu garde donc son diff pour le
   * tour qui le termine, qui le racontera d'un seul tenant.
   */
  changed?: { files: ChangedFile[]; truncated: boolean; diff?: AgentLiveDiff };
  /**
   * Wall-clock de la microVM sur ce tour — la moitié compute de la facture, que
   * plus personne ne tiendrait sans la boucle (MIN-221 §3).
   *
   * `job.bootstrapMs` COMPRIS : la machine tournait déjà pendant que la fonction
   * la réveillait et clonait le dépôt. C'est UNE ligne de ledger pour le tour
   * entier, et c'est voulu — la bande de seq du compute
   * (`SANDBOX_USAGE_SEQ_BASE + continuations`) n'en distingue pas deux.
   */
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
