import {
  changedFiles,
  commitAndPush,
  readWorkFile,
  repoBackgroundRunner,
  sq,
  turnDiff,
  type RepoHost,
} from "../repo-host";
import { REPO_INSTRUCTION_FILES } from "../repo-instructions";
import {
  formatSecretFindings,
  isSecretFile,
  scanDiff,
  scanSecrets,
  type SecretFinding,
} from "../secret-scan";
import {
  commitTurnAndPush,
  dropIgnoredPaths,
  prepareCurrentRepo,
  readRepoState,
  turnPaths,
  type CurrentRepoState,
  type RepoState,
  type TurnPaths,
} from "../current-repo";
import { BackgroundJobs, OPENCODE_BACKGROUND_LOG_NOTES } from "../background";
// La MÊME normalisation que la boucle maison : `update_plan` est un tool de
// contrôle, et les deux moteurs doivent en tirer le même event `plan_update`.
import { normalizePlan } from "../agent-contract";
import { redactDeep, SecretRedactor } from "../redact";
import { cap } from "../tool-summary";
import type { AgentCheckpoint } from "../runs";
import type { ControlPlaneClient } from "./control-plane-client";
import { OpencodeClient } from "./opencode-client";
import {
  liveTextOf,
  newTurnStreamState,
  replyOf,
  translateEvent,
  type OpencodeEvent,
  type RoundUsage,
} from "./opencode-events";
import { opencodeAnchorFile, opencodeServerEnv, subagentAgentTable } from "./opencode-config";
import { localToolsFor, opencodeToolFiles, SUPERVISOR_URL_ENV } from "./opencode-tools";
import { startToolBridge, type SupervisorTool, type ToolBridge } from "./tool-bridge";
import { makeOpencodeDelivery, repoRelative, type OpencodeDelivery } from "./opencode-delivery";
import { newLiveEditLog } from "../live-edits";
import { decidePermission, editTargets } from "./opencode-permissions";
import { refineLocalVerdict } from "./local-guard";
import { startLlmProxy, type LlmProxy } from "./llm-proxy";
import { commitMessageFromReply } from "../commit-message";
import { BUDGET_REFRESH_INTERVAL_MS } from "@/lib/agent-models";
import { subagentUsageSeq } from "../subagent-config";
import {
  isCurrentRepoJob,
  isLocalJob,
  type VmJob,
  type VmPushResult,
  type VmTurnReport,
} from "./protocol";
import { parseAgentUserMessage, promptWithMentions, type AgentUserMessage } from "@/lib/agent-mentions";

/**
 * LE SUPERVISEUR (MIN-286, lot 1) — ce que devient `runVmTurn` quand la boucle
 * cesse d'être notre code.
 *
 * Il ne boucle pas. Il **pose le décor** (config, tools de domaine, ancrage),
 * **démarre `opencode serve`**, **poste le tour**, **traduit son flux** en
 * `agent_run_events`, et **rend le rapport** que le plan de contrôle attend déjà.
 * Tout ce qui reste de nous — le commit, le push, le diff du tour, le ledger, le
 * fil — est là ; tout ce qui était la boucle (rounds, retries, compaction,
 * troncature, appel modèle) n'y est plus.
 *
 * `main.ts` ne change pas : il appelle un tour, il obtient un `VmTurnReport`, et
 * sa garantie (« le tour rend TOUJOURS un rapport ») reste sa garantie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST ICI, ET CE QUI N'Y EST PAS ENCORE
 *
 * Ce fichier est le socle du lot 1 : démarrage, session, prompt, traduction du
 * flux, fin de tour. Le lot 2 y a accroché le ledger, le plafond de dépense, les
 * garde-fous (`command-guard` / `repo-path`, rejoués sur `permission.asked`),
 * `ask_user` (le tool `question`), les sous-agents, le pont de tools
 * ([tool-bridge.ts](tool-bridge.ts)), les règles de livraison
 * ([opencode-delivery.ts](opencode-delivery.ts)) et la forge (`create_pr`, coupé
 * en deux : la VM pousse, la fonction ouvre).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX MESURES QUI DÉCIDENT DE LA FORME (opencode-ai@1.18.16)
 *
 * 1. **`POST /api/session/:id/wait` répond 503** — la route existe dans l'OpenAPI,
 *    le serveur ne l'implémente pas. La fin d'un tour se lit donc sur
 *    `session.idle` du flux `/event`. C'est mieux de toute façon : rien ne tient
 *    une requête HTTP ouverte pendant les heures que dure un tour.
 * 2. **Le serveur doit rester au PREMIER PLAN** dans la microVM. Un `nohup … &`
 *    dans un `sh -c` du Sandbox fait tomber la commande RPC (`UND_ERR_SOCKET` en
 *    ~25 s, zéro ligne de sortie), le même serveur au premier plan démarre très
 *    bien — mesuré trois fois au lot 0. D'où `startServer`, injecté : ici on
 *    lance un process node ordinaire, et c'est l'appelant (la microVM) qui sait
 *    comment tenir son serveur en vie.
 */

/**
 * Plafond d'attente du démarrage du serveur.
 *
 * ~1,3 s mesuré au lot 0 — sur une microVM déjà chaude. **Le premier run de
 * production est mort ici** (2026-08-12) : sur une VM fraîchement créée depuis le
 * snapshot, le disque s'hydrate paresseusement et le premier exec des 176 Mo du
 * binaire se compte en minutes, pendant lesquelles le serveur accepte la connexion
 * sans répondre. Le plafond ne borne donc PAS la lenteur normale (elle est de
 * l'ordre de la seconde) : il borne le serveur qui ne démarrera jamais, et il doit
 * être large devant le pire démarrage à froid mesuré.
 */
export const OPENCODE_BOOT_TIMEOUT_MS = 5 * 60_000;

/**
 * LE PORT DU SERVEUR OPENCODE — un argument, plus une constante (MIN-354).
 *
 * Il valait 4096 en dur, et c'était vrai tant que le harness était seul dans une
 * microVM créée pour lui. Sur un ordinateur, deux runs simultanés se
 * disputeraient la même socket et le second mourrait sur un `listen` refusé — à
 * un endroit qui ne ressemble en rien à sa cause. `main.ts` le réserve au
 * système avant de démarrer ([free-port.ts](free-port.ts)).
 *
 * OBLIGATOIRE dans `SupervisorDeps`, et pas optionnel avec un repli à 4096 : un
 * défaut fixe est exactement la collision qu'on vient de supprimer, avec en plus
 * l'assurance que personne ne la verrait venir.
 */

/** Cadence du direct — la même que la boucle maison (`emitLive`, 250 ms). */
export const LIVE_INTERVAL_MS = 250;

/**
 * Bornes du scan de secrets avant push (MIN-360). Elles ne servent qu'à ce qu'un
 * tour de refonte ne paie pas le scan en minutes : un secret est court, et il est
 * en tête d'un fichier bien plus souvent qu'à sa fin.
 */
const SECRET_SCAN_MAX_BYTES = 2_000_000;
const SECRET_SCAN_MAX_FILES = 200;

/**
 * Cadence de sondage du « Stop » et de la file de steering.
 *
 * Deux requêtes au plan de contrôle toutes les cinq secondes au pire, et une seule
 * dans le cas courant (`/interrupt`, puis `/messages/pending` seulement s'il n'y a
 * pas de stop) — à comparer aux ~4 appels PAR SECONDE du direct. Ce n'est donc pas
 * ce sondage qui pèse sur le compte d'invocations.
 */
export const STEER_POLL_INTERVAL_MS = 5_000;

/**
 * LE BATTEMENT DU TOUR — ce qui fait vivre le « Stop », le steering, la
 * sauvegarde périodique et l'échéance murale QUAND LE FLUX SE TAIT.
 *
 * Un `bash` de vingt minutes ne publie rien entre son début et sa fin : sans
 * battement, le tour n'avait plus aucune horloge, et son seul signe de vie
 * (`last_activity_at`, écrit par la sauvegarde) se figeait. Aligné sur le sondage
 * de steering, dont il est la borne supérieure de latence.
 */
export const LIFECYCLE_BEAT_MS = 5_000;

/** Le jeton du battement, distinct de tout `IteratorResult`. */
const LIFECYCLE_BEAT = Symbol("lifecycle-beat");

/**
 * Cadence de la sauvegarde périodique du checkpoint — qui est AUSSI le seul
 * battement de cœur d'un tour d'opencode (cf. `maybeSaveCheckpoint`).
 *
 * DEUX MINUTES, sous les trois du chien de garde (`VM_LOOP_PROBE_AFTER_MS` dans
 * [drain.ts](../drain.ts)) : un tour vivant garde ainsi un `last_activity_at`
 * frais et n'est jamais candidat à la sonde de la plateforme. La boucle maison
 * sauvegarde toutes les cinq minutes ([turn.ts](turn.ts)) — elle peut, sa
 * commande répond à la sonde ; ici la sauvegarde est le seul signe de vie.
 */
export const SUPERVISOR_CHECKPOINT_SAVE_INTERVAL_MS = 2 * 60_000;

/**
 * Combien de temps on attend, en fin de tour, qu'un round coupé finisse d'arriver
 * chez le fournisseur (`proxy.settle`, MIN-286 lot 3).
 *
 * Mesuré : l'amont continue **1 221 ms** après le départ du client, et c'est sa
 * dernière frame qui porte le coût. Dix secondes laissent une marge large devant
 * ce chiffre tout en bornant le seul cas gênant — un flux que le fournisseur ne
 * fermerait jamais, qui retiendrait la fin du tour pour une ligne de ledger.
 */
export const ORPHAN_SETTLE_MS = 10_000;

/**
 * Plafond mural d'un TOUR. Repris de [turn.ts](turn.ts) sans changer de valeur :
 * ce qu'il protège n'a pas changé de nature — la session de microVM est plafonnée
 * à 24 h par la plateforme, et un tour tué par elle ne laisserait aucune trace.
 */
export const SUPERVISOR_TURN_SOFT_DEADLINE_MS = 12 * 60 * 60_000;

/**
 * L'ÉTAT D'OPENCODE ENTRE DEUX TOURS, porté par le checkpoint.
 *
 * Ce n'est plus une conversation sérialisée mais un **journal d'événements**
 * (sonde du lot 0) : la session repart avec son id, ses messages et son coût
 * cumulé sur une microVM qui n'a jamais vu la conversation.
 *
 * Ce que le checkpoint porte n'est QUE le pointeur — la session et le curseur par
 * agrégat. Les events, eux, vivent dans `agent_run_journal` (MIN-286,
 * 2026-08-13) : ils portent la sortie complète de chaque tool, et un checkpoint
 * qui les charriait dépassait le plafond du plan de contrôle en une quinzaine de
 * lectures de fichiers.
 */
export interface OpencodeCheckpointState {
  sessionId: string;
  /** Dernier `seq` connu par agrégat — l'argument de la prochaine exportation. */
  seq: Record<string, number>;
}

/** Un checkpoint de ce moteur : notre état de tour, plus le journal d'opencode. */
export type OpencodeCheckpoint = AgentCheckpoint & { opencode?: OpencodeCheckpointState };

/** Ce que le superviseur a besoin de savoir faire, et qu'on lui injecte. */
export interface SupervisorDeps {
  /**
   * Démarre le serveur et rend de quoi l'arrêter. Injecté parce que la façon de
   * tenir un process en vie appartient à l'hôte (cf. le piège du `nohup`), et
   * parce qu'un test n'a pas à faire tourner un binaire de 144 Mo.
   */
  startServer(env: Record<string, string>): Promise<{ stop(): Promise<void> }>;
  /** Écrit un fichier dans la microVM (config, tools, ancrage). */
  writeFile(path: string, content: string): Promise<void>;
  /** Le client HTTP du serveur — injecté pour les mêmes raisons. */
  client(baseUrl: string): OpencodeClient;
  /**
   * Le proxy local posé devant le fournisseur ([llm-proxy.ts](llm-proxy.ts)).
   * Injecté pour qu'un test n'ouvre pas de socket ; en production, c'est
   * `startLlmProxy`.
   */
  startProxy?(job: VmJob): Promise<LlmProxy>;
  /** Le pont de tools ([tool-bridge.ts](tool-bridge.ts)). Injecté pour un test. */
  startToolBridge?(opts: {
    job: VmJob;
    cp: ControlPlaneClient;
    delivery?: OpencodeDelivery;
    supervisorTools?: Record<string, SupervisorTool>;
    port?: number;
  }): Promise<ToolBridge>;
  /** Le port réservé du serveur opencode (cf. le bloc ci-dessus). */
  opencodePort: number;
  /**
   * Le port du pont de tools. ABSENT = éphémère, choisi par le système, et c'est
   * le cas de production : le pont rend son URL, personne n'a à connaître son
   * numéro. Un test peut en imposer un.
   */
  toolBridgePort?: number;
  now?(): number;
  /** Attente du démarrage. Réglable pour qu'un test ne poireaute pas 60 s. */
  bootTimeoutMs?: number;
  /** Le battement du tour (cf. `LIFECYCLE_BEAT_MS`). Réglable pour la même raison. */
  lifecycleBeatMs?: number;
}

