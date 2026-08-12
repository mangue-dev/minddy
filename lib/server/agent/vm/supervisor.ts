import {
  changedFiles,
  commitAndPush,
  repoBackgroundRunner,
  type RepoHost,
  REPO_DIR,
} from "../repo-host";
import { BackgroundJobs, OPENCODE_BACKGROUND_LOG_NOTES } from "../background";
import { SecretRedactor } from "../redact";
import { cap } from "../tool-summary";
import type { AgentCheckpoint } from "../runs";
import type { ControlPlaneClient } from "./control-plane-client";
import { OpencodeClient } from "./opencode-client";
import {
  liveTextOf,
  newTurnStreamState,
  replyOf,
  translateEvent,
  type RoundUsage,
} from "./opencode-events";
import {
  OPENCODE_ANCHOR_FILE,
  OPENCODE_TOOL_DIR,
  opencodeServerEnv,
  subagentAgentTable,
} from "./opencode-config";
import { localToolsFor, opencodeToolFiles, SUPERVISOR_URL_ENV } from "./opencode-tools";
import { startToolBridge, type SupervisorTool, type ToolBridge } from "./tool-bridge";
import { makeOpencodeDelivery, type OpencodeDelivery } from "./opencode-delivery";
import { decidePermission } from "./opencode-permissions";
import { startLlmProxy, type LlmProxy } from "./llm-proxy";
import { commitMessageFromReply } from "../commit-message";
import { BUDGET_REFRESH_INTERVAL_MS } from "@/lib/agent-models";
import { subagentUsageSeq } from "../subagent";
import type { VmJob, VmPushResult, VmTurnReport } from "./protocol";

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

/** Plafond d'attente du démarrage du serveur. ~1,3 s mesuré ; ceci borne la panne. */
export const OPENCODE_BOOT_TIMEOUT_MS = 60_000;

/** Le port local du serveur opencode dans la microVM. Rien d'autre n'écoute là. */
export const OPENCODE_PORT = 4096;

/** Cadence du direct — la même que la boucle maison (`emitLive`, 250 ms). */
export const LIVE_INTERVAL_MS = 250;

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
 * cumulé sur une microVM qui n'a jamais vu la conversation. `seq` est le curseur
 * par agrégat, qui rend l'export incrémental — 5 events / 3,6 Ko pour un tour, là
 * où l'historique complet en pesait 61 Ko.
 */
export interface OpencodeCheckpointState {
  sessionId: string;
  /** Le journal, tel que `/sync/history` le rend (déjà normalisé en camelCase). */
  events: Record<string, unknown>[];
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
  /** 0 = port libre. Les tests s'en servent pour ne pas se disputer 4097. */
  toolBridgePort?: number;
  now?(): number;
  /** Attente du démarrage. Réglable pour qu'un test ne poireaute pas 60 s. */
  bootTimeoutMs?: number;
}

/** Le texte d'ancrage minddy, servi en `instructions` au prompt système. */
export interface SupervisorInput {
  /** Ce que le tour demande au modèle (le message de l'utilisateur, ou l'amorce). */
  prompt: string;
  /** L'ancrage minddy (ticket / carnet / relecture), réinjecté en `instructions`. */
  anchorInstructions: string;
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

  // ── Le décor, posé avant le premier octet de serveur ───────────────────────
  await deps.writeFile(OPENCODE_ANCHOR_FILE, input.anchorInstructions);
  for (const file of opencodeToolFiles(job)) {
    await deps.writeFile(file.path, file.content);
  }

