import "server-only";

import { recordAiUsage, type AiUsageBillTo, type AiFeature } from "@/lib/server/ai-usage";
import { getAccountSettings } from "@/lib/server/account-settings";
import { afterOrNow } from "@/lib/server/after-safe";
import { defaultLocale } from "@/i18n/config";
import { DEFAULT_NUMO_STATUS } from "@/lib/numo-default-status";

import { executeIssueTool, ISSUE_TOOL_NAMES, type IssueToolContext } from "./issue-tools";
import {
  executeScratchpadTool,
  SCRATCHPAD_TOOL_NAMES,
  type ScratchpadToolContext,
} from "./scratchpad-tools";
import { agentRunTopic, broadcastToTopic } from "./live";
import {
  appendEvent,
  getRun,
  pullPendingMessages,
  readInterruptFlag,
  stampRun,
  type AgentRun,
} from "./runs";
import type { AgentCheckpoint } from "./runs";
import type { AgentEventType } from "./agent-loop";

/**
 * PLAN DE CONTRÔLE de la microVM (MIN-223) — la seule surface par laquelle une
 * boucle qui vit dans la VM touchera la base, le ledger, les tickets et le carnet.
 *
 * CE QUI FAIT QUE ÇA TIENT, et c'est une seule idée. La VM ne porte aucun jeton :
 * le firewall de Vercel Sandbox forwarde ses requêtes vers notre route en y
 * ajoutant un OIDC signé par la plateforme, dont le claim `sandbox_name` vaut
 * `agent-<run.id>`. **Le `runId` est donc un paramètre d'ENTRÉE de ce module,
 * dérivé de ce claim — jamais lu dans le corps de la requête.** Tout le reste en
 * découle :
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
 * CE QUI N'EST PAS ENCORE LÀ, et pourquoi. Les tools de PULL REQUEST et
 * `create_pr` ne sont pas servis : leur contexte n'est pas reconstructible sans
 * décider d'abord ce que la boucle de MIN-224 enverra (compteur d'ancres posées,
 * état de push du tour, sha de tête). Les inventer ici les ferait écrire deux
 * fois, et la seconde version gagnerait. Ils arrivent avec la boucle.
 */

/** Ce qu'une surface rend : un statut HTTP et un corps JSON. */
export interface ControlPlaneResult {
  status: number;
  body: unknown;
}

const ok = (body: unknown = { ok: true }): ControlPlaneResult => ({ status: 200, body });
const bad = (message: string): ControlPlaneResult => ({ status: 400, body: { error: message } });

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
 * Une requête du plan de contrôle. `runId` vient de l'OIDC ; `surface` est le
 * chemin sous `/api/agent-vm` (`/events`, `/tool/read_issue`…).
 */
