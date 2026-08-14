import "server-only";

import { recordAiUsage, type AiUsageBillTo, type AiFeature } from "@/lib/server/ai-usage";
import { getAccountSettings } from "@/lib/server/account-settings";
import { afterOrNow } from "@/lib/server/after-safe";
import { defaultLocale } from "@/i18n/config";
import { DEFAULT_NUMO_STATUS } from "@/lib/numo-default-status";

import { executeIssueTool, type IssueToolContext } from "./issue-tools";
import type { AgentLiveEdit } from "./exec-tool";
import { CHANGED_FILES_CAP } from "./repo-host";
import {
  anchorForRun,
  ISSUE_TOOL_NAMES,
  PLATFORM_TOOLS_BY_ANCHOR,
  PR_TOOL_NAMES,
  PROJECT_PR_TOOL_NAMES,
  SCRATCHPAD_TOOL_NAMES,
} from "./platform-tool-names";
import { WEB_SEARCH_SEQ_BASE } from "@/lib/server/web-search";
import {
  checkUsageClaim,
  USAGE_COST_FLOOR_USD,
  type UsageModelPricing,
} from "./usage-claim";
import type { VmTurnReport } from "./vm/protocol";
import { executeScratchpadTool, type ScratchpadToolContext } from "./scratchpad-tools";
import { agentRunTopic, broadcastToTopic } from "./live";
import {
  appendEvent,
  appendRunJournal,
  clearInterrupt,
  getRun,
  hasPendingRunMessages,
  insertRunMessage,
  pullPendingMessages,
  readInterruptFlag,
  stampRun,
  stampRunResult,
  type AgentRun,
} from "./runs";
import type { AgentCheckpoint } from "./runs";
import type { AgentEventType } from "./agent-loop";
import { parseAgentMentions } from "@/lib/agent-mentions";

/**
 * PLAN DE CONTRÔLE de la microVM (MIN-223) — la seule surface par laquelle une
 * boucle qui vit dans la VM touchera la base, le ledger, les tickets et le carnet.
 *
 * CE QUI FAIT QUE ÇA TIENT, et c'est une seule idée. La VM ne porte aucun jeton
 * POUR PARLER ICI : le firewall de Vercel Sandbox forwarde ses requêtes vers notre
 * route en y ajoutant un OIDC signé par la plateforme, dont le claim
 * `sandbox_name` vaut `agent-<run.id>`. **Le `runId` est donc un paramètre
 * d'ENTRÉE de ce module, dérivé de ce claim — jamais lu dans le corps de la
 * requête.** Tout le reste en découle :
 *
 * - une VM ne peut écrire d'events que sur SON run, pas parce qu'on le vérifie,
 *   parce qu'elle ne peut rien prétendre d'autre ;
 * - le direct diffuse sur le topic DÉRIVÉ du run, jamais sur celui du corps —
 *   une clé Supabase à portée réduite n'aurait pas su l'empêcher, le topic étant
 *   un paramètre ;
 * - le ledger impute au `created_by` de la ligne du run, pas à un `billTo`
 *   envoyé : la VM ne choisit pas qui paye ce qu'elle dépense.
 *
 * SÉPARÉ DE LA ROUTE À DESSEIN. La route
 * ([app/api/agent-vm/[...path]/route.ts](../../../app/api/agent-vm/[...path]/route.ts))
 * ne fait que vérifier l'OIDC et dériver le run ; ce module, lui, est testable
 * sans HTTP, et c'est ici que vivent les invariants qu'un test doit pouvoir
 * casser.
 *
 * CE QUI S'Y EST AJOUTÉ AVEC LA BOUCLE (MIN-224). Les tools de PULL REQUEST,
 * `create_pr` et `web_search` sont désormais servis : ce qui manquait n'était pas
 * la surface mais ce que la boucle enverrait — le compteur d'ancres posées,
 * l'état de push du tour. Plus `/rest`, la fin de tour, et `/repo-auth`, qui rend
 * un token de forge frais à une VM qui travaille depuis plus longtemps que le
 * sien.
 *
 * LE SEUL SECRET QUE LA VM DÉTIENT, ET IL FAUT LE DIRE (MIN-327). « La microVM ne
 * détient aucun secret » était écrit ici et dans `network-policy.ts`, et c'était
 * faux : le token de forge est dans son `.git/config` depuis le clone, par
 * construction — c'est ce avec quoi elle pousse. La phrase juste est plus étroite :
 * la VM ne détient aucun secret **de minddy** (ni clé LLM, ni clé Supabase, ni
 * jeton d'identité), et le seul qu'elle porte est scopé au dépôt du projet, avec
 * le pouvoir minimal de son ancrage (`RepoTokenAccess` dans `repo-access.ts`).
 * L'affirmation trop large est ce qui a dispensé d'y regarder pendant deux tickets.
 *
 * LA COUPURE QUI GUIDE TOUT ÇA : la microVM a le DÉPÔT, la fonction a la FORGE et
 * la BASE. `create_pr` est coupé exactement là — la VM pousse, la fonction ouvre.
 */

/** Ce qu'une surface rend : un statut HTTP et un corps JSON. */
export interface ControlPlaneResult {
  status: number;
  body: unknown;
}

const ok = (body: unknown = { ok: true }): ControlPlaneResult => ({ status: 200, body });
const bad = (message: string): ControlPlaneResult => ({ status: 400, body: { error: message } });
/**
 * CE RUN N'A PAS LE DROIT, et c'est un 403 — jamais un 404 (MIN-326). Le 404 dit
 * « ça n'existe pas », ce qui est faux d'un tool parfaitement vivant sur un autre
 * ancrage : il envoie diagnostiquer un tool manquant là où le refus est la règle.
 */
const forbidden = (message: string): ControlPlaneResult => ({
  status: 403,
  body: { error: message },
});

