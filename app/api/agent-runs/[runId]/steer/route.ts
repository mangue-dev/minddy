import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  activeRunForIssue,
  getRun,
  insertRunMessage,
  newerRunExistsForIssue,
  stampRun,
  bumpRunActivity,
  type AgentRunStatus,
} from "@/lib/server/agent/runs";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { syncIssueStatusOnAgentStart } from "@/lib/server/agent/issue-status-sync";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Reprise à CHAUD d'un run d'agent (MIN-46 + MIN-68) : l'utilisateur envoie un
 * message DEPUIS la conversation du run — c'est le geste NORMAL du modèle
 * conversationnel (la session vit tant qu'on lui parle). C'est le seul chemin qui
 * reprend un run existant dans son contexte (checkpoint + sandbox) — les points
 * d'entrée de LANCEMENT (sidebar, carte, « demander des changements ») créent une
 * run FROIDE. Le message rejoint la file `agent_run_messages` ; la boucle le draine
 * à la frontière de round et l'injecte comme message `user`. Cas :
 *   • running / queued     → orientation à chaud (drainé au round suivant) ;
 *   • completed / canceled → nouveau tour : on repasse le run `queued`, budget de
 *                            tour réinitialisé, et on kicke le drain.
 * Seule la DERNIÈRE run de l'issue est reprennable — les précédentes sont un
 * historique (voir le refus `supersededRun` plus bas).
 * Membre du projet requis. Un seul écrivain d'events = le claimer.
 */

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

  let payload: { message?: string };
  try {
    payload = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = (typeof payload.message === "string" ? payload.message : "").trim().slice(0, MAX_LEN);
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!RESUMABLE.includes(run.status)) {
    return NextResponse.json({ error: "Run is not resumable" }, { status: 409 });
  }

  // Réveiller un run AU REPOS le remet en file. Deux refus (MIN-68) :
  //
  //  • une run PLUS RÉCENTE existe sur l'issue. Les runs d'une issue partagent la
  //    branche : la plus récente l'a fait avancer, alors que la sandbox de ce run
  //    est restée à SON état. Le reprendre commiterait par-dessus un ancêtre et le
  //    push serait rejeté (non-fast-forward) — le tour échouerait en boucle.
  //    Une run passée est un HISTORIQUE : on la
  //    consulte, on ne la réveille pas ; pour continuer, on en lance une nouvelle
  //    (qui, elle, clone la branche à jour).
  //  • une AUTRE run est active (course : elle vient d'être créée).
  //
  // Un run qui travaille déjà (queued/running) n'est pas concerné : il EST le plus
  // récent, son message rejoint simplement la file.
  // Sa PR est FUSIONNÉE → ce run est LIVRÉ, on ne le réveille pas (MIN-68). Sa
  // branche est déjà dans la base : y remettre l'agent au travail rouvrirait un
  // cycle de PR sur du travail livré — concrètement le harnais pousserait de
  // nouveaux commits sur la branche mergée et ouvrirait une PR de plus, ce qui fait
  // régresser l'issue de `done` à `in_review`. La règle « merged → branche neuve »
  // ne vivait que dans `inheritablePrForIssue` (chemin FROID) ; la reprise à chaud,
  // qui garde sa propre branche, la contournait. Pour continuer : nouvelle run.
  if (run.pr_state === "merged") {
    return NextResponse.json({ error: "prMerged", code: "prMerged" }, { status: 409 });
  }

  let resumed = false;
  if (RESUME_FROM.includes(run.status)) {
    const [newer, active] = await Promise.all([
      newerRunExistsForIssue(run.issue_id, run.created_at),
      activeRunForIssue(run.issue_id),
    ]);
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

    // Requeue AVANT d'enregistrer le message : si la garde ne matche pas (course
    // perdue), on refuse au lieu d'accepter un message que personne ne drainerait.
    // Nouveau tour sur la même branche/PR (window de tour réinitialisée → le claim
    // ré-ancre le wall-clock).
    const stamped = await stampRun(
      runId,
      { status: "queued", not_before: new Date().toISOString(), window_started_at: null },
      { guard: RESUME_FROM },
    );
    if (!stamped) {
      return NextResponse.json(
        { error: "alreadyRunning", code: "alreadyRunning" },
        { status: 409 },
      );
    }
    resumed = true;

    // L'agent se remet au travail → le ticket repasse « en cours », SAUF si une PR
    // en revue (open/draft) gouverne déjà son statut — même règle qu'au lancement
    // d'une run froide (launch.ts). Une PR refusée (closed → issue `todo`) repasse
    // bien en cours ; `merged` est déjà refusé plus haut (409 prMerged).
    if (run.pr_state !== "open" && run.pr_state !== "draft") {
      await syncIssueStatusOnAgentStart({ issueId: run.issue_id, actorId: auth.user.id });
    }
  }

  await insertRunMessage(runId, auth.user.id, message);
  // Un message relance l'horloge d'inactivité (empêche le reaping imminent).
  await bumpRunActivity(runId);
  if (resumed) kickAgentDrain(getServiceClient());

  return NextResponse.json({ ok: true, status: run.status });
}
