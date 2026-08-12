import { changedFiles, commitAndPush, type RepoHost, REPO_DIR } from "../repo-host";
import { SecretRedactor } from "../redact";
import { cap } from "../tool-summary";
import type { AgentCheckpoint } from "../runs";
import type { ControlPlaneClient } from "./control-plane-client";
import { OpencodeClient } from "./opencode-client";
import {
  liveTextOf,
  newTurnStreamState,
  translateEvent,
  type RoundUsage,
} from "./opencode-events";
import {
  OPENCODE_ANCHOR_FILE,
  OPENCODE_TOOL_DIR,
  opencodeServerEnv,
} from "./opencode-config";
import { opencodeToolFiles } from "./opencode-tools";
import { commitMessageFromReply } from "../commit-message";
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
 * flux, fin de tour. Les branchements du lot 2 — le pont de tools (`/tool/:name`
 * servi au `MDY_SUPERVISOR_URL` que les tools généurés appellent), la réponse aux
 * permissions par `command-guard`, les règles de livraison, les sous-agents —
 * s'accrochent tous à des points déjà nommés ici : `onUsage`, `onPermission`,
 * `toolBridge`. Ils sont **déclarés et non implémentés**, plutôt qu'oubliés.
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

  const env = {
    ...opencodeServerEnv(job),
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
    const usageLines: RoundUsage[] = [];
    let costUsd = 0;
    let sessionError: string | undefined;
    let lastLiveAt = 0;
    let toolsSeen = 0;

    const abortEvents = new AbortController();
    const stream = client.events(abortEvents.signal);

    await client.promptAsync(sessionId, input.prompt);

    const deadline = startedAt + SUPERVISOR_TURN_SOFT_DEADLINE_MS;
    let timedOut = false;
    try {
      for await (const raw of stream) {
        const out = translateEvent(raw, state);
        for (const event of out.events) {
          if (event.type === "tool_call") toolsSeen += 1;
          await cp.emit(event.type, redactPayload(event.payload, secrets));
        }
        if (out.usage) {
          usageLines.push(out.usage);
          costUsd += out.usage.costUsd;
          await recordRound(cp, job, out.usage, usageLines.length - 1);
        }
        if (out.liveText !== undefined && now() - lastLiveAt >= LIVE_INTERVAL_MS) {
          lastLiveAt = now();
          cp.emitLive({
            text: secrets.redact(liveTextOf(state)),
            tools: toolsSeen,
            reasoningActive: false,
            reasoningMs: 0,
          });
        }
        if (out.error) sessionError = out.error;
        if (out.idle) break;
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
    const reply = lastAssistantReply(state);
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

    const status: VmTurnReport["status"] = sessionError
      ? "error"
      : timedOut
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
      lastFilesSha: status === "completed" ? pushed?.headSha || job.filesFromSha : job.filesFromSha,
      instructions: { paths: [...job.instructions.paths], bytes: job.instructions.bytes },
      ...(opencodeState ? { opencode: opencodeState } : {}),
    };

    return {
      status,
      ...(reply ? { reply } : {}),
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
  }
}

/**
 * Une ligne de ledger par ROUND, telle que le message assistant la donne.
 *
 * `estimated` suit les PRIX : quand le job n'en porte pas (BYOK hors index
 * OpenRouter), opencode calcule sur un catalogue qu'il n'a pas et rend zéro. Une
 * ligne à zéro marquée « exacte » serait un mensonge qui ne se rattrape pas —
 * cf. `VmModelPricing`.
 */
async function recordRound(
  cp: ControlPlaneClient,
  job: VmJob,
  usage: RoundUsage,
  index: number,
): Promise<void> {
  await cp.recordUsage({
    runId: job.ledgerRunId,
    seq: job.usageSeqStart + index,
    feature: job.feature,
    billTo: { unattributed: "resolved by the control plane" },
    model: usage.model || job.model,
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    cachedTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    cost: usage.costUsd,
    estimated: !job.pricing,
    projectId: job.projectId,
  });
}

/** Le texte final du tour — ce que le fil affiche comme réponse. */
function lastAssistantReply(state: ReturnType<typeof newTurnStreamState>): string {
  return liveTextOf(state).trim();
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
