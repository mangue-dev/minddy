import { agentVmUrl } from "../network-policy";
import type { AgentCheckpoint } from "../runs";
import type { AgentEventType, AgentLiveProgress, AgentUsageLine, PlanStep } from "../agent-loop";
import type { VmToolResponse, VmTurnReport } from "./protocol";
import type { AgentUserMessage } from "@/lib/agent-mentions";

/**
 * LE CÔTÉ VM DU PLAN DE CONTRÔLE (MIN-224) — l'unique porte par laquelle la
 * boucle, depuis la microVM, touche la base, le ledger, les tickets, le carnet et
 * la forge.
 *
 * CE QUI FAIT QUE ÇA MARCHE SANS AUCUN SECRET. La VM ne porte rien : pas de clé
 * Supabase, pas de jeton d'identité. Elle appelle NOTRE PROPRE ORIGINE en https,
 * et le firewall de Vercel Sandbox forwarde la requête vers la route de collecte
 * en y ajoutant un OIDC signé par la plateforme, dont le claim `sandbox_name`
 * vaut `agent-<run.id>`. Le `runId` n'est donc JAMAIS dans le corps : il est
 * dérivé de ce claim côté serveur, et la VM ne peut rien prétendre d'autre que
 * son propre run. Il n'y a pas d'en-tête d'authentification à poser ici, et c'est
 * normal — il n'y en a pas.
 *
 * LA DISCIPLINE DE CE MODULE, et elle vaut d'être dite : **rien de ce qui est
 * best-effort ne doit pouvoir tuer un tour.** Un event perdu se rattrape au poll
 * du fil ; un tour mort à cause d'un event perdu, non. D'où la séparation en deux
 * familles :
 *
 * - `postQuiet` — events, direct, ledger, checkpoint périodique : les erreurs
 *   sont journalisées et avalées ;
 * - `request` — tools, checkpoint de fin, rapport de fin de tour : les erreurs
 *   REMONTENT, parce qu'un tool qui échoue doit se dire au modèle, et qu'un
 *   rapport de fin de tour perdu est un tour perdu.
 *
 * LE DIRECT (`/stream`) EST LE SEUL POINT CHER, et il est chiffré : `emitLive`
 * diffuse ~4×/s, soit ~2 400 appels sur un tour de dix minutes. Le cadrage a
 * mesuré l'aller-retour à ~55 ms et tranché : on garde 250 ms pour la v1 et on
 * MESURE. C'est aussi pour ça qu'il ne s'attend pas — cf. `emitLive` plus bas.
 */

/** Combien de fois on retente un appel de plan de contrôle avant d'abandonner. */
const MAX_ATTEMPTS = 3;
/** Attente de base entre deux essais (doublée à chaque fois). */
const RETRY_BASE_MS = 400;
/**
 * Plafond d'un appel de plan de contrôle. Large devant les ~55 ms mesurés, mais
 * BORNÉ : sans lui, un `fetch` qui ne rend jamais la main gèlerait un tour de
 * plusieurs heures sur une requête d'event.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** Erreur d'une surface du plan de contrôle, avec son statut — l'appelant en a
 *  besoin pour distinguer « le run n'est plus en cours » (409) d'une panne. */
