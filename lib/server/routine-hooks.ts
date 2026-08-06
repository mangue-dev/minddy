import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertNotifications } from "@/lib/server/notifications";

/**
 * Le crochet de FIN DE PASSAGE d'une routine (MIN-185).
 *
 * Module à part — et pas dans `lib/server/routines.ts` — pour que
 * `lib/server/agent/runs.ts` puisse l'appeler sans traîner derrière lui la
 * fabrique, son plafond de modèle et son quota. Même découpage que les crochets
 * d'automatisation (`lib/server/automations/hooks.ts`), et pour la même raison :
 * le point d'appel est au plus bas de la pile.
 *
 * **On ne notifie QUE quand il y a matière.** Une routine quotidienne qui
 * annonce « rien à signaler » chaque matin se fait couper au bout de trois
 * jours, et emporte dans sa chute les deux notifications qui comptaient. Donc :
 * une pull request ouverte (`agent_done`), ou un passage en échec
 * (`agent_failed`). Un passage qui conclut sans rien pousser ne dit rien — il se
 * lit dans « Exécutions précédentes », qui est fait pour ça.
 */
export async function notifyRoutineOfRunEnd(run: {
  id: string;
  routine_id: string | null;
  project_id: string;
  status: string;
  pr_number: number | null;
}): Promise<void> {
  if (!run.routine_id) return;
  const openedPr = run.pr_number != null;
  const failed = run.status === "failed";
  if (!openedPr && !failed) return;

  try {
    const service = getServiceClient();
    const { data } = await service
      .from("agent_routines")
      .select("id, owner_id")
      .eq("id", run.routine_id)
      .maybeSingle();
    const owner = (data as { owner_id?: string } | null)?.owner_id;
    if (!owner) return;

    await insertNotifications(
      service,
      [
        {
          user_id: owner,
          project_id: run.project_id,
          type: failed ? "agent_failed" : "agent_done",
          issue_id: null,
          // La cible est la ROUTINE : c'est là que ses exécutions se lisent, et
          // nulle part ailleurs. Sans ce champ, la ligne d'inbox ne mènerait
          // nulle part et serait écartée à l'affichage.
          routine_id: run.routine_id,
          actor_id: null,
        },
      ],
      // Une seule notification agent VIVANTE par routine : trois échecs
      // d'affilée font une ligne, pas trois — c'est le même problème.
      { replaceUnread: true },
    );
  } catch (err) {
    console.error("[routine-hooks] notify failed:", (err as Error).message);
  }
}

/**
 * Écrit sur la routine ce que son dernier passage a donné. Appelé depuis le même
 * passage obligé que la notification : `last_error` à `null` quand le run
 * aboutit — l'alerte de l'écran doit s'éteindre toute seule dès que la routine
 * repart —, au code `launchFailed` quand il échoue.
 */
export async function stampRoutineRunEnd(run: {
  routine_id: string | null;
  status: string;
}): Promise<void> {
  if (!run.routine_id) return;
  if (run.status !== "completed" && run.status !== "failed") return;
  try {
    const service = getServiceClient();
    const { error } = await service
      .from("agent_routines")
      .update({ last_error: run.status === "failed" ? "launchFailed" : null })
      .eq("id", run.routine_id);
    if (error) console.error("[routine-hooks] stamp failed:", error.message);
  } catch (err) {
    console.error("[routine-hooks] stamp threw:", (err as Error).message);
  }
}