/**
 * Plafond de corps du plan de contrôle, MESURÉ (2026-08-07) : un POST forwardé
 * passe à 4 Mio et se fait refuser en 413 `FUNCTION_PAYLOAD_TOO_LARGE` dès 4,3 Mio
 * — c'est la limite de 4,5 Mo des fonctions Vercel, que le forward ne relève pas.
 *
 * Elle est SOUS `MAX_CHECKPOINT_BYTES` (8 Mo, checkpoint-fit.ts) : un checkpoint
 * à son plafond actuel ne passerait pas. On refuse ici, explicitement, plutôt que
 * de laisser la plateforme rendre un 413 en HTML qu'une boucle lirait comme « le
 * checkpoint est écrit ». Le rattrapage — abaisser le plafond, ou sortir le
 * checkpoint de cette route — appartient à MIN-224.
 */
export const CONTROL_PLANE_MAX_BODY_BYTES = 4_000_000;

/** Features de ledger qu'une VM a le droit d'écrire. Fermée : sans elle, une VM
 *  compromise imputerait sa dépense à `numo_chat` et la sortirait des compteurs
 *  de l'agent. */
const VM_ALLOWED_FEATURES = new Set<AiFeature>([
  "agent_code",
  "routine_code",
  "sandbox_compute",
  "routine_compute",
  "web_search",
  "pr_review",
]);

/**
 * Ce qu'une remise en file peut porter (MIN-329) — les mêmes bornes que la porte
 * d'entrée des messages ([app/api/agent-runs/[runId]/steer/route.ts](../../../app/api/agent-runs/[runId]/steer/route.ts),
 * `MAX_LEN`), puisqu'on n'y remet que ce qui en est venu. Le nombre est large
 * exprès : un tour draine rarement plus de deux ou trois messages, et la borne
 * n'est là que pour qu'il y en ait une.
 */
const MAX_MESSAGE_LEN = 4000;
const MAX_REQUEUED_MESSAGES = 50;

/** Qui paye ce que ce run dépense — SA ligne, pas ce que la VM raconte. */
function billToFor(run: AgentRun): AiUsageBillTo {
  return run.created_by
    ? { userId: run.created_by }
    : { unattributed: `run ${run.id} sans created_by` };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Un INDEX d'appel, jamais autre chose (MIN-329). `seq` range les lignes d'un run
 * en bandes (les appels du modèle, `web_search`, `sandbox_compute`) : un nombre
 * négatif ou démesuré ne fait pas perdre d'argent, il fait atterrir une ligne
 * dans la bande d'une autre feature — donc un total juste, rangé au mauvais
 * endroit, ce qui est plus difficile à voir qu'une erreur franche.
 */
const MAX_SEQ = 100_000;
function seqField(raw: unknown, max = MAX_SEQ): number {
  const n = num(raw);
  if (n === null) return 0;
  return Math.min(Math.max(0, Math.round(n)), max);
}

/**
 * Le tarif du modèle, DEMANDÉ SEULEMENT QUAND IL PEUT CHANGER LA RÉPONSE.
 *
 * Le plafond calculé ne mord jamais sous `USAGE_COST_FLOOR_USD` (cf.
 * `checkUsageClaim`), et l'écrasante majorité des lignes est à quelques
 * millièmes de dollar. Aller lire l'index OpenRouter pour chacune d'elles serait
 * une requête réseau par round de modèle pour un verdict connu d'avance.
 */
async function usagePricingFor(
  model: string | null,
  cost: unknown,
): Promise<UsageModelPricing | null> {
  if (!model || typeof cost !== "number" || !(cost > USAGE_COST_FLOOR_USD)) return null;
  try {
    const { getOpenRouterModelInfo } = await import("./openrouter-index");
    return await getOpenRouterModelInfo(model);
  } catch (err) {
    // Un index injoignable ne doit pas faire perdre la ligne : sans tarif, seules
    // les bornes dures s'appliquent — c'est exactement ce que rend `null`.
    console.error("[agent-control-plane] pricing read failed:", (err as Error).message);
    return null;
  }
}

const LIVE_FILE_STATUSES = new Set(["added", "modified", "deleted", "renamed"]);

/**
 * La liste de fichiers d'une charge de direct, ramenée à ce qu'elle prétend être :
 * des chemins non vides, un statut connu, et pas plus que le plafond de la liste
 * autoritaire. Rien de ce que la VM invente ne traverse.
 */
function liveFiles(
  raw: unknown,
  claimedTruncated: unknown,
): { files?: AgentLiveEdit[]; filesTruncated?: boolean } {
  if (!Array.isArray(raw)) return {};
  const files: AgentLiveEdit[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.path !== "string" || !r.path) continue;
    files.push({
      path: r.path,
      status: (typeof r.status === "string" && LIVE_FILE_STATUSES.has(r.status)
        ? r.status
        : "modified") as AgentLiveEdit["status"],
      ...(typeof r.previousPath === "string" ? { previousPath: r.previousPath } : {}),
    });
    if (files.length === CHANGED_FILES_CAP) break;
  }
  if (files.length === 0) return {};
  // L'aveu de troncature est celui des DEUX bornes : celle d'ici (ce que le relais
  // a coupé) et celle de la VM, qui borne déjà au même plafond avant d'envoyer.
  // Sans le second terme, une liste coupée EN AMONT arrivait avec `raw.length ===
  // files.length` — donc sans troncature à déclarer, et le fil lisait une liste
  // bornée comme une liste complète.
  return { files, filesTruncated: raw.length > files.length || claimedTruncated === true };
}