/** Le texte d'ancrage minddy, servi en `instructions` au prompt système. */
export interface SupervisorInput {
  /** Ce que le tour demande au modèle (le message de l'utilisateur, ou l'amorce). */
  prompt: string;
  /** L'ancrage minddy (ticket / carnet / relecture), réinjecté en `instructions`. */
  anchorInstructions: string;
}

/**
 * LES CONVENTIONS DU DÉPÔT, TROUVÉES PLUTÔT QU'AUTO-DÉCOUVERTES (MIN-360).
 *
 * Opencode allait chercher `AGENTS.md` et `CLAUDE.md` tout seul, en remontant
 * depuis le dépôt. C'est la MÊME remontée qui ramassait les plugins et les tools
 * d'un `.opencode/`, c'est-à-dire du code arbitraire écrit par quiconque peut
 * committer — et c'est cette remontée qu'on vient de couper
 * (`OPENCODE_DISABLE_PROJECT_CONFIG`, cf. [opencode-config.ts](opencode-config.ts)).
 *
 * On rend donc le seul morceau qui n'exécute rien, et on le rend NOMMÉ : la racine
 * du dépôt, ces deux fichiers-là. Ce qu'on perd au passage, et qu'il vaut mieux
 * écrire : les fichiers de sous-dossiers, qu'opencode collait au fur et à mesure.
 * Le harness maison les servait paresseusement
 * ([repo-instructions.ts](../repo-instructions.ts)) ; ce chemin-ci ne les a plus,
 * et c'est le prix de la fermeture.
 *
 * Best-effort de bout en bout : une sonde muette rend une liste vide, jamais une
 * erreur — un tour ne s'arrête pas parce qu'un `ls` n'a pas répondu.
 */
async function repoInstructionFiles(host: RepoHost): Promise<string[]> {
  const names = REPO_INSTRUCTION_FILES;
  try {
    // `ls` sort en 1 dès qu'un des noms manque, mais liste quand même les autres
    // sur stdout : c'est la sortie qui fait foi, pas le code de retour.
    const res = await host.exec(`ls -1 ${names.map(sq).join(" ")} 2>/dev/null`, {
      timeoutMs: 30_000,
    });
    const found = new Set(res.stdout.split("\n").map((line) => line.trim()).filter(Boolean));
    return names.filter((name) => found.has(name)).map((name) => `${host.layout.repoDir}/${name}`);
  } catch {
    return [];
  }
}

/**
 * JOUE LE TOUR. Ne lève pas sur un échec de travail (push raté, serveur qui ne
 * démarre pas) : ces échecs se DISENT dans le rapport — même règle que
 * `runVmTurn`, et pour la même raison : un tour qui a écrit du code et n'a pas su
 * le pousser doit quand même remonter son état.
 */