export async function handleControlPlaneRequest(opts: {
  runId: string;
  method: string;
  surface: string;
  /** Corps JSON déjà parsé. `null` sur un GET. */
  body: Record<string, unknown> | null;
}): Promise<ControlPlaneResult> {
  const { runId, method, surface } = opts;
  const body = opts.body ?? {};

  // La ligne du run est le CONTEXTE, et elle est relue à chaque appel : c'est ce
  // qui rend la surface sans état, donc sûre à appeler depuis une VM qui peut
  // mourir entre deux requêtes. Un run supprimé (rétention) ou un nom de sandbox
  // qui ne correspond à rien tombe ici, pas plus loin.
  const run = await getRun(runId);
  if (!run) return { status: 404, body: { error: "unknown run" } };

  if (method === "POST" && surface === "/events") {
    const type = typeof body.type === "string" ? body.type : "";
    if (!type) return bad("events: missing type");
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    // `appendEvent` calcule `seq`, retente sur collision et diffuse derrière —
    // exactement ce que fait la boucle aujourd'hui, au même endroit.
    await appendEvent(runId, type as AgentEventType, payload);
    return ok();
  }

  if (method === "POST" && surface === "/stream") {
    // LE TOPIC EST DÉRIVÉ DU RUN, jamais reçu. C'est la seule ligne de ce fichier
    // qui empêche une VM de diffuser sur le fil d'une autre.
    //
    // `afterOrNow` et PAS `broadcastRunStream` : celui-ci DÉTACHE son fetch
    // (`void broadcast(…)`, live.ts). Ça convient à la boucle, qui vit dans une
    // invocation qui continue derrière — pas ici : la réponse part à la ligne
    // suivante, la plateforme gèle la fonction, et la requête sortante meurt en
    // vol (« TypeError: fetch failed », cf. lib/server/after-safe.ts). Le direct
    // n'a AUCUN repli — rien n'est persisté, contrairement aux events que le fil
    // rattrape en 2 s au poll : le perdre, c'est perdre le rendu streamé.
    afterOrNow(() =>
      broadcastToTopic(agentRunTopic(runId), "stream", {
        text: typeof body.text === "string" ? body.text : "",
        tools: num(body.tools) ?? 0,
        reasoningActive: body.reasoningActive === true,
        reasoningMs: num(body.reasoningMs) ?? 0,
        at: Date.now(),
      }),
    );
    return ok();
  }

  if (method === "POST" && surface === "/usage") {
    const feature = body.feature as AiFeature;
    if (!VM_ALLOWED_FEATURES.has(feature)) return bad(`usage: feature not allowed (${feature})`);
    await recordAiUsage({
      // Même identifiant de facturation que la boucle d'aujourd'hui : la ligne de
      // ledger d'un run repris doit tomber sous le même `run_id`, sinon le plafond
      // du run ne voit plus la moitié de sa dépense.
      runId: run.run_id ?? run.id,
      seq: num(body.seq) ?? 0,
      feature,
      billTo: billToFor(run),
      model: typeof body.model === "string" ? body.model : run.model,
      ...(typeof body.provider === "string" ? { provider: body.provider } : {}),
      generationId: typeof body.generationId === "string" ? body.generationId : null,
      promptTokens: num(body.promptTokens),
      completionTokens: num(body.completionTokens),
      totalTokens: num(body.totalTokens),
      cost: num(body.cost),
      ...(body.estimated === true ? { estimated: true } : {}),
      projectId: run.project_id,
    });
    return ok();
  }

  if (surface === "/checkpoint") {
    if (method === "GET") return ok({ checkpoint: run.checkpoint ?? null });
    if (method === "PUT") {
      const checkpoint = (body.checkpoint ?? null) as AgentCheckpoint | null;
      const stamped = await stampRun(runId, { checkpoint });
      // La garde de `stampRun` (`status in ('running')`) n'a pas matché : le run a
      // été annulé, ou un autre exécuteur a conclu. Ça se DIT — une VM qui croit
      // avoir sauvegardé et continue travaille pour une conversation qui est finie.
      if (!stamped) return { status: 409, body: { error: "run is no longer running" } };
      return ok();
    }
  }

  if (method === "GET" && surface === "/messages") {
    // Draine ET consomme, comme la boucle le fait à la frontière de round : un run
    // n'a qu'UN écrivain à la fois (le claimer), donc pas de double lecture.
    return ok({ messages: await pullPendingMessages(runId) });
  }

  if (method === "GET" && surface === "/interrupt") {
    return ok({ interrupted: await readInterruptFlag(runId) });
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
 */
async function runPlatformTool(
  run: AgentRun,
  name: string,
  body: Record<string, unknown>,
): Promise<ControlPlaneResult> {
  const args = (body.args ?? {}) as Record<string, unknown>;

  if (SCRATCHPAD_TOOL_NAMES.has(name)) {
    const ctx: ScratchpadToolContext = { userId: run.created_by };
    return ok(await executeScratchpadTool(ctx, name, args));
  }

  if (ISSUE_TOOL_NAMES.has(name)) {
    const ctx = await issueContextFor(run, body);
    return ok(await executeIssueTool(ctx, name, args));
  }

  return { status: 404, body: { error: `unknown platform tool: ${name}` } };
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