/**
 * CE QUE CE TOUR A ENCORE LE DROIT DE DÉPENSER, relu MAINTENANT.
 *
 * Le plafond d'un tour est snapshoté à son lancement, et rien ne réserve de
 * budget : deux runs lancés à la même seconde lisent le même restant et le
 * prennent chacun pour plafond — donc ils peuvent dépenser le double. L'ancienne
 * forme s'en tirait par sa forme même, en relisant le quota à chaque chunk (cinq
 * minutes au pire) ; un tour de microVM dure des heures, et son plafond serait
 * aveugle du début à la fin sans cette surface.
 *
 * Le plus SERRÉ des deux plafonds, comme au lancement : le restant mensuel du
 * compte, et ce qu'il reste du budget posé sur le run (les routines). Les deux
 * partent du LEDGER, pas d'une colonne — c'est ce qui rend la relecture utile,
 * puisque le ledger est écrit appel par appel, y compris par les autres runs.
 *
 * `null` = illimité (BYOK) ou lecture en panne. La VM garde alors son plafond
 * d'entrée : une facturation injoignable ne doit pas arrêter un tour en cours.
 */
async function turnBudgetRemainingUsd(run: AgentRun): Promise<number | null> {
  try {
    const [{ checkAgentQuota }, { spentFromLedger }] = await Promise.all([
      import("./quota"),
      import("@/lib/server/ai-usage"),
    ]);
    const [quota, spent] = await Promise.all([
      checkAgentQuota(run.created_by ?? ""),
      spentFromLedger(run.run_id ?? run.id),
    ]);
    const account = quota.unlimited ? null : Math.max(0, quota.remaining ?? 0);
    const runSpent = Math.max(run.cost_usd, spent ?? 0);
    const fromRun =
      run.budget_usd == null ? null : Math.max(0, Number(run.budget_usd) - runSpent);
    const both = [account, fromRun].filter((v): v is number => v !== null);
    return both.length ? Math.min(...both) : null;
  } catch (err) {
    console.error("[agent-control-plane] budget read failed:", (err as Error).message);
    return null;
  }
}

/**
 * Une requête du plan de contrôle. `runId` vient de l'OIDC ; `surface` est le
 * chemin sous `/api/agent-vm` (`/events`, `/tool/read_issue`…).
 */