export async function runOpencodeTurn(
  job: VmJob,
  input: SupervisorInput,
  cp: ControlPlaneClient,
  host: RepoHost,
  deps: SupervisorDeps,
): Promise<VmTurnReport> {
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const previous = job.opencode;

  const secrets = new SecretRedactor();
  let authUrl = job.authUrl;
  secrets.addAuthUrl(authUrl);

  /**
   * CE TOUR JOUE-T-IL SUR LA MACHINE DE QUELQU'UN ? (MIN-360)
   *
   * Lu une fois, ici, et passé partout : c'est le drapeau qui décide de trois
   * garde-fous que la microVM n'avait pas besoin de porter — la lecture des
   * `.env`, la portée de `webfetch`, et le refus d'une permission inconnue.
   */
  const local = isLocalJob(job);

  /** Ce qu'on rend quand le tour n'a pas pu commencer (ou s'est cassé en vol). */
  const failed = (message: string, costUsd = 0): VmTurnReport => ({
    status: "error",
    errorMessage: cap(secrets.redact(message), 1000),
    costUsd,
    checkpointDropped: [],
    checkpointBytes: 0,
    pushed: null,
    workBranch: job.workBranch,
    sandboxMs: job.bootstrapMs + (now() - startedAt),
  });

  /**
   * LE DÉPÔT DE L'UTILISATEUR, PRÉPARÉ AVANT TOUT LE RESTE (MIN-358).
   *
   * Avant le décor, avant le proxy, avant le pont : c'est le seul endroit d'où
   * l'on peut encore sortir sans rien avoir ouvert à refermer. Et il n'y a pas de
   * mode dégradé — un dépôt qu'on ne sait pas lire est un tour qui n'a nulle part
   * où écrire.
   *
   * `null` en mode clone, et c'est ce `null` qui, plus bas, décide de la forme du
   * commit : `git add -A` dans un clone à nous, l'index temporaire dans le
   * checkout de quelqu'un.
   */
  let current: CurrentRepoState | null = null;
  /** L'arbre de travail tel qu'il était AVANT que le modèle ne touche à rien —
   *  l'autre moitié du périmètre du tour (cf. `turnScope`). */
  let stateAtStart: RepoState = new Map();
  if (isCurrentRepoJob(job)) {
    try {
      current = await prepareCurrentRepo(host, {
        runId: job.runId,
        authUrl,
        workBranch: job.workBranch,
      });
      stateAtStart = await readRepoState(host);
    } catch (err) {
      return failed((err as Error).message);
    }
    // Event neutre (invisible au fil, comptable en base) : la branche que
    // l'utilisateur avait sous les doigts et ce qu'il avait en cours quand le
    // tour a commencé. C'est ce qui permettra de relire un tour dont la pull
    // request contient des commits que personne n'attribue à l'agent.
    await cp
      .emit("status", {
        phase: "current_repo",
        branch: current.branch,
        dirty: current.dirty,
        resumed: current.resumed,
      })
      .catch(() => {});
  }
  /**
   * La baseline du diff du tour. En mode clone elle vient du job ; en mode dépôt
   * courant, au PREMIER tour, la fonction ne pouvait pas la connaître — c'est le
   * HEAD d'une machine qu'elle n'a jamais vue. Le harness la résout donc lui-même.
   */
  const filesFromSha = job.filesFromSha || current?.parent || "";

  // ── Le décor, posé avant le premier octet de serveur ───────────────────────
  await deps.writeFile(opencodeAnchorFile(job.layout), input.anchorInstructions);
  for (const file of opencodeToolFiles(job)) {
    await deps.writeFile(file.path, file.content);
  }

  // Le proxy AVANT le serveur : sa `baseURL` entre dans la config du tour, donc
  // elle doit être connue avant qu'opencode ne lise son environnement.
  // `secrets.redact` est une lambda liée au registre, qui est MUTABLE : le token
  // re-minté avant un push (cf. `pushWork`) est substitué par le proxy dès qu'il
  // est enregistré, sans que le proxy ait à être reconstruit.
  //
  // ET C'EST LUI QUI PORTE LA CLÉ SUR UNE MACHINE (MIN-357) : `apiKey` n'est
  // câblé que pour un tour local, où aucun firewall ne la posera à la sortie. Le
  // superviseur ne la voit jamais — il passe le MOYEN de la demander, et elle ne
  // vit que dans la mémoire du proxy, ni dans le job ni dans l'environnement du
  // serveur opencode. Un mint refusé fait lever `startLlmProxy`, donc échouer le
  // tour avec son motif : c'est la conduite voulue, pas une régression.
  const proxy = await (deps.startProxy ??
    ((j: VmJob) =>
      startLlmProxy({
        job: j,
        redact: secrets.redact,
        ...(isLocalJob(j) ? { apiKey: () => cp.llmKey() } : {}),
      })))(job);
  /**
   * Le pont de tools, ouvert AVANT le serveur pour la même raison que le proxy :
   * son adresse entre dans l'environnement d'opencode, donc elle doit exister
   * avant qu'il ne le lise. C'est lui qui tient les compteurs du TOUR — plafond
   * de recherches web, ancres de relecture ([tool-bridge.ts](tool-bridge.ts)).
   */
  /**
   * LE PÉRIMÈTRE DU TOUR (MIN-358) — ce que ce tour, et lui seul, a le droit de
   * livrer et de relire dans le dépôt de quelqu'un d'autre.
   *
   * Deux sources unies ici parce que le superviseur est le seul à avoir les
   * deux : l'instantané pris avant le premier round, et les éditions notées par
   * les permissions d'opencode ([current-repo.ts](../current-repo.ts) explique
   * pourquoi aucune des deux ne suffit).
   *
   * Recalculé à chaque appel, jamais mémoïsé : l'arbre de travail bouge pendant
   * tout le tour, et une liste figée au premier `create_pr` raterait tout ce que
   * le modèle écrit ensuite.
   */
  const turnScope = async (): Promise<TurnPaths> => {
    if (!current) return { paths: [], carried: [] };
    const scope = turnPaths({
      edited: delivery.turnEditedPaths(),
      owned: job.editedPaths,
      before: stateAtStart,
      after: await readRepoState(host),
    });
    return { ...scope, paths: await dropIgnoredPaths(host, scope.paths) };
  };

  /**
   * LES RÈGLES DE LIVRAISON (lot 2, tâche 14), construites AVANT le pont : c'est
   * lui qui sert `write_issue_plan` et `create_pr`, donc lui qui porte la voix du
   * harness. Le superviseur, de son côté, leur donne les deux faits qui viennent
   * des tools intégrés — une écriture autorisée, une commande terminée.
   */
  const delivery = makeOpencodeDelivery({
    host,
    emit: (type, payload) => cp.emit(type, payload),
    filesFromSha,
    editedPaths: job.editedPaths,
    repoTouched: job.repoTouched,
    ...(current ? { scopePaths: async () => (await turnScope()).paths } : {}),
    remainingMs: () => SUPERVISOR_TURN_SOFT_DEADLINE_MS - (now() - startedAt),
  });

  /**
   * L'offre de sous-agents du tour, telle que la config vient de la déclarer.
   * Une seule source ([opencode-config.ts](opencode-config.ts)) : ce qui est
   * servi au modèle, ce que le garde-fou accepte et ce que le fil affiche sont
   * dérivés du même tableau, donc ne peuvent pas diverger.
   *
   * Construits AVANT le pont parce que `create_pr` les consulte : commiter
   * pendant qu'une fille écrit emporterait son travail à moitié posé.
   */
  const agentTable = new Map(subagentAgentTable(job).map((a) => [a.name, a]));
  const subagents = new SubagentRegistry(
    new Map([...agentTable].map(([name, a]) => [name, a.mode])),
  );

  /**
   * LES JOBS DE FOND (MIN-286, lot 3 ; MIN-114 pour la politique) — `bash` n'a pas
   * de mode fond, donc le tool est à nous et son registre vit ICI.
   *
   * `background.ts` ne bouge pas d'une ligne : le plafond de jobs, le garde-fou
   * `checkCommand`, les offsets et la mise en forme y sont purs, et ce sont eux
   * qui manquaient au repli (« lance ton serveur en `&` ») que ce tool remplace.
   * Ce qui est neuf tient en trois branchements : le pont l'exécute, `create_pr`
   * tue avant de stager, la fin de tour tue avant de commiter.
   *
   * `seqBase: 0` comme dans [turn.ts](turn.ts) : les fichiers de log sont
   * numérotés par TOUR, et un tour a sa microVM.
   */
  const background = new BackgroundJobs(
    repoBackgroundRunner(host),
    0,
    // Le log vit hors du dépôt, et une lecture hors dépôt est refusée par notre
    // propre verdict de permission (`external_directory`) : c'est le SHELL qu'on
    // envoie le lire, pas `read`.
    OPENCODE_BACKGROUND_LOG_NOTES,
  );
  const servesBackground = localToolsFor(job).some(
    (t) => t.function.name === "run_background",
  );

  /**
   * Les jobs tués avant un `git add -A`, DIT au modèle. Un serveur arrêté en
   * silence lui laisse croire qu'il tourne, et il enchaîne des `curl` sur un port
   * mort en cherchant ce qu'il a cassé (MIN-209).
   */
  async function stopJobsForStaging(): Promise<string> {
    const stopped = await background.stopAll().catch(() => 0);
    if (stopped === 0) return "";
    return (
      `${stopped === 1 ? "1 background job was" : `${stopped} background jobs were`} stopped ` +
      `before staging — nothing may write to the repository while it is being committed. Restart what you still need.`
    );
  }

  /**
   * LE PUSH DU TOUR, en un seul endroit — il sert deux fois : `create_pr` (la VM
   * pousse, la fonction ouvre) et la fin de tour.
   *
   * L'URL de push est RE-RÉSOLUE à chaque fois, et ce n'est pas une précaution de
   * style : un tour de microVM dure des heures, un token d'installation de forge
   * une heure. Le registre de secrets est cumulatif — le token du clone reste
   * lisible dans `.git/config` longtemps après avoir été remplacé ici.
   */
  /**
   * LE SCAN DE SECRETS, ET IL EST DUR (MIN-360) — il LÈVE, donc rien n'est commité
   * et rien n'est poussé.
   *
   * Ce qui le rend nécessaire tient en une phrase : la fin de tour publie une pull
   * request **sans humain devant l'écran**, et la porte de livraison
   * ([delivery-gate.ts](../delivery-gate.ts)) est une porte de QUALITÉ — rien n'y
   * cherchait une fuite. Tant que le dépôt était un clone jetable, le seul secret à
   * portée était celui du dépôt ; en mode dépôt courant, le `.env` réel de
   * l'utilisateur est à côté des fichiers du tour.
   *
   * DEUX SOURCES, parce qu'aucune ne suffit :
   *
   * 1. **le diff** ([secret-scan.ts](../secret-scan.ts) n'y lit que les lignes
   *    AJOUTÉES : un secret déjà présent dans le dépôt bloquerait sinon tous les
   *    tours qui touchent à ce fichier, pour toujours) ;
   * 2. **les fichiers NEUFS**, qui n'apparaissent dans aucun `git diff` tant qu'ils
   *    ne sont pas suivis — et un `.env` recopié est exactement ça.
   *
   * Le refus revient au modèle comme une erreur de tool sur `create_pr`, et se
   * publie au fil par `pushError` en fin de tour. Aucun des deux n'est un silence.
   */
  async function assertNoSecretsPushed(): Promise<void> {
    const scope = current ? (await turnScope()).paths : undefined;
    const { diff, porcelain } = await turnDiff(host, filesFromSha, scope);
    const findings: SecretFinding[] = scanDiff(diff.slice(0, SECRET_SCAN_MAX_BYTES));

    const untracked = porcelain
      .split("\n")
      .filter((line) => line.startsWith("??"))
      .map((line) => line.slice(3).trim())
      // Un chemin non-ASCII sort CITÉ de `git status --porcelain` (le `-z` seul ne
      // cite pas, cf. current-repo.ts). On le laisse tomber plutôt que de le
      // déciter à la main : c'est le scan d'un fichier neuf qu'on perd, pas le
      // diff, et une désérialisation approximative ferait ouvrir un mauvais chemin.
      .filter((path) => path && !path.startsWith('"'))
      .slice(0, SECRET_SCAN_MAX_FILES);
    for (const path of untracked) {
      // Un fichier de la famille dotenv se refuse sur son NOM : son contenu n'a
      // pas à ressembler à quoi que ce soit pour ne pas partir dans une PR.
      if (isSecretFile(path)) {
        findings.push({ kind: "environment file", file: path, sample: path });
        continue;
      }
      const content = await readWorkFile(host, path).catch(() => null);
      if (content) findings.push(...scanSecrets(content.slice(0, SECRET_SCAN_MAX_BYTES), path));
    }

    if (findings.length > 0) throw new Error(formatSecretFindings(findings));
  }

  async function pushWork(message: string): Promise<VmPushResult> {
    await assertNoSecretsPushed();
    authUrl = (await cp.repoAuthUrl()) ?? authUrl;
    secrets.addAuthUrl(authUrl);
    if (!current) {
      return await commitAndPush(host, {
        authUrl,
        workBranch: job.workBranch,
        baseBranch: job.baseBranch,
        message,
        committer: job.committer,
      });
    }
    /**
     * LE MÊME PUSH, DANS LE DÉPÔT DE QUELQU'UN D'AUTRE (MIN-358) — index
     * temporaire, `commit-tree`, ref à nous. Rien de ce que l'utilisateur a sous
     * les doigts n'est touché, et la pull request sort quand même.
     */
    const pushed = await commitTurnAndPush(host, {
      runId: job.runId,
      authUrl,
      workBranch: job.workBranch,
      message,
      committer: job.committer,
      // Le parent RÉEL est relu par `commitTurnAndPush` à chaque appel : le
      // second push d'un tour (`create_pr`, puis la fin de tour) doit prolonger
      // le premier commit, pas lui fabriquer un frère.
      fallbackParent: current.parent,
      scope: await turnScope(),
    });
    /**
     * LE CAS QUE RIEN NE REFERME, ET QUI DOIT DONC SE DIRE : l'agent a livré des
     * fichiers que l'utilisateur avait lui aussi modifiés, donc son travail à lui
     * part dans la pull request. C'est le prix du mode dépôt courant — deux mains
     * dans le même fichier — et ce qui serait fautif, ce serait de le taire.
     */
    if (pushed.carried.length > 0) {
      await cp
        .emit("status", {
          phase: "current_repo_overlap",
          files: pushed.carried.length,
          paths: pushed.carried.slice(0, 20),
        })
        .catch(() => {});
    }
    return pushed;
  }

  /**
   * `create_pr` — LE SEUL TOOL COUPÉ EN DEUX, et il l'est dans le bon sens : le
   * dépôt vit dans la microVM, le token de forge et l'état de la pull request
   * côté fonction ([control-plane.ts](../control-plane.ts), `runCreatePr`). Le
   * superviseur pousse donc, puis fait ouvrir.
   *
   * Trois choses le distinguent d'un passe-plat, et chacune répare un cas réel :
   *
   * 1. **Il ne franchit pas la porte de livraison seul** : le pont l'enveloppe de
   *    `gateCreatePr` ([opencode-delivery.ts](opencode-delivery.ts)), donc le
   *    premier appel d'un tour qui a édité rend les contrôles au lieu de pousser.
   * 2. **La branche est REMONTÉE, pas relue.** `agent_runs.branch_name` n'est
   *    stampé qu'après un push réel (MIN-123), or ce push-ci est justement le
   *    premier du run dans le cas normal : la fonction lirait une branche nulle
   *    et ouvrirait la pull request sur une tête vide.
   * 3. **Il refuse pendant qu'une fille écrit.** Le sandbox est PARTAGÉ et
   *    `commitAndPush` fait `git add -A` : livrer maintenant emporterait le
   *    travail d'un `implement` à moitié posé (un composant sans ses traductions,
   *    un renommage laissé au milieu). C'est le verrou d'écriture du parent
   *    ([subagent.ts](../subagent.ts), `writeLock`), tenu ici parce que la
   *    demande de permission ne voit passer que les tools d'opencode.
   *
   * Et il porte de nouveau un `jobsNote` : depuis que `run_background` est reposé
   * en tool local, un serveur de dev peut très bien tourner au moment de la
   * livraison. Il est tué AVANT le staging, et le modèle l'apprend dans la même
   * réponse — y compris quand le push échoue derrière.
   */
  const createPr: SupervisorTool | null = job.writesToRepo
    ? async (args) => {
        const writing = subagents.runningImplementId();
        if (writing) {
          return {
            result: {
              error:
                `Sub-agent ${writing} is editing the repository right now, and this sandbox is SHARED — ` +
                `committing now would capture its work half-written. Wait for its report: it is handed to ` +
                `you on its own, you have nothing to call.`,
            },
            success: false,
          };
        }
        const title = typeof args.title === "string" ? args.title.trim() : "";
        // Rien ne doit écrire dans le dépôt pendant le `git add -A` : un watcher
        // qui régénère un fichier au milieu du staging se fait commiter à moitié.
        const jobsNote = await stopJobsForStaging();
        let pushed: VmPushResult;
        try {
          pushed = await pushWork(title || `wip(${job.commitRef}): agent update`);
        } catch (err) {
          // Un push raté est une erreur de TOOL : le modèle la lit et décide. Le
          // message peut recopier l'URL de push, token compris (MIN-239).
          const detail = `push failed: ${secrets.redact((err as Error).message)}`;
          return {
            result: { error: jobsNote ? `${detail} ${jobsNote}` : detail },
            success: false,
          };
        }
        const res = await cp.callTool("create_pr", {
          args,
          pushed,
          ...(jobsNote ? { jobsNote } : {}),
          workBranch: job.workBranch,
        });
        return { result: res.result, success: res.success };
      }
    : null;

  /**
   * Motif du refus d'un appel de tool, par `callId`. Il ne sert qu'à une chose, et
   * elle compte : reposer `tool_result.reason` sur l'event du tool refusé, comme la
   * boucle maison le faisait (`FORBIDDEN_COMMAND_REASON` est ce qui rend les refus
   * MESURABLES sur `agent_run_events`). Le traducteur, lui, est pur : il ne sait ni
   * ce qu'on a répondu à une permission, ni ce que le pont a refusé.
   *
   * Déclaré AVANT le pont parce que les deux l'alimentent : le verdict de
   * permission pour les tools intégrés, le pont pour les tools locaux
   * (`run_background`, dont `checkCommand` écarte un `git push`).
   */
  const refusedCalls = new Map<string, string>();

  const bridge = await (deps.startToolBridge ?? startToolBridge)({
    job,
    cp,
    delivery,
    onToolRefused: (callId, reason) => refusedCalls.set(callId, reason),
    // Une session de RELECTURE n'a ni l'un ni l'autre : `agentToolsFor` ne les
    // sert pas à l'ancrage `pr`, et le pont refuse ce qui arriverait quand même.
    supervisorTools: {
      ...(createPr ? { create_pr: createPr } : {}),
      // `handle` ne lève jamais : tout revient au modèle comme un résultat de
      // tool, réussi ou en erreur (plafond atteint, commande refusée, job inconnu).
      ...(servesBackground ? { run_background: (args) => background.handle(args) } : {}),
      /**
       * LA CHECKLIST DU TOUR — un tool de CONTRÔLE, exécuté ici et nulle part
       * ailleurs (le même geste que la boucle maison : normaliser, émettre
       * `plan_update`, miroiter vers le plan du ticket, répondre `ok`).
       *
       * Il partait jusqu'ici au plan de contrôle avec les tools de domaine, qui
       * n'a pas de handler pour lui : `404: unknown platform tool: update_plan`
       * à chaque appel, sur TOUS les runs opencode — la barre de plan du fil ne
       * s'est jamais remplie, et le modèle lisait une erreur là où il attendait
       * un accusé de réception.
       */
      update_plan: async (args) => {
        const plan = normalizePlan(args.plan);
        await cp.emit("plan_update", { plan });
        // Miroir vers le plan de l'issue — best-effort, ne bloque jamais le tour.
        await cp.syncPlan(plan).catch(() => {});
        return { result: { ok: true }, success: true };
      },
    },
    ...(deps.toolBridgePort != null ? { port: deps.toolBridgePort } : {}),
  });

  const env = {
    ...opencodeServerEnv(job, {
      baseUrl: proxy.url,
      repoInstructionFiles: await repoInstructionFiles(host),
    }),
    // L'adresse du pont, lue par les 32 tools générés (cf. `SUPERVISOR_URL_ENV`).
    [SUPERVISOR_URL_ENV]: bridge.url,
  };

  /**
   * DÉMARRÉ DANS LE `try`, et ce n'est pas un détail de forme : le proxy et le
   * pont écoutent déjà. Un serveur qui ne démarre pas laisserait sinon leurs deux
   * sockets ouvertes, et un process qui enchaînerait deux tours se ferait refuser
   * son `listen` et mourrait de ça, pas de sa cause.
   */
  let server: { stop(): Promise<void> } | null = null;
  const client = deps.client(`http://127.0.0.1:${deps.opencodePort}`);

  /**
   * LE LEDGER DU TOUR, DÉCLARÉ HORS DU `try` — pour que le chemin d'EXCEPTION
   * puisse encore lui reprendre ce que le fournisseur a facturé (MIN-286).
   *
   * Il ne prend sa valeur qu'une fois la session connue ; avant ça il n'y a rien
   * à rendre, et `null` le dit.
   */
  let ledger: TurnLedger | null = null;

  try {
    server = await deps.startServer(env);
    const bootTimeoutMs = deps.bootTimeoutMs ?? OPENCODE_BOOT_TIMEOUT_MS;
    const bootStartedAt = now();
    if (!(await client.waitHealthy(bootTimeoutMs))) {
      // Le temps RÉELLEMENT attendu, pas le plafond : les deux ne coïncident que
      // si chaque sonde a rendu à l'heure, et c'est justement ce qu'on veut lire.
      return failed(
        `opencode did not become healthy — waited ${now() - bootStartedAt} ms (cap ${bootTimeoutMs} ms)`,
      );
    }

    // ── La session : reprise par le journal, ou neuve ────────────────────────
    let sessionId = previous?.sessionId ?? "";
    if (previous?.events?.length) {
      // La reprise coûte 95 ms pour 86 events (mesuré) — et c'est ce qui rend un
      // tour indépendant de la microVM qui l'a précédé.
      await client.syncReplay(previous.events).catch((err) => {
        console.error("[supervisor] replay failed:", (err as Error).message);
        sessionId = "";
      });
    }
    if (!sessionId) {
      sessionId = (await client.createSession(`minddy ${job.commitRef}`)).id;
    }

    // ── Le flux, traduit au fil de l'eau ─────────────────────────────────────
    const state = newTurnStreamState();
    const turnLedger = new TurnLedger(job, sessionId, subagents);
    ledger = turnLedger;
    let costUsd = 0;
    let sessionError: string | undefined;
    let lastLiveAt = 0;
    /**
     * OUTILS AMORCÉS DANS LE ROUND EN COURS — par ROUND, et par la MÈRE seule.
     *
     * Le fil lit ce compteur comme un prédicat : `tools === 0` ⇒ le texte en
     * train de s'écrire est peut-être la réponse finale, et il prend la place du
     * résumé ([agent-event-feed.tsx](../../../../components/agent/agent-event-feed.tsx),
     * `isLiveAnswer`). La boucle maison envoie `acc.size`, l'accumulateur INTERNE
     * à un round (`agent-loop.ts`) : un cumul de tour dirait « narration » sur
     * toutes les réponses d'un tour qui a appelé un tool une fois, et compterait
     * en plus les gestes des filles, qui ne sont pas ceux de la mère.
     */
    let toolsSeen = 0;
    /**
     * LA RÉFLEXION EN COURS, telle que le direct la raconte (MIN-122).
     *
     * `startedAt` est l'horodatage d'opencode ; la durée se calcule ici parce que
     * c'est ici qu'il y a une horloge — le traducteur, lui, reste pur. Remis à
     * `null` dès que le part se ferme : un compteur qui continuerait de courir
     * derrière un modèle qui écrit dirait qu'il pense encore.
     */
    let reasoningSince: number | null = null;
    /**
     * LES FICHIERS DU TOUR EN COURS, portés par CHAQUE charge du direct — la
     * moitié provisoire dont `files_changed` (dérivé de git, en fin de tour) est
     * l'autorité. Le module est partagé avec l'autre moteur ([live-edits.ts](../live-edits.ts))
     * pour la raison qui l'a fait naître : un état tenu en double finit par ne
     * plus l'être, et la liste ne s'affichait alors que sur un des deux chemins.
     *
     * Ce qu'on sait ici est plus pauvre qu'un `edit_file` maison : la demande de
     * permission donne le CHEMIN, pas la nature du geste. Tout est donc noté
     * `modified` — la liste de git, en fin de tour, dira « ajouté » ou
     * « supprimé » si c'en était.
     */
    const liveEdits = newLiveEditLog();
    /** Ce que le tour a encore le droit de dépenser. Absent = BYOK, illimité. */
    let budgetUsd = job.budgetUsd;
    let lastBudgetAt = now();
    let budgetExhausted = false;
    /** Le tour s'est terminé sur des questions : la session ATTEND l'utilisateur. */
    let askedUser = false;
    /**
     * UNE COUPURE QU'ON A DEMANDÉE, et une seule — le drapeau se CONSOMME.
     *
     * Opencode publie la même `MessageAbortedError` qu'on ait coupé le round
     * (plafond, « Stop », steering, deadline, question) ou qu'il ait été tranché
     * en vol. Ce compteur est ce qui les distingue : ce qu'on a demandé se tait,
     * le reste est une panne. Consommé plutôt que laissé à `true`, parce qu'un
     * tour continue après un steering — la coupure SUIVANTE, elle, n'a été
     * demandée par personne.
     */
    let abortsRequested = 0;
    const abortSession = async (): Promise<void> => {
      abortsRequested += 1;
      await client.abort(sessionId);
    };
    /**
     * Délégations AUTORISÉES dont la fille n'est pas encore née, par `callId`.
     * Le plafond de simultané se compte dessus autant que sur les vivantes
     * (cf. `SubagentContext.pending`) ; le crédit se solde à la naissance de la
     * fille, ou à la fin du `task` s'il n'en a jamais fait.
     */
    const pendingTasks = new Set<string>();

    const abortEvents = new AbortController();
    const stream = client.events(abortEvents.signal);

    /**
     * ── LE STEERING ET LE « STOP » (MIN-286, lot 3) ───────────────────────────
     *
     * Ce que la boucle maison faisait à chaque frontière de round : drainer les
     * messages de l'utilisateur, les injecter, et sortir sur le drapeau
     * d'interruption. Sans ça, un projet basculé perdrait les deux gestes les plus
     * visibles du produit — le bouton « Stop » ne ferait rien, et un message écrit
     * pendant qu'un tour travaille resterait dans la file jusqu'au tour d'après.
     *
     * UN MESSAGE NE S'INJECTE PAS DANS UNE SESSION QUI TRAVAILLE. Chez opencode il
     * n'y a pas d'historique à muter entre deux appels : il y a un tour en cours.
     * Le geste est donc `abort` (40 ms mesurés, la requête en vol se termine
     * proprement) puis un nouveau prompt sur la session — ce qui passe par
     * `pendingPrompt`, posté au `session.idle` qui suit. C'est la même frontière que
     * la boucle maison, atteinte par l'autre bout.
     *
     * `pullSteering` DRAINE : on ne l'appelle donc que quand on est en mesure de
     * poster derrière. Un message drainé et non posté serait perdu — personne ne le
     * remet dans la file, et le plan de contrôle ne re-queue le run que sur la file.
     */
    let pendingPrompt: Array<{ message: AgentUserMessage; steered: boolean }> = [];
    let interrupted = false;
    let lastSteerAt = now();

    /**
     * LE CURSEUR DU JOURNAL D'OPENCODE — et RIEN QUE le curseur (MIN-286,
     * 2026-08-13).
     *
     * Le superviseur n'accumule plus les events : il pousse chaque incrément dans
     * `agent_run_journal` (`POST /journal`) et ne garde que la position par
     * agrégat. Ce qu'il portait avant — le journal entier, réécrit à chaque
     * sauvegarde — ne pouvait pas tenir : un `read` de 260 lignes pèse 22 Ko
     * dedans, republié deux à trois fois par opencode, et le corps du plan de
     * contrôle est plafonné à 3,2 Mo. Un tour de 31 minutes perdait donc TOUTE sa
     * conversation, et le tour suivant repartait du ticket comme s'il n'avait
     * jamais travaillé (mesuré le 2026-08-13, run `1e8775aa`).
     */
    let journalSeq: Record<string, number> = { ...(previous?.seq ?? {}) };
    /**
     * L'INCRÉMENT, DÉCOUPÉ POUR LE TRANSPORT. Le corps d'une requête reste
     * plafonné par la plateforme : un round qui lit deux cents fichiers rendrait
     * un seul export de plusieurs mégaoctets. On envoie donc par lots — et jamais
     * un event à cheval sur deux lots, `/sync/replay` voulant une suite contiguë.
     */
    const JOURNAL_BATCH_BYTES = 1_500_000;

    /**
     * Exporte ce qui est neuf et le POUSSE. Rend le pointeur que le checkpoint
     * portera — la session et le curseur, quelques dizaines d'octets.
     */
    const syncJournal = async (): Promise<OpencodeCheckpointState> => {
      const fresh = await client.syncHistory(journalSeq);
      let batch: Record<string, unknown>[] = [];
      let bytes = 0;
      const flush = async () => {
        if (batch.length === 0) return;
        await cp.appendJournal(sessionId, batch);
        batch = [];
        bytes = 0;
      };
      for (const raw of fresh) {
        /**
         * LE JOURNAL EST SUBSTITUÉ COMME LE FIL (MIN-328). Il porte la sortie
         * COMPLÈTE de chaque tool — un `cat .git/config`, un `git remote -v` —,
         * il est écrit dans `agent_run_journal`, et il est rejoué dans la session
         * au tour suivant : un secret qui y entre est persisté en base ET remis
         * devant le modèle. Le fil d'events l'était depuis MIN-239, pas lui.
         */
        const event = redactDeep(raw, secrets.redact) as Record<string, unknown>;
        const size = JSON.stringify(event).length;
        // Un event plus gros que le lot part SEUL : le découper serait le casser.
        if (bytes > 0 && bytes + size > JOURNAL_BATCH_BYTES) await flush();
        batch.push(event);
        bytes += size;
      }
      await flush();
      // Le curseur n'avance qu'une fois l'incrément ÉCRIT : un envoi qui lève
      // laisse la position d'avant, et le passage suivant réexporte la même
      // tranche plutôt que de laisser un trou dans le journal.
      journalSeq = lastSeqByAggregate(journalSeq, fresh);
      return { sessionId, seq: journalSeq };
    };

    /**
     * LA SAUVEGARDE PÉRIODIQUE, ET LE BATTEMENT DE CŒUR AVEC — car c'est le même
     * geste (MIN-286 ; le défaut est celui du run de la PR 51).
     *
     * Ce moteur n'en avait AUCUN. Le seul écrivain de `last_activity_at` sur un
     * run qui travaille est cette sauvegarde ([control-plane.ts](../control-plane.ts),
     * `PUT /checkpoint`), et le superviseur ne construisait son checkpoint qu'à
     * la toute fin. Un tour d'opencode paraissait donc muet depuis son lancement,
     * et le chien de garde des microVM ([drain.ts](../drain.ts)) allait interroger
     * la plateforme dès trois minutes de « silence » — sur un tour parfaitement
     * vivant. Une sonde qui répond mal à ce moment-là conclut « process mort » :
     * le fil affiche « le processus de ce tour s'est arrêté avant d'avoir fini »,
     * le run passe au repos, et le rapport de fin de tour arrive derrière pour se
     * faire refuser en 409 — **la conversation du tour est alors perdue**, ce qui
     * est exactement ce que le message promettait d'éviter (« restaurée depuis sa
     * dernière sauvegarde » : il n'y en avait aucune).
     *
     * DEUX MINUTES, et le chiffre n'est pas libre : il doit rester SOUS le délai
     * au bout duquel le chien de garde va sonder (trois minutes de
     * `last_activity_at` figé, `VM_LOOP_PROBE_AFTER_MS`). Un tour vivant n'est
     * alors jamais candidat à la sonde, et la question de savoir si la sonde dit
     * vrai ne se pose plus. La boucle maison sauvegarde toutes les cinq minutes
     * ([turn.ts](turn.ts)) : elle peut se le permettre, son process répond à la
     * sonde depuis son lancement.
     */
    let lastSaveAt = now();
    /** Le run a été conclu SOUS nous (409 sur la sauvegarde) : le tour s'arrête. */
    let runClosed = false;
    const maybeSaveCheckpoint = async (): Promise<void> => {
      if (now() - lastSaveAt < SUPERVISOR_CHECKPOINT_SAVE_INTERVAL_MS) return;
      lastSaveAt = now();
      try {
        const opencode = await syncJournal();
        // `lastFilesSha` reste celui du départ : rien n'est poussé avant la fin
        // du tour, donc la baseline du diff n'a pas bougé.
        if (!(await cp.saveCheckpointQuietly(turnCheckpoint(filesFromSha, opencode)))) {
          runClosed = true;
        }
      } catch (err) {
        // Une sauvegarde ratée ne casse pas le tour : elle coûte la reprise, et
        // le prochain passage réessaiera. Ce qu'elle ne doit pas faire, c'est
        // repousser l'échéance en silence — d'où la trace.
        console.error("[supervisor] periodic checkpoint failed:", (err as Error).message);
      }
    };

    /**
     * L'ÉTAT DU TOUR, à la forme du checkpoint — le même objet en cours de route
     * et à l'arrivée, à deux champs près (le sha des fichiers, qui bouge au push).
     * Écrit une fois : deux constructions parallèles finiraient par diverger, et
     * c'est la moitié en cours de route qui serait oubliée.
     */
    function turnCheckpoint(
      lastFilesSha: string,
      opencode?: OpencodeCheckpointState,
    ): OpencodeCheckpoint {
      return {
        // L'historique de la CONVERSATION n'est plus ici : il vit dans le journal
        // d'opencode. Le champ reste (le type est partagé avec l'autre moteur) et
        // part vide — c'est ce qui rend la bascule réversible sans migration.
        messages: [],
        /**
         * OÙ EN EST LA NUMÉROTATION DU LEDGER, et c'est le tour SUIVANT qui la lit
         * (`execute.ts` : `run.checkpoint?.usageSeq ?? …`). Sans elle, un tour
         * repris renumérote ses lignes par-dessus celles du tour d'avant : rien
         * n'est perdu (pas de contrainte d'unicité, la dépense se somme), mais
         * l'ordre des appels d'un run devient faux — et c'est exactement ce qu'un
         * `seq` sert à dire.
         */
        usageSeq: turnLedger.nextParentSeq,
        lastFilesSha,
        instructions: { paths: [...job.instructions.paths], bytes: job.instructions.bytes },
        // Le plafond des 5 ancres de relecture se compte sur la vie du RUN, pas du
        // tour : le compte revient de la fonction à chaque appel, et c'est le
        // checkpoint qui le porte jusqu'au tour suivant (miroir de `turn.ts`).
        ...(bridge.prInlineComments > 0 ? { prInlineComments: bridge.prInlineComments } : {}),
        /**
         * L'ÉTAT DE LA PORTE DE LIVRAISON, qui porte sur le TOUR et voyage donc
         * semé. Sans lui, un tour repris après coupure de la VM se croit vierge :
         * il n'a plus rien édité, donc plus rien à type-checker ni à relire, et le
         * code part chez un humain sans qu'aucun contrôle ne l'ait vu.
         */
        ...(delivery.checkpointEditedPaths().length > 0
          ? { editedPaths: delivery.checkpointEditedPaths() }
          : {}),
        ...(delivery.repoTouched() ? { repoTouched: true } : {}),
        ...(opencode ? { opencode } : {}),
      };
    }
    const takeSteering = async (): Promise<AgentUserMessage[]> =>
      (await cp.pullSteering().catch(() => []))
        .map(parseAgentUserMessage)
        .filter((message) => message.text.trim());
    /**
     * Poste le prompt en attente sur une session au repos, et dit au fil ce qui
     * vient de l'UTILISATEUR.
     *
     * `steered` distingue les deux, et ce n'est pas cosmétique : le prompt du tour
     * est déjà dans le fil (c'est le message de lancement, ou la réponse affichée
     * par le composer), alors qu'un message de steering n'a pas d'autre trace.
     * Émettre les deux ferait lire deux fois la même phrase à l'utilisateur.
     */
    const postPending = async (): Promise<void> => {
      const parts = pendingPrompt.splice(0);
      if (parts.length === 0) return;
      /**
       * UN ROUND NEUF N'A AUCUNE COUPURE EN ATTENTE. Le compteur se DÉCRÉMENTAIT
       * seulement, et un `abort` peut très bien ne rien publier — opencode répond
       * 200 sur une session déjà au repos (`opencode-client.ts`), et le steering
       * coupe justement une session dont le round vient parfois de finir. Le
       * crédit restait alors ouvert jusqu'à la fin du tour, et la PROCHAINE
       * coupure subie — celle que personne n'a demandée — se faisait avaler en
       * silence : ni event, ni erreur, un tour rangé « terminé ».
       *
       * L'ordre du flux rend la remise à zéro sûre : `session.error`
       * (`MessageAbortedError`) précède le `session.idle` d'où l'on repose, donc
       * une vraie coupure demandée est déjà consommée quand on arrive ici.
       */
      abortsRequested = 0;
      /**
       * ET LE TOUR REPART PROPRE. Un round coupé (steering) ne publie ni `usage`
       * ni fin de round : sans cette remise à zéro, son compteur d'outils
       * continuait de courir sous les rounds suivants. Et une erreur de session
       * déjà passée ne doit pas condamner ce qui recommence ici : on la garde
       * pour le fil (l'event `error` est parti), pas pour le VERDICT du tour —
       * sinon un tour relancé qui finit bien se rangeait « en erreur », sans son
       * `summary`, donc lu comme interrompu.
       */
      toolsSeen = 0;
      sessionError = undefined;
       for (const part of parts) {
         if (part.steered) {
           await cp.emit("user_message", {
             text: cap(part.message.text, 4000),
             ...(part.message.mentions?.length ? { mentions: part.message.mentions } : {}),
           });
         }
       }
       await client.promptAsync(
         sessionId,
         parts.map((part) => promptWithMentions(part.message.text, part.message.mentions)).join("\n\n"),
       );
    };

    /**
     * LE PREMIER PROMPT DU TOUR : ce que la fonction a composé (contexte du ticket
     * + demande, sur un tour froid) PLUS ce qui attendait dans la file. Un tour
     * repris n'a que le second — c'est par là qu'arrivent la réponse à une question
     * et le « et maintenant fais plutôt ça » écrit pendant que la VM dormait.
     */
    pendingPrompt = [
       ...(input.prompt.trim()
         ? [{ message: { text: input.prompt.trim() }, steered: false }]
         : []),
       ...(await takeSteering()).map((message) => ({ message, steered: true })),
    ];
    if (pendingPrompt.length === 0) {
      /**
       * RIEN À DIRE AU MODÈLE : on ne poste pas un prompt vide, et surtout on ne
       * fabrique pas une relance (« continue ») qui ferait payer un round pour
       * apprendre qu'il n'y a rien à faire. Le tour se termine, la fonction met la
       * session au repos, et le prochain message la réveillera.
       */
      console.error("[supervisor] nothing to prompt — ending the turn");
      return {
        status: "completed",
        costUsd: 0,
        checkpointDropped: [],
        checkpointBytes: 0,
        pushed: null,
        workBranch: job.workBranch,
        sandboxMs: job.bootstrapMs + (now() - startedAt),
      };
    }
    await postPending();

    const deadline = startedAt + SUPERVISOR_TURN_SOFT_DEADLINE_MS;
    let timedOut = false;

    /**
     * ── LA VIE DU TOUR, HORS DU FLUX ──────────────────────────────────────────
     *
     * Le « Stop », le steering, le battement de cœur et l'échéance murale. Rend
     * `true` quand le tour doit sortir.
     *
     * Sortie de la boucle d'events pour une raison qui n'est pas de forme : ces
     * quatre-là ne doivent PAS dépendre de l'arrivée d'un event. Un `bash` de
     * vingt minutes, un modèle qui réfléchit longtemps, un fournisseur qui cale :
     * le flux se tait, et avec lui s'arrêtaient le seul écrivain de
     * `last_activity_at` — donc le chien de garde partait sonder une microVM
     * parfaitement vivante (`drain.ts`, trois minutes) —, le bouton « Stop », et
     * la deadline de douze heures. Un flux muet gelait le tour entier.
     */
    const lifecycle = async (): Promise<boolean> => {
      /**
       * LE « STOP » ET LE STEERING. La granularité est celle du battement : un
       * `bash` de trois minutes retarde le stop de cinq secondes au plus, là où il
       * le retardait de trois minutes — c'était déjà le pire cas de la boucle
       * maison, qui ne relisait le drapeau qu'entre deux rounds.
       */
      if (now() - lastSteerAt >= STEER_POLL_INTERVAL_MS) {
        lastSteerAt = now();
        if (await cp.checkInterrupt().catch(() => false)) {
          /**
           * UN STOP ACCOMPAGNÉ D'UN MESSAGE se poursuit dans CE tour (« arrête-toi
           * et fais plutôt ça ») : le composer envoie toujours le couple steer
           * PUIS interrupt. On ne draine donc que là, et on consomme le drapeau —
           * sans quoi le sondage suivant le relirait et sortirait, message accepté
           * et jamais joué (même raisonnement que `clearInterrupt` dans
           * `agent-loop.ts`).
           */
          const steered = await takeSteering();
          if (steered.length === 0) {
            interrupted = true;
            await abortSession();
            return true;
          }
          await cp.clearInterrupt().catch(() => {});
           pendingPrompt.push(...steered.map((message) => ({ message, steered: true })));
          await abortSession();
        } else if (await cp.hasPendingMessages().catch(() => false)) {
          // Drainé seulement maintenant qu'on sait qu'on va couper pour le poster.
           pendingPrompt.push(
             ...(await takeSteering()).map((message) => ({ message, steered: true })),
           );
          if (pendingPrompt.length > 0) await abortSession();
        }
      }
      // La sauvegarde périodique EST le battement de cœur (cf. son commentaire).
      await maybeSaveCheckpoint();
      if (runClosed) {
        // Le run a été conclu ailleurs (annulé, ou déjà stampé). Continuer, ce
        // serait dépenser au nom d'une conversation qui n'existe plus.
        interrupted = true;
        await abortSession();
        return true;
      }
      if (now() > deadline) {
        timedOut = true;
        await abortSession();
        return true;
      }
      return false;
    };

    try {
      /**
       * LE FLUX, LU À LA MAIN PLUTÔT QU'EN `for await` — pour que le silence ne
       * gèle rien (cf. `lifecycle`). L'attente de l'event suivant court contre un
       * battement ; la promesse en vol est GARDÉE d'un tour de boucle à l'autre,
       * sans quoi chaque battement en ouvrirait une nouvelle et laisserait tomber
       * l'event que la précédente allait rendre.
       */
      const beatMs = deps.lifecycleBeatMs ?? LIFECYCLE_BEAT_MS;
      const iterator = stream[Symbol.asyncIterator]();
      let nextEvent: Promise<IteratorResult<OpencodeEvent>> | null = null;
      for (;;) {
        nextEvent ??= iterator.next();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const beat = new Promise<typeof LIFECYCLE_BEAT>((resolve) => {
          timer = setTimeout(() => resolve(LIFECYCLE_BEAT), beatMs);
        });
        const winner = await Promise.race([nextEvent, beat]);
        clearTimeout(timer);
        if (winner === LIFECYCLE_BEAT) {
          if (await lifecycle()) break;
          continue;
        }
        nextEvent = null;
        if (winner.done) break;
        const raw = winner.value;
        const out = translateEvent(raw, state);
        // Une session qui n'est pas la mère est une FILLE : le modèle a délégué,
        // et opencode publie tout sur le même flux. Ce qui vient d'elle se dit,
        // se compte et se facture — mais dans sa bande à elle, et sans jamais
        // parler au nom de la mère (cf. `Translation.sessionId`).
        const child = !!out.sessionId && out.sessionId !== sessionId;

        /**
         * LE GARDE-FOU, RÉPONDU AVANT TOUT LE RESTE — un tool suspendu attend, et
         * chaque milliseconde de plus est du temps de microVM facturé. La
         * décision est pure ([opencode-permissions.ts](opencode-permissions.ts)),
         * ce qui la rend testable sans serveur ; ce qui est ici est le
         * branchement, et le fait qu'un refus se raconte au fil.
         */
        // Une fille rattachée à son appel de `task` : c'est ce qui donne son nom
        // aux events qui vont suivre, et sa bande au ledger. Sa naissance solde
        // du même geste le crédit ouvert par l'autorisation (cf. `pendingTasks`).
        if (out.child) {
          subagents.register(out.child);
          pendingTasks.delete(out.child.callId);
        }

        if (out.permission) {
          let verdict = decidePermission(
            out.permission,
            job.layout.repoDir,
            {
              names: new Set(agentTable.keys()),
              running: subagents.running,
              pending: pendingTasks.size,
              maxParallel: job.subagents.maxParallel,
            },
            { local },
          );
          /**
           * PUIS LE DISQUE ET LE RÉSOLVEUR (MIN-360), et sur le chemin local
           * seulement. Deux garde-fous ne se décident pas sur une chaîne : un
           * lien symbolique posé dans le dépôt (`ln -s`, que rien n'empêche) et
           * un domaine public qui résout vers la boucle locale.
           *
           * Le sens est à sens unique — `refineLocalVerdict` ne peut que refuser
           * ce qui était autorisé —, et il est appliqué AVANT les effets de bord
           * du verdict : une écriture refusée ici ne doit pas entrer dans le
           * périmètre du tour.
           */
          if (local) {
            verdict = await refineLocalVerdict(out.permission, verdict, job.layout.repoDir);
          }
          if (verdict.reason && out.permission.callId) {
            refusedCalls.set(out.permission.callId, verdict.reason);
          }
          /**
           * UNE DÉLÉGATION AUTORISÉE OUVRE UN CRÉDIT, jusqu'à ce que sa fille
           * existe. C'est ce qui rend le plafond de simultané opérant sur le seul
           * cas qui le mette à l'épreuve : un round qui appelle `task` plusieurs
           * fois, dont les demandes sont toutes arbitrées avant la première
           * naissance (cf. `SubagentContext.pending`).
           */
          if (
            out.permission.permission === "task" &&
            verdict.reply === "once" &&
            out.permission.callId
          ) {
            pendingTasks.add(out.permission.callId);
          }
          /**
           * UNE ÉCRITURE AUTORISÉE EST UNE ÉDITION DU TOUR. C'est le seul endroit
           * où on la voit : chez opencode, l'édition est un tool INTÉGRÉ, et sa
           * demande de permission est ce que notre `edit_file` nous disait. De là
           * viennent le type-check ciblé de la porte de livraison, le mode
           * `related` du runner de tests, et le verrou « le dépôt a été touché ».
           */
          if (out.permission.permission === "edit" && verdict.reply === "once") {
            /**
             * UN PATCH TOUCHE N FICHIERS ET NE DEMANDE QU'UNE FOIS. `editPaths`
             * rend la vraie liste (`metadata.files`) plutôt que le `filepath`
             * recollé à la virgule, qui donnait une seule ligne « a.ts, b.ts,
             * c.ts » dans les fichiers changés — et une seule entrée pour le
             * type-check ciblé de la porte de livraison, sur un chemin qui
             * n'existe pas.
             */
            const targets = editTargets(out.permission);
            for (const { path } of targets) delivery.noteEdit(path);
            // …et elles se VOIENT tout de suite : une édition n'avance pas le
            // round (ni texte, ni réflexion), donc rien d'autre ne ferait partir
            // une charge de direct avant le round suivant.
            const live = targets
              .map(({ path, status }) => ({ path: repoRelative(job.layout.repoDir, path), status }))
              .filter((edit) => edit.path);
            if (live.length > 0 && !child) {
              liveEdits.note(live);
              lastLiveAt = 0;
              cp.emitLive({
                text: secrets.redact(liveTextOf(state, sessionId)),
                tools: toolsSeen,
                reasoningActive: false,
                reasoningMs: 0,
                ...liveEdits.payload(),
              });
            }
          }
          await client
            .replyPermission(out.permission.id, verdict.reply, verdict.message)
            .catch((err) => {
              // Un verdict qui n'arrive pas laisse le tool suspendu jusqu'à la
              // deadline du tour. À dire, donc — mais pas à faire tomber le tour :
              // le modèle verra son tool ne jamais rendre, et c'est déjà un signal.
              console.error("[supervisor] permission reply failed:", (err as Error).message);
            });
        }

        /**
         * LA QUESTION AU LIEU DU TOUR. `ask_user` a toujours été TERMINAL chez
         * nous : les questions partent au fil, la session se met en attente, et
         * la réponse revient au tour suivant par le steering. Chez opencode le
         * tool BLOQUE — tenir une microVM ouverte le temps qu'un humain revienne
         * coûterait des heures de compute pour ne rien faire.
         *
         * On écarte donc la question (le tool se résout, l'historique reste
         * apparié) et on coupe le tour. Mesuré : `reject` rend le tool en erreur
         * « The user dismissed this question », et l'`abort` seul le rendrait
         * « Tool execution aborted » — les deux laissent un historique que le
         * tour suivant rejoue sans trou.
         */
        if (out.question && !child) {
          askedUser = true;
          await client.rejectQuestion(out.question.id);
          await abortSession();
        }

        /**
         * CE QUE LE MODÈLE A VÉRIFIÉ LUI-MÊME (MIN-262) : une commande de test du
         * dépôt sortie en 0, sans réédition derrière, fait taire la porte de
         * livraison — elle ne relance pas 80 s de tests pour apprendre ce que le
         * tour vient de lire. Une fille compte comme la mère : c'est le même
         * dépôt, et la porte ne regarde que le dépôt.
         */
        if (out.shell) delivery.noteShell(out.shell.command, out.shell.exit);

        for (const event of out.events) {
          /**
           * `update_plan` NE FAIT PAS DE BULLE — c'est un tool de CONTRÔLE, et la
           * boucle maison n'en émettait aucun event (`agent-loop.ts` : `emit`
           * `plan_update` puis `continue`, avant toute écriture de `tool_call`).
           * Chez opencode il passe par le binaire comme les autres, donc le flux
           * en publie les parts : sans ce filtre, le fil montrait la checklist
           * DEUX fois — une barre de plan et un appel de tool brut au-dessus —, et
           * le compteur d'outils du direct comptait un geste qui n'en est pas un.
           */
          if (event.payload.name === "update_plan") continue;
          if (event.type === "tool_call" && !child) toolsSeen += 1;
          // Un `task` qui se termine sans avoir fait de fille (erreur, refus)
          // rendrait son crédit éternellement ouvert : le plafond se refermerait
          // sur un tour qui ne délègue plus rien.
          if (event.type === "tool_result" && event.payload.name === "spawn_agent") {
            pendingTasks.delete(String(event.payload.id ?? ""));
          }
          const reason =
            event.type === "tool_result"
              ? refusedCalls.get(String(event.payload.id ?? ""))
              : undefined;
          let payload = redactPayload(event.payload, secrets);
          // Un `spawn_agent` ne porte que le NOM de l'agent : on lui rend le mode
          // et le modèle que le fil affiche depuis MIN-112.
          if (payload.name === "spawn_agent") payload = describeSpawn(payload, agentTable);
          // Ce qui vient d'une fille se dit SOUS son appel de `task` : sans ce
          // marquage, le fil attribuerait à l'agent principal les gestes de
          // quelqu'un d'autre, et les déplierait au premier niveau.
          const entry = child ? subagents.entry(out.sessionId ?? "") : undefined;
          if (entry) payload = markChildPayload(payload, entry);
          await cp.emit(event.type, {
            ...payload,
            ...(reason ? { reason } : {}),
            // Une fille que le flux n'a rattachée à rien reste marquée : mieux
            // vaut un event replié sous un id de session qu'un geste attribué à
            // l'agent principal.
            ...(child && !entry ? { subagent_id: out.sessionId } : {}),
          });
        }
        if (out.usage) {
          /**
           * LE DIRECT SE TAIT À LA FIN D'UN ROUND QUI CONTINUE, comme `clearLive`
           * de la boucle maison : ce qui vient de s'écrire est déjà parti au fil
           * en `thinking`, et le laisser aussi dans la charge du direct le ferait
           * lire en double — une bulle provisoire sous sa version définitive.
           *
           * Le round FINAL, lui, garde son texte au direct : sa version définitive
           * (`summary`) ne part qu'à la toute fin du tour, et l'effacer ici ferait
           * disparaître la réponse de l'écran le temps de l'export du journal et
           * du push. « Final » se lit sur `tool-calls`, et pas sur « différent de
           * `stop` » : c'est la SEULE fin qui laisse la session travailler, et le
           * traducteur tranche déjà la narration sur le même critère.
           */
          if (!child && out.usage.finish === "tool-calls") {
            reasoningSince = null;
            lastLiveAt = 0;
            cp.emitLive({
              text: "",
              // `tools: 0` comme le `clearLive` de la boucle maison : la charge de
              // purge ne décrit plus rien, et un compteur non nul y ferait lire
              // une bulle vide plutôt que rien.
              tools: 0,
              reasoningActive: false,
              reasoningMs: 0,
              ...liveEdits.payload(),
            });
          }
          // Le round est clos, quelle que soit sa fin : le compteur d'outils
          // repart de zéro pour le suivant.
          if (!child) toolsSeen = 0;
          const line = await turnLedger.record(cp, out.usage, proxy);
          costUsd += line.cost;
          /**
           * LE PLAFOND, TENU ICI ET PAS DANS LA BOUCLE — parce qu'il n'y a plus
           * de boucle à nous. La frontière de round reste la même qu'avant : on
           * ne coupe jamais un appel en vol, on refuse le suivant (politique
           * assumée de [usage.ts](../../usage.ts), comme chez Claude/ChatGPT).
           *
           * Il se RELIT (`budgetRemaining`), il n'est pas seulement snapshoté au
           * lancement : rien ne réserve de budget, deux runs concurrents lisent
           * le même restant et le prennent chacun pour plafond. Ce qui borne la
           * casse est la fréquence de relecture — et un tour de microVM dure des
           * heures, donc un plafond figé au démarrage serait aveugle du début à
           * la fin.
           */
          if (now() - lastBudgetAt >= BUDGET_REFRESH_INTERVAL_MS) {
            lastBudgetAt = now();
            const fresh = await cp.budgetRemaining();
            // `costUsd + restant` : le crochet rend ce qu'on a encore le DROIT
            // de dépenser, la garde compare des dépenses de tour.
            if (fresh !== null) budgetUsd = costUsd + Math.max(0, fresh);
          }
          if (budgetUsd !== undefined && costUsd >= budgetUsd) {
            budgetExhausted = true;
            /**
             * 40 ms mesurés : la requête en vol se termine proprement, et le tour
             * garde son journal, son push et son rapport.
             *
             * RESTE À MESURER, et [abandoned-spend.ts](../abandoned-spend.ts) est
             * gardé pour ça : ce qu'opencode facture d'un round coupé au milieu.
             * S'il pose un `finish` sur le message avorté, notre garde du
             * traducteur l'écrit au ledger comme un round ordinaire ; sinon la
             * dépense sort des compteurs, ce qui est exactement le défaut que
             * MIN-216 avait fermé côté boucle maison.
             */
            await abortSession();
            break;
          }
        }
        // Ce que la réflexion de la MÈRE change au direct : elle l'allume, et elle
        // le pousse toute seule — un modèle qui pense trois minutes avant d'écrire
        // son premier mot n'émet aucun `liveText`, et le fil resterait muet.
        if (!child && out.reasoning) {
          reasoningSince = out.reasoning.active ? (out.reasoning.startedAt || now()) : null;
        }
        const liveDue =
          !child &&
          (out.liveText !== undefined || out.reasoning !== undefined) &&
          now() - lastLiveAt >= LIVE_INTERVAL_MS;
        if (liveDue) {
          lastLiveAt = now();
          cp.emitLive({
            text: secrets.redact(liveTextOf(state, sessionId)),
            tools: toolsSeen,
            reasoningActive: reasoningSince !== null,
            reasoningMs: reasoningSince === null ? 0 : Math.max(0, now() - reasoningSince),
            // La liste part avec CHAQUE charge : le fil efface ce qu'une charge
            // tait, donc l'émettre à part la ferait disparaître à la suivante.
            ...liveEdits.payload(),
          });
        }
        /**
         * L'ERREUR D'UNE FILLE N'EST PAS L'ERREUR DU TOUR. Elle revient au parent
         * comme une erreur de `task` — il la lit et décide —, exactement comme un
         * sous-agent qui échouait dans la boucle maison. La ranger ici mettrait le
         * TOUR en `error` : le fil dirait que le run est mort alors que l'agent
         * continue de travailler.
         */
        if (out.error && !child) sessionError = out.error;
        /**
         * LA COUPURE QUE PERSONNE N'A DEMANDÉE — la panne la plus silencieuse du
         * harness avant qu'elle ne soit dite.
         *
         * Une coupure VOULUE se tait : on la consomme et le motif qui l'a
         * déclenchée (plafond, « Stop », deadline, question, steering) fait déjà
         * le rapport. Ce qui reste est un round tranché en vol — et sans cette
         * garde, il ne laissait RIEN : pas d'event, pas de résumé, pas d'erreur.
         * Le tour se rangeait « terminé », le fil restait figé sur son dernier
         * status (« Ouverture de la sandbox » quand la coupure tombe au premier
         * round), et la dépense était bien réelle. Mesuré sur le run `ec9b2ed5`.
         *
         * On le dit AU FIL et au rapport : `error` sans `errorCode` ne fait pas
         * re-queuer ([vm-rest.ts](../vm-rest.ts)) — le tour se repose, mais en
         * disant pourquoi, et le message suivant reprend la session.
         */
        if (out.aborted && !child) {
          if (abortsRequested > 0) {
            abortsRequested -= 1;
          } else {
            sessionError = "The model round was cut short before it produced anything.";
            await cp.emit("error", { message: sessionError });
            break;
          }
        }
        // Les questions sont PARTIES au fil (juste au-dessus) : on sort une fois
        // l'event émis, pas avant — sinon la carte de questions n'existerait pas
        // et la session attendrait une réponse à rien.
        if (askedUser) break;
        // `session.idle` d'une FILLE ne termine pas le tour : la mère, elle,
        // attend encore son rapport. Elle libère en revanche une place sous le
        // plafond de simultané.
        /**
         * UNE FILLE QUI SE TAIT A RENDU SON RAPPORT, et le fil veut l'entendre :
         * son bloc lit un `summary` marqué à son nom (c'est ce qui remplit
         * « rapport ») et un `status: subagent_report` (c'est ce qui le referme et
         * arrête son chrono). Les deux existaient dans la boucle maison ; sans
         * eux, une fille reste éternellement « au travail » sous un tour terminé.
         */
        if (out.idle && child) {
          const childSession = out.sessionId ?? "";
          const entry = subagents.entry(childSession);
          const report = replyOf(state, childSession);
          if (entry && report.trim()) {
            await cp.emit(
              "summary",
              markChildPayload({ text: cap(secrets.redact(report), 4000) }, entry),
            );
          }
          if (entry) await cp.emit("status", { phase: "subagent_report", id: entry.id });
          subagents.finish(childSession);
        }
        if (out.idle && !child) {
          /**
           * LA FRONTIÈRE SÛRE, et le seul endroit d'où l'on parle au modèle : la
           * session est au repos, l'historique est apparié. Un message de steering
           * arrivé pendant le tour a coupé le round (`abort`) et attend ici.
           */
          if (pendingPrompt.length > 0) {
            await cp.emit("status", { phase: "steered" });
            await postPending();
            continue;
          }
          break;
        }

        if (await lifecycle()) break;
      }
    } finally {
      abortEvents.abort();
      /**
       * CE QU'ON A DRAINÉ SANS SAVOIR LE JOUER RETOURNE EN FILE (MIN-286).
       *
       * `pullSteering` CONSOMME, et on ne draine qu'en sachant qu'on va couper pour
       * reposter derrière — sauf que le tour peut sortir entre les deux : plafond
       * de dépense atteint sur le round coupé, deadline, run conclu ailleurs,
       * coupure subie. Le message était alors consommé en base et vivant dans
       * `pendingPrompt`, une variable locale qui meurt avec la microVM : accepté à
       * l'écran, perdu pour toujours, et le run ne se réveillait même pas — c'est
       * la file qui le re-queue.
       *
       * Le chemin heureux ne passe pas par ici : `postPending` a déjà vidé le sac.
       */
       const unposted = pendingPrompt
         .filter((part) => part.steered)
         .map((part) => part.message);
      pendingPrompt = [];
      if (unposted.length > 0) await cp.pushSteering(unposted).catch(() => {});
    }

    /**
     * LE ROUND COUPÉ EN VOL, RENDU AU LEDGER (MIN-286, lot 3, dossier §2.23).
     *
     * Toutes les sorties de la boucle ci-dessus sauf une passent par un `abort` :
     * plafond de dépense, « Stop », steering, deadline, question du modèle. Et
     * mesuré sur le binaire : opencode ne facture RIEN d'un round avorté — pas de
     * `finish`, donc pas de `usage`, donc pas de ligne. Le fournisseur, lui, a
     * facturé. Le proxy est le seul à l'avoir vu passer ; on lui reprend ce que
     * plus aucun round ne viendra chercher.
     *
     * `costUsd` est ajouté au cumul du tour **après** le plafond, volontairement :
     * ce round-là est déjà coupé, l'opposer à nouveau au plafond ne changerait
     * rien qu'un message. Ce qui compte est qu'il soit au ledger, donc au quota
     * du compte et à la facture.
     */
    costUsd += await turnLedger.recordOrphans(cp, proxy);

    // ── L'état d'opencode, exporté pour le tour suivant ──────────────────────
    let opencodeState: OpencodeCheckpointState | undefined;
    try {
      // Incrémental depuis le DERNIER export, périodique compris : le curseur est
      // celui de l'accumulateur, pas celui du tour précédent.
      opencodeState = await syncJournal();
    } catch (err) {
      // Un journal qu'on n'a pas su exporter ne perd pas le tour : il perd la
      // REPRISE, et le tour suivant repartira d'une session neuve. À dire, donc,
      // et pas à avaler en silence.
      console.error("[supervisor] history export failed:", (err as Error).message);
    }

    // ── Le push, le diff, le rapport ─────────────────────────────────────────
    /**
     * Un tour qui a posé ses questions n'a PAS de réponse, et c'est la même règle
     * que la boucle maison (`reply: ""` sur `ask_user`) : la carte de questions
     * clôt le fil, il n'y a pas de mot de la fin à afficher, et le commit prend
     * son message générique plutôt qu'une phrase écrite avant la question.
     */
    const reply = askedUser ? "" : replyOf(state, sessionId);
    /**
     * LE MOT DE LA FIN, DIT AU FIL — et c'est ce qui CLÔT le tour à l'écran.
     *
     * Le fil ne connaît qu'un seul signe de fin : l'event `summary`
     * ([agent-event-feed.tsx](../../../../components/agent/agent-event-feed.tsx),
     * `closesTurn`). Sans lui, le déroulé du tour reste ouvert, et un tour au
     * repos sans clôture est lu comme un tour INTERROMPU : c'est ce qu'on a vu sur
     * les premiers runs opencode — le tour finissait bien, la PR était ouverte, et
     * le fil affichait « interrompu », puis le tour suivant venait s'empiler dans
     * le même accordéon avec le chrono du précédent.
     *
     * Plafonné à 8 000 comme la boucle maison, et posé AVANT le push : ce qui suit
     * peut échouer (push, forge, export du journal), et la réponse de l'agent ne
     * doit pas se perdre avec.
     */
    const endedWell = !budgetExhausted && !interrupted && !sessionError && !timedOut;
    if (reply.trim() && endedWell) {
      await cp.emit("summary", { text: cap(secrets.redact(reply), 8000) });
    }
    /**
     * Le verrou « le dépôt a été touché », posé une dernière fois avant le push :
     * un tour qui n'ouvre pas de pull request n'a jamais franchi la porte, et
     * c'est pourtant ce verrou que le tour SUIVANT relit dans son checkpoint.
     */
    // …et ce que le SHELL a fait au dépôt sans passer par un tool d'écriture
    // (`rm`, `mv`, un codemod) : sans cette lecture, un tour qui n'a fait que ça
    // se croit vierge, et le tour suivant le relit tel quel dans son checkpoint.
    await delivery.probeRepoTouched();
    delivery.noteEdits();
    /**
     * LES JOBS DE FOND, TUÉS AVANT LE PUSH — et avant lui seulement : ils ont
     * servi pendant tout le tour. Un serveur laissé vivant écrirait dans le dépôt
     * pendant le `git add -A` (un `.next/`, un fichier de build régénéré), et il
     * tiendrait la microVM éveillée après la fin du tour. Même geste que
     * [turn.ts](turn.ts), au même endroit.
     */
    await background.stopAll().catch(() => 0);
    let pushed: VmPushResult | null = null;
    let pushError: string | undefined;
    if (job.writesToRepo) {
      try {
        pushed = await pushWork(commitMessageFromReply(reply, job.commitRef));
      } catch (err) {
        pushError = secrets.redact((err as Error).message);
        console.error("[supervisor] turn-end push failed:", pushError);
      }
    }

    /**
     * L'ORDRE DES CAUSES, et il n'est pas indifférent : `budget_exhausted` est
     * un statut à part dans le protocole, et la fonction en tire une conduite
     * propre — event `quota_exhausted`, pas de re-queue, message qui distingue le
     * plafond du RUN de celui du COMPTE ([execute.ts](../execute.ts)). Le ranger
     * sous `error` ferait retenter un run qui n'a plus de quoi payer.
     */
    const status: VmTurnReport["status"] = budgetExhausted
      ? "budget_exhausted"
      : interrupted
        ? "interrupted"
        : sessionError || timedOut
          ? "error"
          : "completed";

    const changed =
      status === "completed" && pushed?.headSha && pushed.headSha !== filesFromSha
        ? await changedFiles(host, filesFromSha, pushed.headSha).catch(() => null)
        : null;

    // Le MÊME constructeur que la sauvegarde périodique : seul le sha des
    // fichiers change, et il ne change qu'ici (c'est le push qui l'a bougé).
    const checkpoint: OpencodeCheckpoint = turnCheckpoint(
      status === "completed" ? pushed?.headSha || filesFromSha : filesFromSha,
      opencodeState,
    );

    return {
      status,
      ...(reply ? { reply } : {}),
      // C'est lui qui met la session en `awaiting_input` et envoie la notification
      // `agent_question` plutôt qu'`agent_done` ([vm-rest.ts](../vm-rest.ts)).
      ...(askedUser ? { askedUser: true } : {}),
      ...(timedOut ? { errorCode: "turnTooLong" as const } : {}),
      ...(sessionError ? { errorMessage: cap(secrets.redact(sessionError), 1000) } : {}),
      costUsd,
      checkpoint,
      // Plus rien ne se lâche : le journal ne transite plus par le checkpoint,
      // il est écrit en append au fil du tour (cf. `syncJournal`).
      checkpointDropped: [],
      checkpointBytes: JSON.stringify(checkpoint).length,
      pushed,
      workBranch: job.workBranch,
      ...(pushError ? { pushError } : {}),
      ...(changed && changed.files.length > 0 ? { changed } : {}),
      sandboxMs: job.bootstrapMs + (now() - startedAt),
    };
  } catch (err) {
    /**
     * UN TOUR QUI MEURT A QUAND MÊME DÉPENSÉ (MIN-286).
     *
     * Le chemin heureux reprend au proxy ce qu'aucun round n'est venu chercher
     * (`recordOrphans`, plus haut) ; le chemin d'exception passait à côté, et le
     * `finally` fermait le proxy derrière lui — la dépense partait avec la
     * microVM. Or c'est justement ici qu'elle est la plus probable : la seule
     * façon d'apprendre que le serveur opencode est mort est le flux `/event`
     * qui se rompt, et le round en vol a bel et bien été facturé.
     *
     * Best-effort et sans lever : on rend le tour en erreur, pas la panne du
     * ledger par-dessus.
     */
    const salvaged = ledger ? await ledger.recordOrphans(cp, proxy).catch(() => 0) : 0;
    return failed((err as Error).message, salvaged);
  } finally {
    // Filet : un tour qui sort par une exception n'est pas passé par l'arrêt
    // d'avant-push, et un serveur de dev survivrait au tour. `stopAll` est
    // idempotent — un job déjà tué n'est plus vivant, donc il n'est pas retué.
    await background.stopAll().catch(() => 0);
    await server?.stop().catch(() => {});
    await proxy.close().catch(() => {});
    await bridge.close().catch(() => {});
  }
}

