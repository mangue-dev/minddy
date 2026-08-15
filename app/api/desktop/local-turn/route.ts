import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { admitLocalRun, issueLocalExecToken } from "@/lib/server/agent/local-exec";
import { rowMayRunLocally } from "@/lib/server/agent/local-exec-scope";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { claimRun, getRun } from "@/lib/server/agent/runs";
import { executeAgentRun } from "@/lib/server/agent/execute";
import { resolveAgentApiKey } from "@/lib/server/agent/model";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import type { VmJob } from "@/lib/server/agent/vm/protocol";

/**
 * `POST /api/desktop/local-turn` — **LE DÉCLENCHEUR DE TOUR LOCAL (MIN-293).**
 *
 * ## Ce qu'il est, et ce qu'il n'est pas
 *
 * La présence d'une machine, le claim d'un run et l'aiguillage appartiennent à
 * **MIN-294**. Sans eux, aucun run n'atteint jamais un Mac — et un lot qu'on ne
 * peut vérifier qu'une fois le suivant fait ne se livre pas. Cette route est donc
 * le déclencheur assumé qui manque : elle FORCE la préparation d'un tour que
 * l'utilisateur a lui-même marqué local, et rend à sa machine ce qu'il faut pour
 * le jouer.
 *
 * Elle n'est pas jetable pour autant. Ce qu'elle fait — admettre, claim, préparer,
 * monter le bail, rendre l'affectation — est **exactement** ce que la boucle de
 * réclamation de MIN-294 fera ; ce qui changera, c'est QUI l'appelle et QUAND :
 * une machine qui dit « j'ai du temps, as-tu du travail ? », au lieu d'un
 * identifiant de run passé à la main.
 *
 * ## Les quatre portes, dans cet ordre
 *
 * 1. **une session**, et quelqu'un qui a le droit de lire ce run ;
 * 2. **la nature du run** — `rowMayRunLocally` : un run d'ancrage `pr`, de
 *    webhook, de routine, de chaîne ou du board public de feedback **ne part
 *    jamais sur une machine**, parce que son contexte est du texte d'attaquant
 *    potentiel et qu'en local une injection de prompt est un shell sur le poste
 *    de quelqu'un ([local-exec-scope.ts](../../../../lib/server/agent/local-exec-scope.ts)) ;
 * 3. **l'admission** — `admitLocalRun` : pas de BYOK (aucun plafond possible),
 *    pas de mint de clé (la clé plateforme est non plafonnée) ;
 * 4. **le claim** — `queued → running`, atomique, une seule machine gagne.
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

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { runId?: unknown } | null;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  const run = await getRun(runId);
  // Un run illisible et un run inexistant rendent la MÊME chose : un identifiant
  // de run ne doit pas servir à apprendre qu'il existe.
  if (!run || !(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (!run.local_exec) {
    return NextResponse.json({ error: "this run does not execute locally" }, { status: 409 });
  }
  const scope = rowMayRunLocally(run);
  if (!scope.ok) {
    // Ne devrait pas arriver — `createRun` applique déjà la règle — mais c'est le
    // second rideau à l'endroit qui compte : sans affectation, aucune machine ne
    // peut jouer ce run.
    console.error(`[desktop-local-turn] ${runId} : contexte tiers (${scope.reason})`);
    return NextResponse.json({ error: `third-party context: ${scope.reason}` }, { status: 409 });
  }
  /**
   * L'ADMISSION, et elle relit le MODE DE CLÉ plutôt que de le supposer : le BYOK
   * est refusé en local parce que la clé est celle de l'utilisateur, sur SON
   * compte, et qu'OpenRouter n'émet de clé plafonnée que sur le compte qui
   * détient la clé de provisioning. Un run BYOK local n'a donc littéralement
   * aucun plafond — ni clé plafonnable, ni `budgetUsd`, ni compute de microVM.
   *
   * Une lecture de plus que `executeAgentRun`, assumée : elle doit avoir lieu
   * AVANT le claim, sinon on met un run en `running` pour le refuser ensuite.
   */
  const keyMode = await resolveAgentApiKey(run.created_by ?? "")
    .then((endpoint) => endpoint.mode)
    .catch(() => null);
  if (!keyMode) {
    return NextResponse.json({ error: "no model endpoint for this account" }, { status: 503 });
  }
  const admission = admitLocalRun({ keyMode });
  if (!admission.ok) {
    return NextResponse.json({ error: `refused: ${admission.reason}` }, { status: 409 });
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

  // Un objet et non un `let` : `tsc` ne suit pas une affectation faite depuis un
  // rappel, et réduirait la variable à `null` juste après.
  const prepared: { job: Omit<VmJob, "layout" | "bootstrapMs"> | null } = { job: null };
  const outcome = await executeAgentRun(claimed, {
    // Pas de deadline utile : la fonction ne fait plus tourner de boucle depuis
    // MIN-225, et la branche locale ne réveille aucune microVM.
    deadlineMs: 120_000,
    onLocalAssignment: (job) => {
      prepared.job = job;
    },
  });

  if (!prepared.job) {
    // `executeAgentRun` a déjà mis le run au repos et raconté l'échec au fil : on
    // ne le double pas d'un message inventé ici.
    return NextResponse.json({ error: `turn not prepared (${outcome})` }, { status: 409 });
  }

  const lease = await issueLocalExecToken(run.id);
  if (!lease.ok) {
    console.error(`[desktop-local-turn] ${runId} : bail refusé (${lease.error})`);
    return NextResponse.json({ error: `lease refused: ${lease.error}` }, { status: 503 });
  }

  /**
   * Le `owner/repo` du projet part avec l'affectation : c'est contre lui que la
   * machine revalide le dossier attaché, **au moment du tour**. L'attachement a pu
   * être fait il y a un mois, et un chemin retenu ne prouve rien.
   */
  const target = await resolveRepoCloneTarget(run.project_id).catch(() => null);
  if (!target) {
    return NextResponse.json({ error: "project has no linked repository" }, { status: 409 });
  }

  return NextResponse.json(
    {
      runId: run.id,
      projectId: run.project_id,
      repoFullName: target.repoFullName,
      // Le bail voyage DANS le job (`controlToken`), et pas à côté : un job local
      // est, par définition, un job qui porte un jeton (`isLocalJob`). Une seconde
      // vérité sur le même fait finirait par diverger.
      job: { ...prepared.job, controlToken: lease.token },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