export async function handleControlPlaneRequest(opts: {
  runId: string;
  method: string;
  surface: string;
  /** Corps JSON déjà parsé. `null` sur un GET. */
  body: Record<string, unknown> | null;
  /**
   * Nom de la microVM appelante, tel que la plateforme l'a signé. Le `runId`
   * en est déjà dérivé — c'est ici la même chose vue depuis la BASE : la ligne
   * du run doit reconnaître cette microVM comme la sienne (MIN-331). Aujourd'hui
   * le nom est déterministe, donc l'égalité tient par construction ; le jour où
   * elle cesserait de tenir, c'est une VM qui parle pour un run qu'elle
   * n'exécute pas, et ce n'est pas une divergence à découvrir dans les logs.
   */
  sandboxName?: string;
}): Promise<ControlPlaneResult> {
  const { runId, method, surface } = opts;
  const body = opts.body ?? {};

  /**
   * LE DIRECT PASSE AVANT LA LECTURE DU RUN, et c'est la seule surface qui y
   * échappe. `emitLive` diffuse ~4×/s pendant toute la durée du tour — sur un
   * tour de deux heures, une lecture de `agent_runs` par tick ferait ~29 000
   * requêtes en base pour une surface qui n'a besoin que du `runId`, dont elle
   * dérive son topic. C'était de la charge pure, sur le seul appel chaud du plan
   * de contrôle.
   *
   * Ce qu'on renonce à vérifier ici : qu'il existe encore une ligne pour ce run.
   * Sans conséquence — le direct n'est persisté nulle part, et diffuser sur le
   * topic d'un run supprimé n'atteint personne. Les surfaces qui ÉCRIVENT, elles,
   * gardent la lecture ci-dessous.
   *
   * LE TOPIC EST DÉRIVÉ DU RUN, jamais reçu. C'est la seule ligne de ce fichier
   * qui empêche une VM de diffuser sur le fil d'une autre.
   *
   * `afterOrNow` et PAS `broadcastRunStream` : celui-ci DÉTACHE son fetch
   * (`void broadcast(…)`, live.ts). Ça convient à la boucle, qui vit dans une
   * invocation qui continue derrière — pas ici : la réponse part à la ligne
   * suivante, la plateforme gèle la fonction, et la requête sortante meurt en vol
   * (« TypeError: fetch failed », cf. lib/server/after-safe.ts). Le direct n'a
   * AUCUN repli — rien n'est persisté, contrairement aux events que le fil
   * rattrape en 2 s au poll : le perdre, c'est perdre le rendu streamé.
   */
  if (method === "POST" && surface === "/stream") {
    afterOrNow(() =>
      broadcastToTopic(agentRunTopic(runId), "stream", {
        text: typeof body.text === "string" ? body.text : "",
        tools: num(body.tools) ?? 0,
        reasoningActive: body.reasoningActive === true,
        reasoningMs: num(body.reasoningMs) ?? 0,
        // La VM est du CODE À NOUS, mais elle reste de l'autre côté d'un POST : on
        // ne rediffuse pas sa liste telle quelle. Bornée comme celle de fin de tour,
        // et réduite aux deux champs que le fil lit — sinon un payload malformé (ou
        // simplement gros) partirait tel quel sur le topic de tous les abonnés.
        ...liveFiles(body.files, body.filesTruncated),
        at: Date.now(),
      }),
    );
    return ok();
  }

  // La ligne du run est le CONTEXTE, et elle est relue à chaque appel : c'est ce
  // qui rend la surface sans état, donc sûre à appeler depuis une VM qui peut
  // mourir entre deux requêtes. Un run supprimé (rétention) ou un nom de sandbox
  // qui ne correspond à rien tombe ici, pas plus loin.
  const run = await getRun(runId);
  if (!run) return { status: 404, body: { error: "unknown run" } };

  // La microVM du run est nommée une fois pour toutes et persistée : une autre
  // n'a rien à écrire ici, même signée par la plateforme (MIN-331). `null` =
  // run dont la VM n'est pas encore enregistrée, on laisse passer.
  if (opts.sandboxName && run.sandbox_id && run.sandbox_id !== opts.sandboxName) {
    return { status: 403, body: { error: "sandbox does not run this run" } };
  }

  if (method === "POST" && surface === "/events") {
    const type = typeof body.type === "string" ? body.type : "";
    if (!type) return bad("events: missing type");
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    // `appendEvent` calcule `seq`, retente sur collision et diffuse derrière —
    // exactement ce que fait la boucle aujourd'hui, au même endroit.
    await appendEvent(runId, type as AgentEventType, payload);
    return ok();
  }

  if (method === "POST" && surface === "/usage") {
    const feature = body.feature as AiFeature;
    if (!VM_ALLOWED_FEATURES.has(feature)) return bad(`usage: feature not allowed (${feature})`);
    const model = typeof body.model === "string" ? body.model : run.model;
    /**
     * LE MONTANT N'EST PAS UNE DÉCLARATION (MIN-329) : borné, puis plafonné par
     * ce que les tokens rapportés peuvent coûter au tarif du modèle. Un `cost`
     * négatif remettait la consommation du mois à neuf, pour tout le compte.
     */
    const claim = checkUsageClaim(body, await usagePricingFor(model, body.cost));
    if (!claim.ok) {
      // ÇA SE TRACE, et pas seulement dans les logs : une ligne refusée est une
      // dépense qui n'entre nulle part, et ce trou-là doit être lisible sur le
      // run où il s'est fait — c'est ce qui distingue « la VM a menti » d'un
      // compteur qui dérive sans raison apparente.
      console.error(`[agent-control-plane] usage refusée sur ${runId} — ${claim.reason}`);
      await appendEvent(runId, "error", { code: "usageRejected", reason: claim.reason });
      return bad(`usage: ${claim.reason}`);
    }
    if (claim.clampedFrom !== undefined) {
      console.error(
        `[agent-control-plane] usage plafonnée sur ${runId} — ${claim.clampedFrom} $ ` +
          `annoncés, ${claim.cost} $ écrits (${model})`,
      );
    }
    await recordAiUsage({
      // Même identifiant de facturation que la boucle d'aujourd'hui : la ligne de
      // ledger d'un run repris doit tomber sous le même `run_id`, sinon le plafond
      // du run ne voit plus la moitié de sa dépense.
      runId: run.run_id ?? run.id,
      seq: seqField(body.seq),
      feature,
      billTo: billToFor(run),
      model,
      ...(typeof body.provider === "string" ? { provider: body.provider } : {}),
      generationId: typeof body.generationId === "string" ? body.generationId : null,
      promptTokens: claim.promptTokens,
      completionTokens: claim.completionTokens,
      totalTokens: claim.totalTokens,
      cachedTokens: claim.cachedTokens,
      cacheWriteTokens: claim.cacheWriteTokens,
      cost: claim.cost,
      ...(claim.estimated ? { estimated: true } : {}),
      projectId: run.project_id,
    });
    return ok();
  }

  if (surface === "/checkpoint") {
    if (method === "GET") return ok({ checkpoint: run.checkpoint ?? null });
    if (method === "PUT") {
      const checkpoint = (body.checkpoint ?? null) as AgentCheckpoint | null;
      // La sauvegarde périodique fait aussi office de BATTEMENT DE CŒUR (MIN-224) :
      // c'est le seul signal régulier qu'un tour qui vit dans la VM produise, et
      // c'est sur ce champ que le chien de garde décide d'aller interroger la
      // plateforme. Sans lui, il irait la sonder pour chaque run à chaque passage.
      const stamped = await stampRunResult(runId, {
        checkpoint,
        last_activity_at: new Date().toISOString(),
      });
      /**
       * UNE PANNE D'ÉCRITURE N'EST PAS UN RUN CONCLU, et les confondre coûtait le
       * tour (MIN-286). Le superviseur lit un 409 comme « la conversation n'existe
       * plus » : il coupe, il ne pousse pas, il rend la main. Une base qui refuse
       * la ligne — un octet nul dans la sortie d'une commande, une coupure — lui
       * disait donc d'abandonner un tour parfaitement vivant. C'est un 5xx : le
       * client du plan de contrôle retente, et le tour continue.
       */
      if (stamped.failed) {
        return { status: 503, body: { error: "checkpoint save failed — retry" } };
      }
      // La garde de `stampRun` (`status in ('running')`) n'a pas matché : le run a
      // été annulé, ou un autre exécuteur a conclu. Ça se DIT — une VM qui croit
      // avoir sauvegardé et continue travaille pour une conversation qui est finie.
      if (!stamped.run) return { status: 409, body: { error: "run is no longer running" } };
      return ok();
    }
  }

  /**
   * LE JOURNAL D'OPENCODE, EN APPEND (MIN-286, 2026-08-13).
   *
   * La microVM n'envoie que ce que `/sync/history` vient de rendre de NEUF ; la
   * base garde le reste. C'est ce qui a remplacé « le checkpoint porte tout le
   * journal », qui ne pouvait pas tenir : la sortie complète de chaque tool y
   * passe, et le corps du plan de contrôle est plafonné.
   */
  if (method === "POST" && surface === "/journal") {
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const events = Array.isArray(body.events)
      ? (body.events as Record<string, unknown>[])
      : [];
    if (!sessionId) return bad("journal: missing sessionId");
    await appendRunJournal(runId, sessionId, events);
    return ok({ appended: events.length });
  }

  if (method === "GET" && surface === "/messages") {
    // Draine ET consomme, comme la boucle le fait à la frontière de round : un run
    // n'a qu'UN écrivain à la fois (le claimer), donc pas de double lecture.
    return ok({ messages: await pullPendingMessages(runId) });
  }

  /**
   * REMETTRE EN FILE CE QU'ON A DRAINÉ SANS SAVOIR LE JOUER (MIN-286).
   *
   * `GET /messages` CONSOMME, et le superviseur draine avant de couper le round
   * pour reposter derrière. Quand le tour sort entre les deux — plafond de
   * dépense, deadline, run conclu ailleurs, coupure subie —, le message n'a été ni
   * joué ni gardé : il était consommé en base et vivant dans une variable locale
   * de la microVM, qui meurt avec elle. L'utilisateur voyait son message accepté
   * puis ignoré pour toujours, et le run ne se réveillait même pas (c'est la file
   * qui le re-queue).
   *
   * On le réinsère donc tel quel, sans auteur : il redevient un message en attente,
   * exactement comme s'il venait d'être écrit.
   */
  if (method === "POST" && surface === "/messages") {
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .flatMap((message) => {
        const text =
          typeof message === "string"
            ? message
            : message &&
                typeof message === "object" &&
                typeof (message as { text?: unknown }).text === "string"
              ? (message as { text: string }).text
              : null;
        if (text === null || text.trim().length === 0) return [];
        // BORNÉ COMME À L'ÉCRITURE (MIN-329). Ce qu'on remet en file a été écrit
        // par un humain via `/steer`, qui coupe à `MAX_MESSAGE_LEN` — donc rien
        // d'honnête ne dépasse ici. Sans la borne, la surface écrivait en base
        // autant de messages que la VM en envoyait, de la taille qu'elle voulait,
        // et chacun revenait ensuite dans le prompt du tour suivant.
        return [
          {
            text: text.slice(0, MAX_MESSAGE_LEN),
            mentions: (message as { mentions?: unknown })?.mentions,
          },
        ];
      })
      .slice(0, MAX_REQUEUED_MESSAGES);
    for (const message of messages) {
      await insertRunMessage(runId, null, message.text, parseAgentMentions(message.mentions));
    }
    return ok({ requeued: messages.length });
  }

  if (method === "GET" && surface === "/messages/pending") {
    // La même question SANS consommer : c'est la sonde de l'attente d'un
    // sous-agent (« l'utilisateur a-t-il écrit ? »), polée toutes les 3 s pendant
    // qu'une fille travaille. Drainer ici avalerait le message — personne ne
    // l'injecterait dans l'historique, et l'utilisateur n'obtiendrait rien.
    return ok({ pending: await hasPendingRunMessages(runId) });
  }

  if (surface === "/interrupt") {
    if (method === "GET") return ok({ interrupted: await readInterruptFlag(runId) });
    // La boucle CONSOMME le drapeau quand le « stop » qu'elle vient de lire
    // arrivait avec un message : le tour se poursuit alors avec la consigne au
    // lieu de sortir pour être re-queué par ce message resté en file. C'est le
    // seul écrivain de ce champ côté VM, et il ne peut l'écrire que sur son run.
    if (method === "DELETE") {
      await clearInterrupt(runId);
      return ok();
    }
  }

  if (method === "GET" && surface === "/budget") {
    return ok({ remainingUsd: await turnBudgetRemainingUsd(run) });
  }

  if (method === "POST" && surface === "/plan-sync") {
    // Miroir des états du checklist de l'agent vers le plan du ticket lié. Un run
    // carnet n'a pas d'issue : rien à faire, et ce n'est pas une erreur.
    if (run.issue_id) {
      const { syncIssuePlanStates } = await import("./plan-sync");
      const steps = Array.isArray(body.steps) ? body.steps : [];
      await syncIssuePlanStates(run.issue_id, steps as Parameters<typeof syncIssuePlanStates>[1]);
    }
    return ok();
  }

  if (method === "POST" && surface === "/repo-auth") {
    // Un token de forge FRAIS. C'est la seule raison d'être de cette surface : un
    // tour qui vit dans la VM peut durer plus longtemps que le token
    // d'installation qui a cloné le dépôt, et un push qui échoue en 401 à la
    // troisième heure serait le travail du tour perdu jusqu'au tour suivant.
    /**
     * ET UNE RELECTURE N'EN REÇOIT PAS (MIN-327).
     *
     * La surface délivrait un token neuf à n'importe quelle VM, sans regarder
     * l'ancrage : une session de relecture — la seule dont tout le contenu vient
     * d'un fork inconnu — en obtenait un EN ÉCRITURE, qui atterrissait dans son
     * `.git/config`. Une injection de prompt depuis le fork suffisait à le lire
     * et à l'exfiltrer.
     *
     * Or une relecture ne pousse jamais : `writesToRepo` est faux dans
     * `execute.ts`, et côté VM `repoAuthUrl()` n'est appelé QUE depuis `pushWork`.
     * Refuser ici ne lui retire donc rien — et son clone, lui, part avec un token
     * `repo-read` (cf. `RepoTokenAccess`).
     *
     * Le refus est BRUYANT plutôt que silencieux : c'est une frontière, elle doit
     * se voir dans un log. Le client du plan de contrôle le tolère (il retombe
     * sur l'URL que son job porte).
     */
    if (anchorForRun(run) === "pr") {
      return forbidden("a review session never pushes, so it gets no repository token");
    }
    const { resolveRepoCloneTarget } = await import("./repo-access");
    // `repo-write` et non `full` : ce token descend dans la microVM, où `git` est
    // son seul consommateur. Il clone, il fetch, il pousse — il ne merge pas une
    // pull request et n'en approuve pas une.
    const target = await resolveRepoCloneTarget(run.project_id, "repo-write").catch(() => null);
    if (!target) return { status: 404, body: { error: "no repository linked" } };
    return ok({ authUrl: target.authUrl });
  }

  if (method === "POST" && surface === "/rest") {
    // LA FIN DU TOUR. La VM a poussé son travail et rend la main ; tout ce qui
    // suit demande la base et la forge, donc la fonction (cf. `vm-rest.ts`).
    const report = body as unknown as VmTurnReport;
    if (typeof report?.status !== "string") return bad("rest: missing status");
    /**
     * UNE SEULE FOIS. Le client du plan de contrôle retente sur 5xx : sans cette
     * garde, un rapport dont la réponse s'est perdue en vol serait rejoué —
     * events en double dans le fil, et une seconde ligne de compute au ledger.
     * Le 409 n'est pas retenté (cf. `retryable`), donc la VM s'arrête là, ce qui
     * est exactement ce qu'on veut : le tour EST conclu.
     */
    if (run.status !== "running") {
      return { status: 409, body: { error: "run is no longer running" } };
    }
    const { landVmTurn } = await import("./vm-rest");
    await landVmTurn(run, report);
    return ok();
  }

  if (method === "POST" && surface.startsWith("/tool/")) {
    return await runPlatformTool(run, surface.slice("/tool/".length), body);
  }

  return { status: 404, body: { error: `unknown surface: ${method} ${surface}` } };
}

