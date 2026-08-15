import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import {
  activeRunForIssue,
  activeRunForRoutine,
  getRun,
  insertRunMessage,
  newerRunExistsForIssue,
  stampRun,
  bumpRunActivity,
  type AgentRunStatus,
} from "@/lib/server/agent/runs";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { checkAgentQuota } from "@/lib/server/agent/quota";
import { syncIssueStatusOnAgentStart } from "@/lib/server/agent/issue-status-sync";
import { getServiceClient } from "@/lib/supabase-service";
import { parseAgentMentions } from "@/lib/agent-mentions";
import { parseResourcesInput } from "@/lib/server/attachments";
import { promptWithAttachments } from "@/lib/server/agent/prompt-attachments";
import type { AttachmentInput } from "@/lib/types";

/**
 * Reprise à CHAUD d'un run d'agent (MIN-46 + MIN-68) : l'utilisateur envoie un
 * message DEPUIS la conversation du run — c'est le geste NORMAL du modèle
 * conversationnel (la session vit tant qu'on lui parle). C'est le seul chemin qui
 * reprend un run existant dans son contexte (checkpoint + sandbox) — les points
 * d'entrée de LANCEMENT (sidebar, carte, « demander des changements ») créent une
 * run FROIDE. Le message rejoint la file `agent_run_messages` ; la boucle le draine
 * à la frontière de round et l'injecte comme message `user`. Cas :
 *   • running / queued     → orientation à chaud (drainé au round suivant) ;
 *   • completed / canceled → nouveau tour : quota re-vérifié sur l'APPELANT et sur
 *                            le propriétaire (chaque reprise est un tour FACTURÉ —
 *                            sans ce check, une session existante contournerait le
 *                            plafond mensuel pour toujours), puis
 *                            run re-`queued`, budget réinitialisé, drain kické.
 * Seule la DERNIÈRE run de l'issue est reprennable — les précédentes sont un
 * historique (voir le refus `supersededRun` plus bas).
 * Réservé à qui peut lire le run (MIN-332) — on ne parle pas à la conversation
 * d'un autre. Un seul écrivain d'events = le claimer.
 */

// Le kick de reprise draine le premier chunk dans after() : il lui faut la même
// fenêtre que la route cron (270 s de budget), sinon la fonction est tuée en plein
// round et le run reste bloqué en 'running' — et deux kills successifs épuisent
// MAX_CRASH_ATTEMPTS, qui efface le checkpoint (conversation morte). Même raison
// que le maxDuration = 300 de /api/issues/[id]/agent.
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ runId: string }> };

