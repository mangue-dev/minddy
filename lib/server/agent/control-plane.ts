import "server-only";

import { recordAiUsage, type AiUsageBillTo, type AiFeature } from "@/lib/server/ai-usage";
import { getAccountSettings } from "@/lib/server/account-settings";
import { afterOrNow } from "@/lib/server/after-safe";
import { defaultLocale } from "@/i18n/config";
import { DEFAULT_NUMO_STATUS } from "@/lib/numo-default-status";

import { executeIssueTool, type IssueToolContext } from "./issue-tools";
import {
  ISSUE_TOOL_NAMES,
  PR_TOOL_NAMES,
  SCRATCHPAD_TOOL_NAMES,
} from "./platform-tool-names";
import { WEB_SEARCH_SEQ_BASE } from "@/lib/server/web-search";
import type { VmTurnReport } from "./vm/protocol";
import { executeScratchpadTool, type ScratchpadToolContext } from "./scratchpad-tools";
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
 * CE QUI S'Y EST AJOUTÉ AVEC LA BOUCLE (MIN-224). Les tools de PULL REQUEST,
 * `create_pr` et `web_search` sont désormais servis : ce qui manquait n'était pas
 * la surface mais ce que la boucle enverrait — le compteur d'ancres posées,
 * l'état de push du tour. Plus `/rest`, la fin de tour, et `/repo-auth`, qui rend
 * un token de forge frais à une VM qui travaille depuis plus longtemps que le
 * sien.
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
      // La sauvegarde périodique fait aussi office de BATTEMENT DE CŒUR (MIN-224) :
      // c'est le seul signal régulier qu'un tour qui vit dans la VM produise, et
      // c'est sur ce champ que le chien de garde décide d'aller interroger la
      // plateforme. Sans lui, il irait la sonder pour chaque run à chaque passage.
      const stamped = await stampRun(runId, {
        checkpoint,
        last_activity_at: new Date().toISOString(),
      });
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
    const { resolveRepoCloneTarget } = await import("./repo-access");
    const target = await resolveRepoCloneTarget(run.project_id).catch(() => null);
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

  if (PR_TOOL_NAMES.has(name)) {
    return await runPrTool(run, name, args, body);
  }

  if (name === "web_search") {
    return await runWebSearch(run, args);
  }

  if (name === "create_pr") {
    return await runCreatePr(run, args, body);
  }

  return { status: 404, body: { error: `unknown platform tool: ${name}` } };
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
  const inline = { used: num(body.prInlineComments) ?? 0 };
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
    seq: WEB_SEARCH_SEQ_BASE + run.continuations * 100 + (num(args.seq) ?? 0),
    billTo: billToFor(run),
    projectId: run.project_id,
  });
  return ok(outcome);
}

/**
 * `create_pr`, MOITIÉ FORGE. La VM a déjà poussé (elle a le dépôt) ; ce qui reste
 * — PR mergée, PR déjà vivante, PR refusée à rouvrir, création — vit ici, dans
 * l'implémentation partagée avec l'ancienne forme.
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

  const outcome = await openPullRequestAfterPush(
    {
      run,
      target,
      forge: forgeFor(target.provider),
      issue: identifier ? { identifier } : null,
      workBranch: run.branch_name ?? "",
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
        if (!p.pushed || run.branch_name) return;
        await stampRun(run.id, { branch_name: run.branch_name ?? "" }).catch(() => null);
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