/**
 * Rejoue côté fonction un tool de PLATEFORME — ticket ou carnet. Ce sont ceux
 * dont le contexte est ENTIÈREMENT reconstructible depuis la ligne du run : rien
 * à transporter, rien à croire sur parole.
 *
 * Les tools de FICHIER (`read_file`, `edit_file`, `run_command`…) ne passent
 * délibérément pas par ici : ils s'exécuteront DANS la VM, c'est tout le sujet de
 * MIN-224.
 *
 * LE NOM NE SUFFIT PAS À ROUTER (MIN-326). Ce qu'un run a le droit d'appeler est
 * une propriété de SON ANCRAGE, lue sur sa ligne et opposée ici à la table de
 * `platform-tool-names.ts` — la même que celle qui décide de ce qu'on annonce au
 * modèle. Sans ce passage, une session de relecture, dont tout ce qu'elle lit
 * vient d'un fork inconnu, écrivait dans les tickets et le carnet du projet par
 * un simple POST depuis son shell : « relecture = zéro écriture » n'était qu'une
 * phrase de prompt, et une injection suffisait à la franchir.
 */
async function runPlatformTool(
  run: AgentRun,
  name: string,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const args = (body.args ?? {}) as Record<string, unknown>;

  const anchor = anchorForRun(run);
  if (!PLATFORM_TOOLS_BY_ANCHOR[anchor].has(name)) {
    return forbidden(`${name} is not available in this session (anchor: ${anchor})`);
  }

  if (SCRATCHPAD_TOOL_NAMES.has(name)) {
    /**
     * LE CARNET EST PERSONNEL, et il est celui du CRÉATEUR du run. Or n'importe
     * quel membre du projet peut reprendre un run à chaud (`/steer`) : sans cette
     * garde, un collègue pilotait un agent branché sur le carnet de quelqu'un
     * d'autre — il le lisait, et pouvait le réécrire en entier (`set_scratchpad`).
     *
     * La règle porte sur la VIE DU RUN, pas sur le tour : la consigne d'un tiers
     * reste dans l'historique et gouverne les tours suivants. Un run touché par
     * un autre que son créateur perd donc son carnet jusqu'au bout.
     */
    if (!run.created_by) return forbidden(`${name}: this run has no owner, so it has no notebook`);
    const { runSteeredByOther } = await import("./runs");
    if (await runSteeredByOther(run.id, run.created_by)) {
      return forbidden(
        `${name}: this session has been steered by someone other than its owner, ` +
          `so the notebook is closed for the rest of it`,
      );
    }
    const ctx: ScratchpadToolContext = { userId: run.created_by };
    return ok(await executeScratchpadTool(ctx, name, args));
  }

  if (ISSUE_TOOL_NAMES.has(name)) {
    const ctx = await issueContextFor(run, body);
    return ok(await executeIssueTool(ctx, name, args));
  }

  if (PR_TOOL_NAMES.has(name)) {
    return await runPrTool(run, name, args, body);
  }

  if (PROJECT_PR_TOOL_NAMES.has(name)) {
    return await runProjectPrTool(run, name, args, body);
  }

  if (name === "web_search") {
    return await runWebSearch(run, args);
  }

  if (name === "create_pr") {
    return await runCreatePr(run, args, body);
  }

  /**
   * Inatteignable par la VM : la table ci-dessus a déjà refusé tout nom qu'elle ne
   * porte pas. On n'arrive ici qu'en ajoutant un nom à la table sans lui câbler
   * d'exécuteur — un défaut de NOTRE côté, qui doit se voir comme tel.
   */
  return { status: 500, body: { error: `platform tool allowed but not routed: ${name}` } };
}