/** Reprennable = tout sauf `failed` (erreur d'amorçage repo/modèle). */
const RESUMABLE: AgentRunStatus[] = ["queued", "running", "completed", "canceled"];
/** Statuts au repos/terminés qui exigent une relance (re-queue + kick). */
const RESUME_FROM: AgentRunStatus[] = ["completed", "canceled"];
const MAX_LEN = 4000;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let payload: { message?: string; mentions?: unknown; attachments?: unknown };
  try {
    payload = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // `?.` : un corps JSON `null` est valide côté parseur mais n'a pas de champs.
  const message = (typeof payload?.message === "string" ? payload.message : "").trim().slice(0, MAX_LEN);
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const resources = parseResourcesInput(payload?.attachments, `chat/${auth.user.id}/`, 5);
  if (resources === null) {
    return NextResponse.json({ error: "Invalid attachments" }, { status: 400 });
  }
  const attachments = resources.filter((resource): resource is AttachmentInput => resource.kind !== "link");
  const messageWithFiles = await promptWithAttachments(message, attachments);

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (!RESUMABLE.includes(run.status)) {
    return NextResponse.json({ error: "Run is not resumable" }, { status: 409 });
  }

  /**
   * LE DROIT « AGENTS » SE VÉRIFIE SUR L'APPELANT (MIN-344), et à chaque message
   * — pas seulement sur les reprises.
   *
   * Parler à un agent, c'est le faire travailler : un message allonge le tour en
   * cours comme il en rouvre un terminé. Vérifié sur le seul PROPRIÉTAIRE du
   * run, le droit se contournait en s'adressant à la conversation d'un autre —
   * et `canReadAgentRun` ouvre à toute l'équipe les trois runs « du projet »
   * (routine, chaîne, relecture de PR). Un membre dont le plan n'inclut pas les
   * agents y avait donc un agent, payé par le compte d'à côté.
   *
   * Ici on ne regarde que le PLAN de l'appelant, pas son budget : le tour dépense
   * la clé du propriétaire, et c'est son plafond à lui qui décide de la suite
   * (contrôlé sur le chemin de reprise, plus bas).
   */
  const callerQuota = await checkAgentQuota(auth.user.id);
  if (callerQuota.reason === "agents_not_in_plan") {
    return NextResponse.json(
      { error: "quotaExceeded", code: "quotaExceeded", quota: callerQuota },
      { status: 402 },
    );
  }

  // Sa PR est FUSIONNÉE → ce run est LIVRÉ, on ne le réveille pas (MIN-68). Sa
  // branche est déjà dans la base : y remettre l'agent au travail pousserait de
  // nouveaux commits sur du travail livré. Pour continuer : nouvelle run (qui
  // repartira d'une branche neuve — `inheritableWorkForIssue` n'hérite jamais
  // d'une lignée mergée).
  if (run.pr_state === "merged") {
    return NextResponse.json({ error: "prMerged", code: "prMerged" }, { status: 409 });
  }

  let resumed = false;
  if (RESUME_FROM.includes(run.status)) {
    // Les notions de « run dépassée » et « une run occupe déjà le ticket » sont
    // des règles du TICKET (les runs d'une issue partagent la branche). Un run
    // CARNET (MIN-84, issue_id null) est une conversation autonome sur sa propre
    // branche : toujours reprennable, jamais supplanté.
    if (run.issue_id) {
      const [newer, active] = await Promise.all([
        newerRunExistsForIssue(run.issue_id, run.created_at),
        activeRunForIssue(run.issue_id),
      ]);
      // Une run PLUS RÉCENTE (non `failed`) existe : les runs d'une issue partagent
      // la branche, la plus récente l'a fait avancer — reprendre celle-ci pousserait
      // par-dessus un ancêtre (push rejeté). Une run passée est un HISTORIQUE : on
      // la consulte, on ne la réveille pas.
      if (newer) {
        return NextResponse.json(
          { error: "supersededRun", code: "supersededRun" },
          { status: 409 },
        );
      }
      if (active && active.id !== runId) {
        return NextResponse.json(
          { error: "alreadyRunning", code: "alreadyRunning" },
          { status: 409 },
        );
      }
    } else if (run.routine_id) {
      // Un passage de ROUTINE (MIN-185) se reprend comme une conversation
      // carnet — sauf qu'une routine, elle, n'a droit qu'à UN passage actif à
      // la fois (`idx_agent_runs_active_routine`). Sans cette garde, répondre à
      // un vieux passage pendant que l'échéance du jour travaille ferait
      // remonter une violation d'unicité en 500, là où le refus est connu.
      const active = await activeRunForRoutine(run.routine_id);
      if (active && active.id !== runId) {
        return NextResponse.json(
          { error: "alreadyRunning", code: "alreadyRunning" },
          { status: 409 },
        );
      }
    }

    /**
     * Une reprise démarre un TOUR facturé — même contrôle qu'au lancement (BYOK
     * = tokens illimités ; clé plateforme = plafond mensuel). Deux budgets à
     * regarder, et il en manquait un (MIN-344) :
     *
     *  • celui de l'APPELANT, qui déclenche la dépense (son droit « agents » est
     *    déjà tombé plus haut ; ici c'est son plafond) ;
     *  • celui du PROPRIÉTAIRE, dont la clé exécute le tour — le ledger impute au
     *    `created_by` du run, délibérément (cf. `billToFor` dans
     *    control-plane.ts : la microVM ne choisit pas qui paye).
     *
     * L'imputation, elle, ne bouge pas : elle suit la clé qui exécute. La
     * déplacer vers l'appelant demanderait de changer de clé en cours de
     * conversation, alors que le reste du tour continue sur le checkpoint et la
     * sandbox du propriétaire.
     */
    const ownerId = run.created_by ?? auth.user.id;
    const ownerQuota =
      ownerId === auth.user.id ? null : await checkAgentQuota(ownerId);
    const quota = !callerQuota.allowed ? callerQuota : (ownerQuota ?? callerQuota);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "quotaExceeded", code: "quotaExceeded", quota },
        { status: 402 },
      );
    }

    // Requeue AVANT d'enregistrer le message : si la garde ne matche pas (course
    // perdue), on décide en connaissance de cause au lieu d'accepter un message
    // que personne ne drainerait. Nouveau tour sur la même branche/PR.
    const stamped = await stampRun(
      runId,
      { status: "queued", not_before: new Date().toISOString() },
      { guard: RESUME_FROM },
    );
    if (!stamped) {
      // Course : le run n'est plus au repos. Si c'est LUI qui est (re)devenu actif
      // (double-envoi rapide, autre onglet qui vient de le réveiller), le message
      // est légitime — il rejoint le tour qui démarre, comme pour un run qui
      // travaille. On ne refuse que si c'est une AUTRE run qui a pris l'issue.
      const now = await getRun(runId);
      if (!now || !["queued", "running"].includes(now.status)) {
        return NextResponse.json(
          { error: "alreadyRunning", code: "alreadyRunning" },
          { status: 409 },
        );
      }
    } else {
      resumed = true;

      // L'agent se remet au travail → le ticket repasse « en cours », SAUF si une
      // PR en revue (open/draft) gouverne déjà son statut — même règle qu'au
      // lancement d'une run froide (launch.ts). Une PR refusée (closed → issue
      // `todo`) repasse bien en cours ; `merged` est déjà refusé plus haut.
      // Run carnet : aucun ticket à synchroniser.
      if (run.issue_id && run.pr_state !== "open" && run.pr_state !== "draft") {
        await syncIssueStatusOnAgentStart({ issueId: run.issue_id, actorId: auth.user.id });
      }
    }
  }

  await insertRunMessage(runId, auth.user.id, messageWithFiles, parseAgentMentions(payload?.mentions));
  // Un message relance l'horloge d'inactivité (empêche le reaping imminent).
  await bumpRunActivity(runId);

  // Course fin-de-tour : le message a été accepté pour un run qui TRAVAILLAIT,
  // mais l'exécuteur a pu passer au repos entre son dernier `hasPendingRunMessages`
  // et son stamp final — le message resterait alors orphelin (personne ne draine un
  // run au repos). On re-lit : si le run vient de se poser, on le re-queue nous-
  // mêmes (la garde évite le double-réveil si un autre client l'a déjà fait).
  if (!resumed) {
    const now = await getRun(runId);
    if (now && RESUME_FROM.includes(now.status)) {
      const stamped = await stampRun(
        runId,
        { status: "queued", not_before: new Date().toISOString() },
        { guard: RESUME_FROM },
      );
      if (stamped) resumed = true;
    }
  }

  if (resumed) kickAgentDrain(getServiceClient());

  return NextResponse.json({ ok: true, status: run.status });
}