/**
 * LE LEDGER D'UN TOUR (MIN-286, lot 2) — une ligne `ai_usage` par ROUND, mère et
 * filles comprises, sous le `run_id` du run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT LES TROIS NOMBRES, et pourquoi ils ne viennent pas du même endroit
 *
 * - **Les tokens** viennent du message assistant d'opencode. Le mapping est
 *   celui du plan : `input→prompt_tokens`, `output→completion_tokens`,
 *   `cache.read→cached_tokens`, `cache.write→cache_write_tokens`. Le
 *   raisonnement n'a pas de colonne : il est DÉJÀ dans `output` (mesuré au
 *   lot 0), l'ajouter compterait deux fois les mêmes tokens.
 * - **Le coût** vient du FOURNISSEUR quand le proxy a su le lire, d'opencode
 *   sinon. La sonde du lot 0 a mesuré les deux égaux sur cinq générations, ce
 *   qui n'est pas une promesse : le jour où ils divergent, c'est la facture qui
 *   a raison. C'est aussi ce qui rend le ledger comparable ligne à ligne entre
 *   les deux moteurs — le critère de bascule du lot 3.
 * - **Le `generation_id`** ne vient que du proxy : opencode ne l'expose nulle
 *   part (dossier §2.6).
 *
 * `estimated` dit « ce coût est CALCULÉ, pas relevé chez le fournisseur ». Donc :
 * faux dès que le proxy a rendu le coût facturé ; faux aussi sur le coût
 * d'opencode calculé avec NOS prix (décision du lot 0, écart nul mesuré) ; vrai
 * quand le job n'a pas de prix — là, opencode rend zéro, et une ligne à zéro
 * marquée « exacte » serait un mensonge qu'on ne rattrape plus.
 *
 * LES SEQ : la mère continue la numérotation du run (`usageSeqStart`), chaque
 * fille prend la sienne dans la bande des sous-agents (`subagentUsageSeq`, base
 * 2e9, 1 000 par slot) — la MÊME convention que la boucle maison, sans quoi
 * l'ordre d'appel d'un run cesse de se lire au ledger.
 */