/**
 * Les trois écritures sur la pull request RELUE (MIN-168), rejouées ici : elles
 * ont besoin du client de forge et de son token, qui n'entrent pas dans la VM.
 *
 * LE COMPTEUR D'ANCRES fait l'aller-retour, et c'est ce qui rend son plafond
 * juste. « 5 par run » se compte sur la vie du run, pas sur un tour : la VM
 * l'envoie, la fonction l'oppose au plafond puis rend celui qu'elle a atteint.
 * Le lire en base à chaque appel coûterait une requête par commentaire pour la
 * même réponse ; le laisser dans la VM le remettrait à zéro à chaque tour.
 */
async function runPrTool(
  run: AgentRun,
  name: string,
  args: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const [{ executePrTool }, { loadPrRunContext }, { resolveRepoCloneTarget }, { forgeFor }] =
    await Promise.all([
      import("./pr-tools"),
      import("./pr-run"),
      import("./repo-access"),
      import("./forge"),
    ]);
  if (!run.pull_request_id) {
    return bad(`${name} is only available in a pull request review session`);
  }
  const [prRun, target] = await Promise.all([
    loadPrRunContext(run.pull_request_id),
    resolveRepoCloneTarget(run.project_id),
  ]);
  if (!prRun || !target) return bad(`${name}: the pull request is no longer reachable`);

  const forge = forgeFor(target.provider);
  const call = { token: target.token, repoFullName: target.repoFullName, number: prRun.number };
  const inline = { used: seqField(body.prInlineComments) };
  const { locale } = await runPrefsFor(run);
  const outcome = await executePrTool(
    {
      forge,
      call,
      // Paresseux et payé une seule fois par appel : la validation d'ancre en a
      // besoin, un commentaire de PR entier n'y touche jamais.
      files: async () => (await forge.listPullRequestFiles(call)).files,
      model: run.model ?? "",
      locale,
      inline,
    },
    name,
    args,
  );
  return ok({ ...outcome, inlineUsed: inline.used });
}