export class ControlPlaneError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Un statut vaut-il d'être retenté ? Les 5xx et les 429, oui — la fonction a pu
 * être recyclée, ou le déploiement redémarrer. Les 4xx, non : un corps trop gros
 * ou une surface inconnue ne s'améliorera pas au deuxième essai, et retenter ne
 * ferait que retarder l'erreur que l'appelant doit lire.
 */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface ControlPlaneClient {
  emit(type: AgentEventType, payload: Record<string, unknown>): Promise<void>;
  /** Le type de la BOUCLE, pas une copie : la charge est sérialisée telle quelle
   *  (`JSON.stringify(progress)`), donc tout champ absent d'ici passerait quand
   *  même — jusqu'au jour où quelqu'un ajoute une liste blanche et le perd. */
  emitLive(progress: AgentLiveProgress): void;
  recordUsage: (line: AgentUsageLine) => Promise<void>;
  /**
   * Sauvegarde périodique. Ne lève pas — mais rend `false` quand le plan de
   * contrôle a répondu 409 : le run n'est PLUS `running` (annulé, ou conclu par
   * quelqu'un d'autre). C'est le seul signal qui parvienne à une VM dont la
   * conversation a été fermée sous elle, et l'appelant doit s'arrêter.
   */
  saveCheckpointQuietly(checkpoint: AgentCheckpoint): Promise<boolean>;
  pullSteering(): Promise<AgentUserMessage[]>;
  /**
   * REMET EN FILE ce qu'on a drainé sans avoir su le jouer — `pullSteering`
   * consomme, et un tour qui sort avant d'avoir reposté emporterait le message
   * dans la mort de sa microVM. Réinsérés sans auteur, ils redeviennent des
   * messages en attente : le run se re-queue, et le tour suivant les délivre.
   */
  pushSteering(texts: AgentUserMessage[]): Promise<void>;
  /**
   * Reste-t-il un message NON CONSOMMÉ ? Sonde de l'attente d'un sous-agent : elle
   * ne DRAINE pas, contrairement à `pullSteering` — le message doit rester en file
   * pour que le round suivant l'injecte dans l'historique.
   */
  hasPendingMessages(): Promise<boolean>;
  checkInterrupt(): Promise<boolean>;
  /**
   * EFFACE le drapeau d'interruption. Appelé par la boucle quand le « stop » qu'elle
   * vient de lire arrivait avec un message : le tour continue alors dans ce
   * tour-ci, au lieu de sortir pour être re-queué par le message resté en file.
   */
  clearInterrupt(): Promise<void>;
  /**
   * Ce que ce tour a ENCORE le droit de dépenser, relu maintenant — le plus serré
   * du restant mensuel du compte et du plafond du run. `null` = inconnu (lecture
   * en panne) ou illimité (BYOK) : l'appelant garde alors son plafond courant.
   *
   * Existe parce que rien ne réserve de budget : deux runs concurrents lisent le
   * même restant et le prennent chacun pour plafond. L'ancienne forme relisait à
   * chaque chunk, donc au pire toutes les cinq minutes ; un tour de microVM dure
   * des heures, et sans cette surface son plafond serait aveugle du début à la fin.
   */
  budgetRemaining(): Promise<number | null>;
  syncPlan(steps: PlanStep[]): Promise<void>;
  /** Un tool de PLATEFORME (ticket, carnet, pull request, recherche web, PR). */
  callTool(name: string, body: Record<string, unknown>): Promise<VmToolResponse>;
  /** Une URL de push avec un token de forge FRAIS — un tour dure plus qu'un token. */
  repoAuthUrl(): Promise<string | null>;
  /** Le rapport de fin de tour. C'est lui qui met la session au repos. */
  reportTurn(report: VmTurnReport): Promise<void>;
}