class TurnLedger {
  private parentSeq: number;
  /** Rounds déjà écrits par une fille — son avancée dans sa bande. */
  private readonly childSeq = new Map<string, number>();

  constructor(
    private readonly job: VmJob,
    /** La session de la mère : tout le reste du flux est une fille. */
    private readonly parentSession: string,
    /** Qui numérote les filles — le MÊME registre que le fil, sans quoi la
     *  dépense d'une fille et ses events ne parleraient pas de la même. */
    private readonly subagents: SubagentRegistry,
  ) {
    this.parentSeq = job.usageSeqStart;
  }

  /** Le prochain `seq` LIBRE de la mère — ce que le checkpoint doit porter. */
  get nextParentSeq(): number {
    return this.parentSeq;
  }

  /** Écrit le round, et rend ce qui a été facturé. */
  async record(
    cp: ControlPlaneClient,
    usage: RoundUsage,
    proxy: LlmProxy,
  ): Promise<{ cost: number }> {
    const generation = proxy.take({ model: usage.model, outputTokens: usage.outputTokens });
    const cost = generation?.costUsd ?? usage.costUsd;
    /**
     * `prompt_tokens` AU SENS DU FOURNISSEUR, cache compris — et pas l'`input`
     * d'opencode, qui l'EXCLUT (identité mesurée au lot 0, dossier §2.5 :
     * `input + cache.read + cache.write = native_tokens_prompt`).
     *
     * La colonne a un sens écrit, et deux lecteurs en dépendent : le taux de hit
     * du cache se lit `cached_tokens / prompt_tokens` (migration MIN-242), qui
     * dépassait 1 sur ce chemin, et la comparaison ligne à ligne des deux moteurs
     * est le critère de bascule du lot 3 — la boucle maison, elle, écrit le
     * `prompt_tokens` d'OpenRouter, comme `recordOrphans` juste en dessous.
     */
    const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    await cp.recordUsage({
      runId: this.job.ledgerRunId,
      seq: this.seqFor(usage.sessionId),
      feature: this.job.feature,
      billTo: { unattributed: "resolved by the control plane" },
      model: usage.model || this.job.model,
      ...(generation?.id ? { generationId: generation.id } : {}),
      promptTokens,
      completionTokens: usage.outputTokens,
      totalTokens: promptTokens + usage.outputTokens,
      cachedTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cost,
      estimated: generation?.costUsd == null && !this.job.pricing,
      projectId: this.job.projectId,
    });
    return { cost };
  }