/**
 * Les pull requests DU PROJET (MIN-267), rejouées ici pour la même raison que
 * celles de la relecture : la forge et son token n'entrent pas dans la VM, et la
 * liste se lit en base.
 *
 * `pull_request_id` non nul = session de RELECTURE : ces tools ne lui sont ni
 * offerts (`agentToolsFor`) ni câblés (`vm/turn.ts`), et le refus ici est le
 * troisième verrou — celui qui tient même si un checkpoint d'avant rejoue un
 * appel.
 *
 * Le compteur d'ancres fait le même aller-retour que là-haut, et c'est le MÊME
 * plafond : « 5 par run », toutes pull requests confondues.
 *
 * CE QUE LE CORPS PEUT DIRE, ET CE QU'IL NE PEUT PAS (audit MIN-326). Le seul
 * identifiant que le modèle choisit est le NUMÉRO de pull request, et il est
 * résolu contre le dépôt du PROJET DU RUN (`repo()` part de `run.project_id`) :
 * une VM ne peut donc pas désigner la pull request d'un autre projet, quel que
 * soit le numéro qu'elle envoie. Reste `prInlineComments`, qui est un COMPTEUR et
 * pas un identifiant : une VM qui le renvoie à zéro s'offre des ancres en plus.
 * C'est le prix assumé de le faire voyager (cf. `tool-bridge.ts`) — le plafond
 * borne du bruit, pas un droit.
 */
async function runProjectPrTool(
  run: AgentRun,
  name: string,
  args: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  if (run.pull_request_id) {
    return bad(`${name} is not available in a pull request review session`);
  }
  const [{ executeProjectPrTool }, { resolveRepoCloneTarget }] = await Promise.all([
    import("./project-pr-tools"),
    import("./repo-access"),
  ]);
  const { locale } = await runPrefsFor(run);
  const inline = { used: seqField(body.prInlineComments) };
  const outcome = await executeProjectPrTool(
    {
      projectId: run.project_id,
      // Un token FRAIS par appel : un tour de VM dure plus longtemps que celui
      // qui a cloné le dépôt.
      repo: async () => {
        const target = await resolveRepoCloneTarget(run.project_id).catch(() => null);
        if (!target) return null;
        return {
          token: target.token,
          repoFullName: target.repoFullName,
          provider: target.provider,
        };
      },
      model: run.model ?? "",
      locale,
      inline,
    },
    name,
    args,
  );
  return ok({ ...outcome, inlineUsed: inline.used });
}

/**
 * `web_search` : la clé du run l'accompagne, et elle ne descend pas dans la VM.
 * Le plafond par tour, lui, reste où il était — dans la boucle, qui compte ses
 * appels. Ici on ne fait que payer et rendre.
 */
async function runWebSearch(
  run: AgentRun,
  args: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const query = String(args.query ?? "").trim();
  if (!query) return bad("web_search: query is required");
  const [{ runWebSearchTool }, { resolveAgentApiKey }] = await Promise.all([
    import("@/lib/server/web-search"),
    import("./model"),
  ]);
  // Le lanceur du run, et lui seul : c'est SA clé (BYOK) ou SON quota qui paie
  // la recherche, exactement comme pour les appels du modèle.
  if (!run.created_by) return bad("web_search: this run has no owner");
  const { apiKey } = await resolveAgentApiKey(run.created_by);
  const outcome = await runWebSearchTool({
    query,
    apiKey,
    runId: run.run_id ?? run.id,
    // La bande de seq des recherches est à elle ; le compteur repart du tour, et
    // deux recherches d'un même tour ne se marchent pas dessus.
    // L'index reste DANS sa bande : 99 recherches par tour, et pas de nombre
    // reçu qui aille se ranger dans la bande d'une autre feature (MIN-329).
    seq: WEB_SEARCH_SEQ_BASE + run.continuations * 100 + seqField(args.seq, 99),
    billTo: billToFor(run),
    projectId: run.project_id,
  });
  return ok(outcome);
}

/**
 * `create_pr`, MOITIÉ FORGE. La VM a déjà poussé (elle a le dépôt) ; ce qui reste
 * — PR mergée, PR déjà vivante, PR refusée à rouvrir, création — vit ici, dans
 * l'implémentation partagée avec l'ancienne forme.
 *
 * CE QUE LE CORPS PEUT DIRE (audit MIN-326) : le dépôt vient de `run.project_id`,
 * la base de `run.base_branch`, le ticket de l'ancrage du run — aucun des trois
 * n'est reçu. La VM ne choisit que la BRANCHE DE TÊTE, et il faut qu'elle la
 * choisisse : `create_pr` EST son premier push, donc `branch_name` est encore nul
 * sur la ligne (MIN-123). Ce qu'elle peut en faire reste borné au dépôt du projet
 * — ouvrir une pull request depuis une autre branche de CE dépôt, ce qu'un `git
 * push` depuis le même shell permettrait de toute façon.
 */
