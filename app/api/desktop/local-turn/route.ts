import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthedUser } from "@/lib/server/api-auth";
import { admitLocalRun, issueLocalExecToken } from "@/lib/server/agent/local-exec";
import { rowMayRunLocally } from "@/lib/server/agent/local-exec-scope";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import {
  appendEvent,
  claimRun,
  declineQueuedLocalRun,
  findQueuedLocalRunForMachine,
  getRun,
} from "@/lib/server/agent/runs";
import { executeAgentRun } from "@/lib/server/agent/execute";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { getServiceClient } from "@/lib/supabase-service";
import type { VmJob } from "@/lib/server/agent/vm/protocol";

type LocalProjectCatalogRow = {
  id: string;
  name: string;
  key: string;
  repoFullName: string | null;
};

/**
 * Le serveur connaît les projets accessibles, la machine connaît les chemins.
 * Cette moitié sans chemin est jointe dans le lanceur avant que le job local ne
 * soit écrit ; l'agent peut alors retrouver un projet cité par son nom et n'a
 * plus à demander où il est sur le poste.
 */
async function localProjectCatalog(
  supabase: SupabaseClient,
): Promise<LocalProjectCatalogRow[]> {
  try {
    const [{ data: projects, error: projectsError }, { data: links, error: linksError }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id, name, key")
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase.from("project_git_links").select("project_id, repo_full_name"),
      ]);
    if (projectsError || linksError) {
      console.error(
        "[desktop-local-turn] project catalogue failed:",
        projectsError?.message ?? linksError?.message,
      );
      return [];
    }
    const repoByProject = new Map(
      (links ?? []).flatMap((link) =>
        typeof link.project_id === "string" && typeof link.repo_full_name === "string"
          ? [[link.project_id, link.repo_full_name] as const]
          : [],
      ),
    );
    return (projects ?? []).flatMap((project) =>
      typeof project.id === "string" && typeof project.name === "string" && typeof project.key === "string"
        ? [{
            id: project.id,
            name: project.name,
            key: project.key,
            repoFullName: repoByProject.get(project.id) ?? null,
          }]
        : [],
    );
  } catch (error) {
    console.error(
      "[desktop-local-turn] project catalogue failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * `POST /api/desktop/local-turn` — **LE DÉCLENCHEUR DE TOUR LOCAL (MIN-293).**
 *
 * ## Ce qu'il est, et ce qu'il n'est pas
 *
 * Depuis MIN-371, deux appels arrivent ici : le clone réclame le prochain run de
 * ses projets attachés, ou l'ancien déclencheur de développement désigne un id.
 * Dans les deux cas cette route prépare le tour que l'utilisateur a marqué
 * local et rend à sa machine ce qu'il faut pour le jouer.
 *
 * Le pull est aussi la présence : une machine qui ne réclame plus n'est plus là.
 * Aucun abonnement de page ni heartbeat n'est nécessaire, et le navigateur qui
 * contrôle la conversation peut se trouver sur un autre appareil.
 *
 * ## Les cinq portes, dans cet ordre
 *
 * 1. **une session**, puis une sélection limitée aux projets attachés annoncés
 *    par le clone et aux runs créés par ce même utilisateur ;
 * 2. **le droit de lire ce run** — la sélection passe par la RLS et la garde est
 *    répétée avant tout claim ;
 * 3. **la nature du run** — `rowMayRunLocally` : un run d'ancrage `pr`, de
 *    webhook, de routine, de chaîne ou du board public de feedback **ne part
 *    jamais sur une machine**, parce que son contexte est du texte d'attaquant
 *    potentiel et qu'en local une injection de prompt est un shell sur le poste
 *    de quelqu'un ([local-exec-scope.ts](../../../../lib/server/agent/local-exec-scope.ts)) ;
 * 4. **l'admission** — `admitLocalRun` : un BYOK interactif passe directement ;
 *    une clé plateforme exige le mint fournisseur ;
 * 5. **le claim** — `queued → running`, atomique, une seule machine gagne.
 *
 * ## Pourquoi le bail est monté EN DERNIER
 *
 * Émettre, c'est révoquer : `issueLocalExecToken` incrémente `local_exec_gen`
 * avant de signer, donc tout jeton émis auparavant pour ce run meurt à cette
 * seconde. Le monter avant la préparation reviendrait à tuer un tour en cours
 * pour découvrir ensuite qu'on ne peut pas en préparer un nouveau.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** La préparation d'un tour fait un appel de forge et lit le journal d'opencode.
 *  Le même ordre de grandeur qu'un lancement, sans le réveil de microVM. */
export const maxDuration = 120;

const DEVICE_ID = /^[0-9a-f]{32}$/;
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CLAIM_PROJECTS = 50;

type LocalTurnRequest = {
  runId?: unknown;
  deviceId?: unknown;
  projectIds?: unknown;
};

/** Le pull n'accepte qu'une liste courte d'UUID uniques, jamais des chemins. */
function claimProjects(body: LocalTurnRequest | null): string[] | null {
  if (!DEVICE_ID.test(typeof body?.deviceId === "string" ? body.deviceId : "")) return null;
  if (!Array.isArray(body?.projectIds) || body.projectIds.length > MAX_CLAIM_PROJECTS) return null;
  if (body.projectIds.some((id) => typeof id !== "string" || !PROJECT_ID.test(id))) return null;
  return [...new Set(body.projectIds as string[])];
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const mark = (name: string) => {
    timings[name] = Date.now() - startedAt;
  };
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as LocalTurnRequest | null;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  const claimProjectIds = runId ? null : claimProjects(body);
  if (!runId && !claimProjectIds) {
    return NextResponse.json({ error: "runId or valid machine claim required" }, { status: 400 });
  }

  const run = runId
    ? await getRun(runId)
    : await findQueuedLocalRunForMachine({
        userId: auth.user.id,
        projectIds: claimProjectIds!,
        client: auth.supabase,
      });
  if (!run && !runId) {
    return NextResponse.json({ status: "idle" }, { headers: { "cache-control": "no-store" } });
  }
  // Un run illisible et un run inexistant rendent la MÊME chose : un identifiant
  // de run ne doit pas servir à apprendre qu'il existe.
  if (!run || !(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const selectedRunId = run.id;
  mark("run-and-access");

  if (!run.local_exec) {
    return NextResponse.json({ error: "this run does not execute locally" }, { status: 409 });
  }
  const scope = rowMayRunLocally(run);
  if (!scope.ok) {
    // Ne devrait pas arriver — `createRun` applique déjà la règle — mais c'est le
    // second rideau à l'endroit qui compte : sans affectation, aucune machine ne
    // peut jouer ce run.
    console.error(`[desktop-local-turn] ${selectedRunId} : contexte tiers (${scope.reason})`);
    return NextResponse.json({ error: `third-party context: ${scope.reason}` }, { status: 409 });
  }
  /**
   * L'ADMISSION lit le mode FIGÉ SUR LE RUN. `launchAgentRun` l'a résolu avant
   * `createRun` et les chunks suivants doivent précisément garder ce choix :
   * refaire ici toute la résolution du provider ajoutait un aller-retour avant
   * le claim sans produire une vérité plus fraîche.
   */
  const admission = admitLocalRun({ keyMode: run.key_mode });
  if (!admission.ok) {
    /**
     * Pas de clé plafonnée à faire descendre sur la machine : le run reste
     * parfaitement exécutable dans une microVM, où le firewall porte la clé.
     * La transition garde `queued + local_exec` pour ne jamais convertir sous
     * les pieds d'une autre coquille qui aurait gagné le claim entre-temps.
     */
    const cloudRun = await declineQueuedLocalRun(run.id);
    if (!cloudRun) {
      return NextResponse.json({ error: "run is not queued" }, { status: 409 });
    }
    await appendEvent(run.id, "status", {
      status: "queued",
      phase: "local_exec_declined",
      reason: admission.reason,
    });
    kickAgentDrain(getServiceClient());
    return NextResponse.json(
      { status: "idle", declinedRunId: run.id, reason: admission.reason },
      { headers: { "cache-control": "no-store" } },
    );
  }

  /**
   * LE CLAIM. `queued → running`, atomique en base : deux machines qui
   * réclameraient le même run se départagent ici, pas plus loin.
   *
   * Un run déjà `running` n'est pas claimable, et c'est le bon défaut — un tour
   * tourne peut-être déjà quelque part, et lui en superposer un second ferait
   * écrire le même checkpoint par deux harness.
   */
  const claimed = await claimRun(run.id);
  if (!claimed) {
    return NextResponse.json({ error: "run is not queued" }, { status: 409 });
  }
  mark("claimed");
  // Aucun catalogue sur les pulls `idle` : ce serait deux lectures de base
  // toutes les deux secondes pour ne rien rendre. Une fois le claim gagné, la
  // RLS applique le périmètre de l'interface et la lecture recouvre la
  // préparation du tour.
  const projectsPromise = localProjectCatalog(auth.supabase);

  // Un objet et non un `let` : `tsc` ne suit pas une affectation faite depuis un
  // rappel, et réduirait la variable à `null` juste après.
  const prepared: {
    job: Omit<VmJob, "layout" | "bootstrapMs"> | null;
    repoFullName: string | null;
  } = { job: null, repoFullName: null };
  const outcome = await executeAgentRun(claimed, {
    // Pas de deadline utile : la fonction ne fait plus tourner de boucle depuis
    // MIN-225, et la branche locale ne réveille aucune microVM.
    deadlineMs: 120_000,
    onLocalAssignment: (job, meta) => {
      prepared.job = job;
      prepared.repoFullName = meta.repoFullName;
    },
  });
  mark("prepared");

  if (!prepared.job) {
    // `executeAgentRun` a déjà mis le run au repos et raconté l'échec au fil : on
    // ne le double pas d'un message inventé ici.
    return NextResponse.json({ error: `turn not prepared (${outcome})` }, { status: 409 });
  }

  // Cette identité doit exister avant d'émettre le bail : émettre un jeton
  // incrémente sa génération et révoque le précédent. Ne faisons pas cette
  // écriture irréversible pour une affectation incomplète.
  if (!prepared.repoFullName) {
    return NextResponse.json({ error: "prepared turn has no repository identity" }, { status: 409 });
  }

  const lease = await issueLocalExecToken(run.id);
  if (!lease.ok) {
    console.error(`[desktop-local-turn] ${selectedRunId} : bail refusé (${lease.error})`);
    return NextResponse.json({ error: `lease refused: ${lease.error}` }, { status: 503 });
  }
  mark("leased");
  const projects = await projectsPromise;

  /**
   * Le `owner/repo` du projet part avec l'affectation : c'est contre lui que la
   * machine revalide le dossier attaché, **au moment du tour**. L'attachement a pu
   * être fait il y a un mois, et un chemin retenu ne prouve rien.
   */
  // `executeAgentRun` vient de résoudre cette même cible pour construire le job.
  // La faire refrapper la forge ici créait un second token uniquement pour relire
  // le `owner/repo`. Le callback rend maintenant cette donnée non secrète avec le job.
  return NextResponse.json(
    {
      runId: run.id,
      projectId: run.project_id,
      repoFullName: prepared.repoFullName,
      localWorktree: run.local_worktree === true,
      projects,
      diagnostics: { ...timings, total: Date.now() - startedAt },
      // Le bail voyage DANS le job (`controlToken`), et pas à côté : un job local
      // est, par définition, un job qui porte un jeton (`isLocalJob`). Une seconde
      // vérité sur le même fait finirait par diverger.
      job: { ...prepared.job, controlToken: lease.token },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