  /**
   * LES ROUNDS COUPÉS EN VOL — ceux dont opencode ne dira jamais rien.
   *
   * Mesuré (dossier §2.23) : un round avorté rend `finish: null`, `cost: 0`,
   * `tokens: 0` et une `MessageAbortedError`, alors que le fournisseur a facturé.
   * Le proxy, lui, a lu la dernière frame du flux — il ne coupe pas l'amont quand
   * le client s'en va. On écrit donc la ligne avec SES nombres.
   *
   * `estimated: false` sans hésiter : ce n'est pas un calcul, c'est le montant
   * facturé, lu dans la réponse. Un flux qui n'aurait même pas rendu son `usage`
   * (fournisseur coupé, panne réseau) n'est pas écrit du tout : une ligne à zéro
   * se lirait « cet appel était gratuit », ce qui refait exactement le trou.
   *
   * `seq` : la bande de la MÈRE, toujours. Le proxy ne sait pas de quelle session
   * venait la requête — il voit du HTTP, pas des sessions — et une ligne rangée
   * sous la mère vaut infiniment mieux qu'une dépense qui n'existe nulle part.
   */
  async recordOrphans(cp: ControlPlaneClient, proxy: LlmProxy): Promise<number> {
    // La course : l'amont finit APRÈS le client (1,2 s mesurés). Drainer sans
    // attendre ne trouverait rien.
    await proxy.settle(ORPHAN_SETTLE_MS);
    let total = 0;
    for (const gen of proxy.drain()) {
      const usage = gen.usage;
      if (!usage || gen.costUsd == null) {
        // Rien de facturable à écrire, mais ça se DIT : c'est le seul signe
        // qu'une dépense a pu sortir des compteurs.
        console.error(
          `[supervisor] round coupé sans usage du fournisseur (gen ${gen.id ?? "?"}) — non facturé`,
        );
        continue;
      }
      const prompt = usage.promptTokens ?? 0;
      const completion = usage.completionTokens ?? 0;
      await cp.recordUsage({
        runId: this.job.ledgerRunId,
        seq: this.parentSeq++,
        feature: this.job.feature,
        billTo: { unattributed: "resolved by the control plane" },
        model: gen.model || this.job.model,
        ...(gen.id ? { generationId: gen.id } : {}),
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: usage.totalTokens ?? prompt + completion,
        cachedTokens: usage.cachedTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        cost: gen.costUsd,
        estimated: false,
        projectId: this.job.projectId,
      });
      total += gen.costUsd;
    }
    return total;
  }

