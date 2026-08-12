import { changedFiles, commitAndPush, type RepoHost, REPO_DIR } from "../repo-host";
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
} from "./opencode-config";
import { opencodeToolFiles } from "./opencode-tools";
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
 * garde-fous (`command-guard` / `repo-path`, rejoués sur `permission.asked`) et
 * `ask_user` (le tool `question`). Restent à brancher : le pont de tools
 * (`/tool/:name` servi au `MDY_SUPERVISOR_URL` que les tools générés appellent),
 * les règles de livraison, les sous-agents.
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

  const env = {
    ...opencodeServerEnv(job, { baseUrl: proxy.url }),
    // L'adresse du pont, lue par les 32 tools générés (cf. `SUPERVISOR_URL_ENV`).
    // Le pont lui-même est du lot 2 ; la variable, elle, doit être posée dès le
    // démarrage — un tool qui la lit à vide rend une phrase, pas une exception.
    MDY_SUPERVISOR_URL: `http://127.0.0.1:${OPENCODE_PORT + 1}`,
  };

  const server = await deps.startServer(env);
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
    const ledger = new TurnLedger(job, sessionId);
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

    await client.promptAsync(sessionId, input.prompt);

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
        if (out.permission) {
          const verdict = decidePermission(out.permission);
          if (verdict.reason && out.permission.callId) {
            refusedCalls.set(out.permission.callId, verdict.reason);
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

        for (const event of out.events) {
          if (event.type === "tool_call") toolsSeen += 1;
          const reason =
            event.type === "tool_result"
              ? refusedCalls.get(String(event.payload.id ?? ""))
              : undefined;
          await cp.emit(event.type, {
            ...redactPayload(event.payload, secrets),
            ...(reason ? { reason } : {}),
            // Le reste du marquage d'une fille (`parent_call_id`, `subagent_mode`,
            // le préfixe d'id) vient avec les sous-agents, tâche 12 du plan. Ce
            // champ-ci ne peut pas attendre : sans lui, le fil attribuerait à
            // l'agent principal les gestes de quelqu'un d'autre.
            ...(child ? { subagent_id: out.sessionId } : {}),
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
        if (out.error) sessionError = out.error;
        // Les questions sont PARTIES au fil (juste au-dessus) : on sort une fois
        // l'event émis, pas avant — sinon la carte de questions n'existerait pas
        // et la session attendrait une réponse à rien.
        if (askedUser) break;
        // `session.idle` d'une FILLE ne termine pas le tour : la mère, elle,
        // attend encore son rapport.
        if (out.idle && !child) break;
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
    let pushed: VmPushResult | null = null;
    let pushError: string | undefined;
    if (job.writesToRepo) {
      try {
        authUrl = (await cp.repoAuthUrl()) ?? authUrl;
        secrets.addAuthUrl(authUrl);
        pushed = await commitAndPush(host, {
          authUrl,
          workBranch: job.workBranch,
          baseBranch: job.baseBranch,
          message: commitMessageFromReply(reply, job.commitRef),
        });
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
    await server.stop().catch(() => {});
    await proxy.close().catch(() => {});
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
  /** Slot de chaque session fille, dans son ordre d'apparition. */
  private readonly slots = new Map<string, number>();
  /** Rounds déjà écrits par une fille — son avancée dans sa bande. */
  private readonly childSeq = new Map<string, number>();

  constructor(
    private readonly job: VmJob,
    /** La session de la mère : tout le reste du flux est une fille. */
    private readonly parentSession: string,
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

    let slot = this.slots.get(sessionId);
    if (slot === undefined) {
      slot = this.slots.size;
      this.slots.set(sessionId, slot);
    }
    // Les slots repartent de zéro à chaque TOUR, comme la boucle maison recrée
    // son registre de sous-agents à chaque tour (`seqBase: 0`). Deux tours qui
    // délèguent réutilisent donc la même bande : `ai_usage.seq` n'a pas de
    // contrainte d'unicité, et la dépense, elle, se somme.
    const used = this.childSeq.get(sessionId) ?? 0;
    this.childSeq.set(sessionId, used + 1);
    return subagentUsageSeq(slot) + used;
  }
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