export function createControlPlaneClient(appOrigin: string): ControlPlaneClient {
  const url = (surface: string) => agentVmUrl(appOrigin, surface);

  async function request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    surface: string,
    body?: unknown,
  ): Promise<unknown> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url(surface), {
          method,
          ...(body === undefined
            ? {}
            : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) return await res.json().catch(() => ({}));
        const text = (await res.text().catch(() => "")).slice(0, 400);
        const err = new ControlPlaneError(res.status, `${method} ${surface} → ${res.status}: ${text}`);
        if (!retryable(res.status) || attempt === MAX_ATTEMPTS) throw err;
        lastError = err;
      } catch (e) {
        // Une `ControlPlaneError` non retentable a déjà été relancée ci-dessus ;
        // ce qui arrive ici est une panne de transport (DNS, TLS, timeout), et
        // celle-là se retente.
        if (e instanceof ControlPlaneError && !retryable(e.status)) throw e;
        lastError = e as Error;
        if (attempt === MAX_ATTEMPTS) throw lastError;
      }
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    }
    throw lastError ?? new Error(`${method} ${surface} failed`);
  }

  /** Ce dont la perte est rattrapable : on journalise et on continue. */
  async function postQuiet(surface: string, body: unknown): Promise<void> {
    try {
      await request("POST", surface, body);
    } catch (err) {
      console.error(`[agent-vm] ${surface} failed:`, (err as Error).message);
    }
  }

  return {
    emit: (type, payload) => postQuiet("/events", { type, payload }),

    /**
     * SYNCHRONE et DÉTACHÉ, exactement comme `broadcastRunStream` l'est dans la
     * fonction : la boucle appelle ça au milieu d'un stream LLM, quatre fois par
     * seconde. L'attendre ferait payer la latence du plan de contrôle à chaque
     * fragment de texte — et le direct n'a aucune valeur en retard.
     *
     * Le `catch` vide n'est pas une négligence : c'est le seul appel de ce
     * fichier dont la perte ne se rattrape ni ne se journalise utilement (une
     * ligne d'erreur toutes les 250 ms noierait les logs du tour).
     */
    emitLive: (progress) => {
      void fetch(url("/stream"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(progress),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).catch(() => {});
    },

    recordUsage: (line) =>
      postQuiet("/usage", {
        seq: line.seq,
        feature: line.feature,
        model: line.model,
        generationId: line.generationId,
        promptTokens: line.promptTokens,
        completionTokens: line.completionTokens,
        totalTokens: line.totalTokens,
        cachedTokens: line.cachedTokens,
        cacheWriteTokens: line.cacheWriteTokens,
        cost: line.cost,
        estimated: line.estimated,
        // `runId`, `billTo` et `projectId` ne sont PAS envoyés : le plan de
        // contrôle les dérive de la ligne du run. La VM ne choisit pas qui paye
        // ce qu'elle dépense.
      }),

    saveCheckpointQuietly: async (checkpoint) => {
      try {
        await request("PUT", "/checkpoint", { checkpoint });
        return true;
      } catch (err) {
        if (err instanceof ControlPlaneError && err.status === 409) {
          console.error("[agent-vm] run is no longer running — stopping");
          return false;
        }
        console.error("[agent-vm] periodic checkpoint failed:", (err as Error).message);
        return true;
      }
    },

    /**
     * NE LÈVE PAS, et c'est un choix. Ces deux-là sont appelés au sommet de chaque
     * round et pendant les streams : une panne passagère du plan de contrôle ferait
     * tomber un tour de deux heures pour n'avoir pas su lire une file vide. Un
     * message de steering lu au round suivant est une seconde de retard ; un tour
     * mort est un tour à refaire.
     */
    pullSteering: async () => {
      try {
        const body = (await request("GET", "/messages")) as { messages?: unknown };
        return Array.isArray(body.messages) ? (body.messages as AgentUserMessage[]) : [];
      } catch (err) {
        console.error("[agent-vm] steering read failed:", (err as Error).message);
        return [];
      }
    },

    pushSteering: async (texts) => {
      if (texts.length === 0) return;
      try {
        await request("POST", "/messages", { messages: texts });
      } catch (err) {
        // Le tour se termine de toute façon : ce qui se perd ici est le message,
        // et c'est précisément ce qu'il faut dire.
        console.error("[agent-vm] steering requeue failed:", (err as Error).message);
      }
    },

    hasPendingMessages: async () => {
      try {
        const body = (await request("GET", "/messages/pending")) as { pending?: unknown };
        return body.pending === true;
      } catch (err) {
        // Même règle que les deux voisines : une panne passagère ne doit pas
        // rompre une attente, seulement la laisser aller à son terme.
        console.error("[agent-vm] pending steering read failed:", (err as Error).message);
        return false;
      }
    },

    checkInterrupt: async () => {
      try {
        const body = (await request("GET", "/interrupt")) as { interrupted?: unknown };
        return body.interrupted === true;
      } catch (err) {
        console.error("[agent-vm] interrupt read failed:", (err as Error).message);
        return false;
      }
    },

    /**
     * LÈVE si elle échoue, à la différence de ses voisines — et c'est l'exception qui
     * confirme leur règle. Ne pas savoir lire une file peut attendre le round
     * suivant ; croire avoir effacé un drapeau qui est resté levé fait sortir le
     * tour au round d'après, message accepté et jamais joué. La boucle traite donc
     * l'échec comme un « toujours interrompu » (elle relit le drapeau derrière).
     */
    clearInterrupt: async () => {
      await request("DELETE", "/interrupt");
    },

    budgetRemaining: async () => {
      try {
        const body = (await request("GET", "/budget")) as { remainingUsd?: unknown };
        return typeof body.remainingUsd === "number" && Number.isFinite(body.remainingUsd)
          ? body.remainingUsd
          : null;
      } catch (err) {
        // `null` et pas 0 : une facturation injoignable ne doit pas arrêter un
        // tour en cours. C'est le pire cas assumé — on garde le plafond d'entrée,
        // qui est celui de l'ancienne forme.
        console.error("[agent-vm] budget read failed:", (err as Error).message);
        return null;
      }
    },

    syncPlan: (steps) => postQuiet("/plan-sync", { steps }),

    callTool: async (name, body) => {
      const res = (await request("POST", `/tool/${name}`, body)) as VmToolResponse;
      return res;
    },

    repoAuthUrl: async () => {
      try {
        const body = (await request("POST", "/repo-auth")) as { authUrl?: unknown };
        return typeof body.authUrl === "string" && body.authUrl ? body.authUrl : null;
      } catch (err) {
        // Le job en porte déjà un, posé au démarrage : un token qui n'a pas pu
        // être rafraîchi n'est pas une raison de ne pas pousser. L'appelant
        // retombe dessus.
        console.error("[agent-vm] repo auth refresh failed:", (err as Error).message);
        return null;
      }
    },

    reportTurn: async (report) => {
      await request("POST", "/rest", report);
    },
  };
}