  /**
   * Le `seq` de ce round. Une session inconnue tombe dans la bande de la mère
   * seulement si le flux n'a pas dit d'où elle venait — mieux vaut un round de
   * mère mal rangé qu'une ligne perdue.
   */
  private seqFor(sessionId: string): number {
    if (!sessionId || sessionId === this.parentSession) return this.parentSeq++;

    const slot = this.subagents.slotOf(sessionId);
    // Les slots repartent de zéro à chaque TOUR, comme la boucle maison recrée
    // son registre de sous-agents à chaque tour (`seqBase: 0`). Deux tours qui
    // délèguent réutilisent donc la même bande : `ai_usage.seq` n'a pas de
    // contrainte d'unicité, et la dépense, elle, se somme.
    const used = this.childSeq.get(sessionId) ?? 0;
    this.childSeq.set(sessionId, used + 1);
    return subagentUsageSeq(slot) + used;
  }
}

/**
 * LE REGISTRE DES FILLES D'UN TOUR (MIN-286, lot 2, tâche 12).
 *
 * Il ne LANCE rien — c'est opencode qui lance, et c'est tout l'objet du virage.
 * Il tient les trois choses qu'opencode ne tient pas pour nous :
 *
 * 1. **Un nom court et stable** (`sub-1`, `sub-2`), celui que le fil connaît
 *    depuis MIN-112 : le feed replie les events d'une fille sous la ligne
 *    `spawn_agent` par `subagent_id` + `parent_call_id`, et un id de session
 *    opencode (`ses_00960557effe…`) n'a jamais rien voulu dire pour personne.
 * 2. **La bande de `seq` du ledger** : la fille n°N écrit dans
 *    `subagentUsageSeq(N-1)`, la MÊME convention que la boucle maison — sans quoi
 *    l'ordre d'appel d'un run cesse de se lire au ledger.
 * 3. **Combien tournent**, qui est le plafond de simultané (`maxParallel`). Une
 *    fille est vivante de son rattachement jusqu'à son `session.idle`.
 */