async function runCreatePr(
  run: AgentRun,
  args: Record<string, unknown>,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const [{ openPullRequestAfterPush }, { resolveRepoCloneTarget }, { forgeFor }] =
    await Promise.all([import("./pr-landing"), import("./repo-access"), import("./forge")]);
  const target = await resolveRepoCloneTarget(run.project_id).catch(() => null);
  if (!target) return bad("create_pr: no repository linked to this project");

  const pushed = body.pushed as
    | { pushed: boolean; remoteUpdated: boolean; headSha: string }
    | undefined;
  if (!pushed) return bad("create_pr: missing push result");

  const anchorId = await anchorIssueIdFor(run);
  const identifier = anchorId ? await issueIdentifier(anchorId) : null;
  const { locale } = await runPrefsFor(run);
  const prState = { number: run.pr_number, url: run.pr_url, state: run.pr_state };
  const title = String(args.title ?? "").trim();
  /**
   * LA BRANCHE DE TÊTE, envoyée par la VM. `agent_runs.branch_name` ne vaut
   * quelque chose qu'après un premier push RÉEL (MIN-123) — or `create_pr` EST
   * ce premier push dans le cas normal. Le lire seul ici ouvrait la pull request
   * sur une tête vide, et stampait `branch_name: ""` au passage.
   */
  const workBranch =
    (typeof body.workBranch === "string" ? body.workBranch.trim() : "") || run.branch_name || "";

  const outcome = await openPullRequestAfterPush(
    {
      run,
      target,
      forge: forgeFor(target.provider),
      issue: identifier ? { identifier } : null,
      workBranch,
      baseBranch: run.base_branch ?? target.defaultBranch,
      locale,
      emit: (type, payload) => appendEvent(run.id, type, payload),
      prState,
    },
    {
      pushed,
      prTitle: title || (identifier ? `${identifier}: agent work` : "Agent work"),
      body: typeof args.body === "string" ? args.body : undefined,
      fresh: target,
      jobsNote: typeof body.jobsNote === "string" ? body.jobsNote : "",
      // La branche existe sur le dépôt dès ce push : c'est ici qu'on
      // l'enregistre, comme l'ancienne forme le fait à son premier push réel.
      noteBranchPushed: async (p) => {
        if (!p.pushed || run.branch_name || !workBranch) return;
        await stampRun(run.id, { branch_name: workBranch }).catch(() => null);
      },
    },
  );
  return ok(outcome);
}

/** `MIN-42` du ticket donné, ou null. */
async function issueIdentifier(issueId: string): Promise<string | null> {
  const { getServiceClient } = await import("@/lib/supabase-service");
  const { data } = await getServiceClient()
    .from("issues")
    .select("number, projects(key)")
    .eq("id", issueId)
    .maybeSingle();
  const row = data as { number?: number; projects?: { key?: string } | null } | null;
  return row?.projects?.key && row.number ? `${row.projects.key}-${row.number}` : null;
}

/**
 * Le contexte des tools ticket, reconstruit depuis la ligne du run — mêmes
 * champs que ceux que `execute.ts` assemble aujourd'hui, et pour les mêmes
 * raisons.
 *
 * Un seul champ vient du corps : `imageInput`. Ce n'est pas un oubli — il dépend
 * du modèle du run et d'un index de capacités que la VM a déjà en main, il ne
 * décide de rien qu'elle ne puisse déjà faire (au pire elle reçoit une image
 * qu'elle a demandée), et le relire ici coûterait un appel réseau par tool.
 */
async function issueContextFor(
  run: AgentRun,
  body: Record<string, unknown>,
): Promise<IssueToolContext> {
  const [projectKey, prefs, anchorIssueId] = await Promise.all([
    projectKeyFor(run),
    runPrefsFor(run),
    anchorIssueIdFor(run),
  ]);
  return {
    anchorIssueId,
    projectId: run.project_id,
    projectKey,
    // L'ACTEUR des écritures, et c'est le lanceur du run — pas la VM, qui n'a
    // pas d'identité propre, et pas le owner du projet.
    actorId: run.created_by,
    numoDefaultStatus: prefs.numoDefaultStatus,
    imageInput: body.imageInput === true,
    runId: run.id,
    chainId: run.chain_id,
  };
}

/**
 * Le ticket ANCRE — la cible par défaut des tools ticket, et la même que celle
 * qu'`execute.ts` assemble.
 *
 * Sur une RELECTURE de pull request, `run.issue_id` est TOUJOURS nul (une session
 * de review n'occupe pas un ticket) : le défaut est alors le ticket que la PR met
 * en œuvre, quand elle en porte un (MIN-143). Sans ce repli, le tool annoncerait
 * un défaut qui n'existe pas et le premier `read_issue` sans argument brûlerait un
 * round — exactement ce que la ligne jumelle d'`execute.ts` existe pour éviter.
 *
 * La PR se relit par `loadPrRunContext`, le résolveur unique de l'ancrage PR : la
 * relire à la main ici serait la cinquième lecture que ce module-là a été écrit
 * pour supprimer.
 */
async function anchorIssueIdFor(run: AgentRun): Promise<string | null> {
  if (run.issue_id) return run.issue_id;
  if (!run.pull_request_id) return null;
  const { loadPrRunContext } = await import("./pr-run");
  return (await loadPrRunContext(run.pull_request_id))?.issueId ?? null;
}

/** Clé du projet du run (préfixe des identifiants de tickets). */
async function projectKeyFor(run: AgentRun): Promise<string> {
  const { getServiceClient } = await import("@/lib/supabase-service");
  const { data } = await getServiceClient()
    .from("projects")
    .select("key")
    .eq("id", run.project_id)
    .maybeSingle();
  return (data as { key?: string } | null)?.key ?? "";
}

/** Statut d'atterrissage d'un ticket créé par l'agent : le réglage du LANCEUR,
 *  jamais un paramètre du modèle (cf. `resolveRunPrefs` dans execute.ts). */
async function runPrefsFor(run: AgentRun) {
  if (run.created_by) {
    const r = await getAccountSettings({ userId: run.created_by });
    if (r.ok) {
      return { locale: r.settings.locale, numoDefaultStatus: r.settings.numo_default_status };
    }
  }
  return { locale: defaultLocale, numoDefaultStatus: DEFAULT_NUMO_STATUS };
}