  // Le proxy AVANT le serveur : sa `baseURL` entre dans la config du tour, donc
  // elle doit être connue avant qu'opencode ne lise son environnement.
  const proxy = await (deps.startProxy ?? ((j: VmJob) => startLlmProxy({ job: j })))(job);
  /**
   * Le pont de tools, ouvert AVANT le serveur pour la même raison que le proxy :
   * son adresse entre dans l'environnement d'opencode, donc elle doit exister
   * avant qu'il ne le lise. C'est lui qui tient les compteurs du TOUR — plafond
   * de recherches web, ancres de relecture ([tool-bridge.ts](tool-bridge.ts)).
   */
  /**
   * LES RÈGLES DE LIVRAISON (lot 2, tâche 14), construites AVANT le pont : c'est
   * lui qui sert `write_issue_plan` et `create_pr`, donc lui qui porte la voix du
   * harness. Le superviseur, de son côté, leur donne les deux faits qui viennent
   * des tools intégrés — une écriture autorisée, une commande terminée.
   */
  const delivery = makeOpencodeDelivery({
    host,
    emit: (type, payload) => cp.emit(type, payload),
    filesFromSha: job.filesFromSha,
    editedPaths: job.editedPaths,
    repoTouched: job.repoTouched,
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
  async function pushWork(message: string): Promise<VmPushResult> {
    authUrl = (await cp.repoAuthUrl()) ?? authUrl;
    secrets.addAuthUrl(authUrl);
    return await commitAndPush(host, {
      authUrl,
      workBranch: job.workBranch,
      baseBranch: job.baseBranch,
      message,
    });
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

  const bridge = await (deps.startToolBridge ?? startToolBridge)({
    job,
    cp,
    delivery,
    // Une session de RELECTURE n'a ni l'un ni l'autre : `agentToolsFor` ne les
    // sert pas à l'ancrage `pr`, et le pont refuse ce qui arriverait quand même.
    supervisorTools: {
      ...(createPr ? { create_pr: createPr } : {}),
      // `handle` ne lève jamais : tout revient au modèle comme un résultat de
      // tool, réussi ou en erreur (plafond atteint, commande refusée, job inconnu).
      ...(servesBackground ? { run_background: (args) => background.handle(args) } : {}),
    },
    port: deps.toolBridgePort ?? OPENCODE_PORT + 1,
  });

  const env = {
    ...opencodeServerEnv(job, { baseUrl: proxy.url }),
    // L'adresse du pont, lue par les 32 tools générés (cf. `SUPERVISOR_URL_ENV`).
    [SUPERVISOR_URL_ENV]: bridge.url,
  };

  /**
   * DÉMARRÉ DANS LE `try`, et ce n'est pas un détail de forme : le proxy et le
   * pont écoutent déjà. Un serveur qui ne démarre pas laisserait sinon leurs deux
   * sockets ouvertes, et le pont tient un port FIXE — le tour suivant du même
   * process se ferait refuser son `listen` et mourrait de ça, pas de sa cause.
   */
  let server: { stop(): Promise<void> } | null = null;
  const client = deps.client(`http://127.0.0.1:${OPENCODE_PORT}`);

  /** Ce qu'on rend quand le tour n'a pas pu commencer. */
  const failed = (message: string): VmTurnReport => ({
    status: "error",
    errorMessage: cap(secrets.redact(message), 1000),
    costUsd: 0,
    checkpointDropped: [],
    checkpointBytes: 0,
    pushed: null,
    workBranch: job.workBranch,
    sandboxMs: job.bootstrapMs + (now() - startedAt),
  });

  try {
    server = await deps.startServer(env);
    const bootTimeoutMs = deps.bootTimeoutMs ?? OPENCODE_BOOT_TIMEOUT_MS;
    if (!(await client.waitHealthy(bootTimeoutMs))) {
      return failed(`opencode did not become healthy within ${bootTimeoutMs} ms`);
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
    const ledger = new TurnLedger(job, sessionId, subagents);
    let costUsd = 0;
    let sessionError: string | undefined;
    let lastLiveAt = 0;
    let toolsSeen = 0;
    /** Ce que le tour a encore le droit de dépenser. Absent = BYOK, illimité. */
    let budgetUsd = job.budgetUsd;
    let lastBudgetAt = now();
    let budgetExhausted = false;
    /** Le tour s'est terminé sur des questions : la session ATTEND l'utilisateur. */
    let askedUser = false;
    /**
     * Motif du refus d'une permission, par appel de tool. Il ne sert qu'à une
     * chose, et elle compte : reposer `tool_result.reason` sur l'event du tool
     * refusé, comme la boucle maison le faisait (`FORBIDDEN_COMMAND_REASON` est
     * ce qui rend les refus MESURABLES sur `agent_run_events`). Le traducteur,
     * lui, est pur : il ne sait pas ce qu'on a répondu à une permission.
     */
    const refusedCalls = new Map<string, string>();

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
    let pendingPrompt: Array<{ text: string; steered: boolean }> = [];
    let interrupted = false;
    let lastSteerAt = now();
    const takeSteering = async (): Promise<string[]> =>
      (await cp.pullSteering().catch(() => [])).map((t) => t.trim()).filter(Boolean);
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
      for (const part of parts) {
        if (part.steered) await cp.emit("user_message", { text: cap(part.text, 4000) });
      }
      await client.promptAsync(sessionId, parts.map((part) => part.text).join("\n\n"));
    };

    /**
     * LE PREMIER PROMPT DU TOUR : ce que la fonction a composé (contexte du ticket
     * + demande, sur un tour froid) PLUS ce qui attendait dans la file. Un tour
     * repris n'a que le second — c'est par là qu'arrivent la réponse à une question
     * et le « et maintenant fais plutôt ça » écrit pendant que la VM dormait.
     */
    pendingPrompt = [
      ...(input.prompt.trim() ? [{ text: input.prompt.trim(), steered: false }] : []),
      ...(await takeSteering()).map((text) => ({ text, steered: true })),
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
    try {
      for await (const raw of stream) {
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
        // aux events qui vont suivre, et sa bande au ledger.
        if (out.child) subagents.register(out.child);

        if (out.permission) {
          const verdict = decidePermission(out.permission, {
            names: new Set(agentTable.keys()),
            running: subagents.running,
            maxParallel: job.subagents.maxParallel,
          });
          if (verdict.reason && out.permission.callId) {
            refusedCalls.set(out.permission.callId, verdict.reason);
          }
          /**
           * UNE ÉCRITURE AUTORISÉE EST UNE ÉDITION DU TOUR. C'est le seul endroit
           * où on la voit : chez opencode, l'édition est un tool INTÉGRÉ, et sa
           * demande de permission est ce que notre `edit_file` nous disait. De là
           * viennent le type-check ciblé de la porte de livraison, le mode
           * `related` du runner de tests, et le verrou « le dépôt a été touché ».
           */
          if (out.permission.permission === "edit" && verdict.reply === "once") {
            delivery.noteEdit(out.permission.filepath ?? "");
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
          await client.abort(sessionId);
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
          if (event.type === "tool_call") toolsSeen += 1;
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
          const line = await ledger.record(cp, out.usage, proxy);
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
            await client.abort(sessionId);
            break;
          }
        }
        // Le direct est celui de la MÈRE : y pousser le texte d'une fille ferait
        // clignoter la réponse de l'agent entre deux conversations.
        if (!child && out.liveText !== undefined && now() - lastLiveAt >= LIVE_INTERVAL_MS) {
          lastLiveAt = now();
          cp.emitLive({
            text: secrets.redact(liveTextOf(state, sessionId)),
            tools: toolsSeen,
            reasoningActive: false,
            reasoningMs: 0,
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
        // Les questions sont PARTIES au fil (juste au-dessus) : on sort une fois
        // l'event émis, pas avant — sinon la carte de questions n'existerait pas
        // et la session attendrait une réponse à rien.
        if (askedUser) break;
        // `session.idle` d'une FILLE ne termine pas le tour : la mère, elle,
        // attend encore son rapport. Elle libère en revanche une place sous le
        // plafond de simultané.
        if (out.idle && child) subagents.finish(out.sessionId ?? "");
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

        /**
         * LE « STOP » ET LE STEERING, sondés au fil des events plutôt qu'à chaque
         * round — il n'y a plus de round à nous. La granularité est donc celle du
         * flux : un event tombe à chaque début et chaque fin de tool, et en continu
         * pendant que le modèle écrit. Un `bash` de trois minutes est le pire cas,
         * et il retarde le stop d'autant : c'était déjà vrai de la boucle maison,
         * qui ne relisait le drapeau qu'entre deux rounds.
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
              await client.abort(sessionId);
              break;
            }
            await cp.clearInterrupt().catch(() => {});
            pendingPrompt.push(...steered.map((text) => ({ text, steered: true })));
            await client.abort(sessionId);
          } else if (await cp.hasPendingMessages().catch(() => false)) {
            // Drainé seulement maintenant qu'on sait qu'on va couper pour le poster.
            pendingPrompt.push(
              ...(await takeSteering()).map((text) => ({ text, steered: true })),
            );
            if (pendingPrompt.length > 0) await client.abort(sessionId);
          }
        }
        if (now() > deadline) {
          timedOut = true;
          await client.abort(sessionId);
          break;
        }
      }
    } finally {
      abortEvents.abort();
    }

    // ── L'état d'opencode, exporté pour le tour suivant ──────────────────────
    let opencodeState: OpencodeCheckpointState | undefined;
    try {
      const fresh = await client.syncHistory(previous?.seq ?? {});
      opencodeState = {
        sessionId,
        events: [...(previous?.events ?? []), ...fresh],
        seq: lastSeqByAggregate(previous?.seq ?? {}, fresh),
      };
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
     * Le verrou « le dépôt a été touché », posé une dernière fois avant le push :
     * un tour qui n'ouvre pas de pull request n'a jamais franchi la porte, et
     * c'est pourtant ce verrou que le tour SUIVANT relit dans son checkpoint.
     */
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
      status === "completed" && pushed?.headSha && pushed.headSha !== job.filesFromSha
        ? await changedFiles(host, job.filesFromSha, pushed.headSha).catch(() => null)
        : null;

    const checkpoint: OpencodeCheckpoint = {
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
      usageSeq: ledger.nextParentSeq,
      lastFilesSha: status === "completed" ? pushed?.headSha || job.filesFromSha : job.filesFromSha,
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
      ...(opencodeState ? { opencode: opencodeState } : {}),
    };

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
      checkpointDropped: [],
      checkpointBytes: JSON.stringify(checkpoint).length,
      pushed,
      workBranch: job.workBranch,
      ...(pushError ? { pushError } : {}),
      ...(changed && changed.files.length > 0 ? { changed } : {}),
      sandboxMs: job.bootstrapMs + (now() - startedAt),
    };
  } catch (err) {
    return failed((err as Error).message);
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
    await cp.recordUsage({
      runId: this.job.ledgerRunId,
      seq: this.seqFor(usage.sessionId),
      feature: this.job.feature,
      billTo: { unattributed: "resolved by the control plane" },
      model: usage.model || this.job.model,
      ...(generation?.id ? { generationId: generation.id } : {}),
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      cachedTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cost,
      estimated: generation?.costUsd == null && !this.job.pricing,
      projectId: this.job.projectId,
    });
    return { cost };
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
 * s'applique aux CHAÎNES du payload, en profondeur — un `preview` de tool est
 * exactement là où il atterrissait.
 */
function redactPayload(
  payload: Record<string, unknown>,
  secrets: SecretRedactor,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = typeof value === "string" ? secrets.redact(value) : value;
  }
  return out;
}

/** Le dépôt, tel que le serveur doit le voir. Une seule définition. */
export const OPENCODE_DIRECTORY = REPO_DIR;