export class SubagentRegistry {
  private readonly bySession = new Map<
    string,
    { index: number; id: string; callId: string; mode: "explore" | "implement"; done: boolean }
  >();

  constructor(
    /** Nom d'agent → notre mode, tel que la config l'a déclaré. */
    private readonly modes: ReadonlyMap<string, "explore" | "implement">,
  ) {}

  /** Rattache une fille à l'appel de `task` qui l'a lancée. Idempotent. */
  register(child: { sessionId: string; callId: string; agent: string }): void {
    if (this.bySession.has(child.sessionId)) return;
    const index = this.bySession.size;
    this.bySession.set(child.sessionId, {
      index,
      id: `sub-${index + 1}`,
      callId: child.callId,
      // Un nom d'agent inconnu ne devrait pas exister (le verdict de permission
      // l'a refusé), mais s'il passait, `implement` est le pire cas : c'est celui
      // sous lequel le fil montre une fille qui peut écrire.
      mode: this.modes.get(child.agent) ?? "implement",
      done: false,
    });
  }

  entry(sessionId: string) {
    return this.bySession.get(sessionId);
  }

  /**
   * La bande de la fille. Une session inconnue en obtient une quand même :
   * une dépense qu'on ne sait pas rattacher vaut mieux rangée que perdue.
   */
  slotOf(sessionId: string): number {
    const known = this.bySession.get(sessionId);
    if (known) return known.index;
    this.register({ sessionId, callId: "", agent: "" });
    return this.bySession.get(sessionId)!.index;
  }

  /** Une fille au repos ne compte plus dans le simultané. */
  finish(sessionId: string): void {
    const entry = this.bySession.get(sessionId);
    if (entry) entry.done = true;
  }

  get running(): number {
    let count = 0;
    for (const entry of this.bySession.values()) if (!entry.done) count += 1;
    return count;
  }

  /**
   * La fille qui ÉCRIT en ce moment, s'il y en a une — le verrou d'écriture du
   * parent ([subagent.ts](../subagent.ts), `runningImplementId`), rendu ici sous
   * le nom court que le fil affiche. Le seul appelant est `create_pr` : le
   * `git add -A` de la livraison emporterait sinon un travail à moitié posé.
   *
   * En pratique le cas est rare — chez opencode le tool `task` BLOQUE le parent —
   * mais un round qui appelle `task` et `create_pr` côte à côte le rouvre.
   */
  runningImplementId(): string | null {
    for (const entry of this.bySession.values()) {
      if (!entry.done && entry.mode === "implement") return entry.id;
    }
    return null;
  }
}

/**
 * LE MARQUAGE D'UN EVENT DE FILLE — les mêmes champs qu'en MIN-112, au nom près.
 *
 * `subagent_id` + `parent_call_id` sont ce qui replie l'event sous la ligne
 * `spawn_agent` dans le fil ; `subagent_mode` est ce qu'il affiche. Et l'id de
 * l'appel de tool est PRÉFIXÉ, pour la raison qui l'a toujours été : deux modèles
 * peuvent rendre le même `call_1`, et le fil apparie par id.
 */
export function markChildPayload(
  payload: Record<string, unknown>,
  entry: { id: string; callId: string; mode: "explore" | "implement" },
): Record<string, unknown> {
  const id = payload.id;
  return {
    ...payload,
    ...(typeof id === "string" ? { id: `${entry.id}:${id}` } : {}),
    subagent_id: entry.id,
    ...(entry.callId ? { parent_call_id: entry.callId } : {}),
    subagent_mode: entry.mode,
  };
}

/**
 * Ce que le fil doit lire d'un `spawn_agent`, quand opencode n'en connaît que le
 * nom d'agent.
 *
 * `toolArgSummary` a déjà rangé le `subagent_type` sous `mode` (c'est le champ
 * qu'il attend) — sauf que ce `mode`-là vaut `explore-anthropic-claude-haiku-4-5`,
 * pas `explore`. On lui rend donc les deux champs que `spawn_agent` portait, et
 * que la relecture d'un run affiche : le mode, et le modèle de la fille.
 */
export function describeSpawn(
  payload: Record<string, unknown>,
  agents: ReadonlyMap<string, { mode: "explore" | "implement"; modelId?: string; label?: string }>,
): Record<string, unknown> {
  const entry = agents.get(String(payload.mode ?? ""));
  if (!entry) return payload;
  return {
    ...payload,
    mode: entry.mode,
    ...(entry.modelId ? { model: entry.label ?? entry.modelId } : {}),
  };
}

/** Le curseur d'export, agrégat par agrégat. */
export function lastSeqByAggregate(
  previous: Record<string, number>,
  events: Record<string, unknown>[],
): Record<string, number> {
  const out = { ...previous };
  for (const event of events) {
    const id = typeof event.aggregateID === "string" ? event.aggregateID : null;
    const seq = typeof event.seq === "number" ? event.seq : null;
    if (!id || seq === null) continue;
    if (!(id in out) || out[id] < seq) out[id] = seq;
  }
  return out;
}

/**
 * Le token de forge ne sort ni dans un event ni dans le checkpoint (MIN-239) : il
 * est lisible dans `.git/config`, et trois tools l'en sortent. La substitution
 * s'applique aux CHAÎNES du payload, **en profondeur** — un `preview` de tool est
 * exactement là où il atterrissait. Elle vit dans `redact.ts` depuis MIN-343,
 * où Numo la partage : une seule substitution, pas deux.
 */
function redactPayload(
  payload: Record<string, unknown>,
  secrets: SecretRedactor,
): Record<string, unknown> {
  return redactDeep(payload, secrets.redact) as Record<string, unknown>;
}

