import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import type { ProjectTriageCount, TriageCountsResponse } from "@/lib/types";

/**
 * GET /api/me/triage-counts — ce qui attend d'être trié dans chacun de mes
 * projets : tickets en statut triage, et retours encore ouverts ou prévus.
 *
 * Une route à part, sur le modèle de /api/me/smart-assign-warnings : la sidebar
 * porte ces chiffres sur TOUTES les pages hors projet, alors que
 * /api/me/summary — qui réconcilie la timeline des cycles avant de lire —
 * est bien trop cher pour être monté partout. Ici, deux `select` d'UNE colonne,
 * sur les seules lignes qui attendent quelque chose.
 *
 * Les deux moitiés sont comptées EXACTEMENT comme les deux onglets du mode
 * projet — le compteur de triage de la sidebar et GET …/feedback/counts — pour
 * que le chiffre d'une ligne de projet soit la somme des deux badges qu'on lira
 * en entrant dedans. Un écart, ici, se verrait immédiatement.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Les tickets passent par le client de l'utilisateur : RLS
  // (`can_access_project`) borne la lecture à mes projets. Les tables
  // `feedback_*` sont RLS deny-all (cf. supabase/migrations/…_feedback.sql),
  // d'où une lecture service-role bornée, elle, aux ids lus juste avant — sous
  // RLS, donc.
  //
  // Cette liste sert AUSSI de périmètre : elle exclut les projets à la corbeille,
  // et le compte doit l'exclure avec elle (voir la jointure plus bas).
  const { data: projectRows, error: projectsError } = await auth.supabase
    .from("projects")
    .select("id")
    .is("deleted_at", null);
  if (projectsError) {
    console.error("[api/me/triage-counts] projects load failed:", projectsError.message);
    return NextResponse.json({ counts: {} } satisfies TriageCountsResponse);
  }
  const projectIds = ((projectRows ?? []) as { id: string }[]).map((p) => p.id);
  if (projectIds.length === 0) {
    return NextResponse.json({ counts: {} } satisfies TriageCountsResponse);
  }

  const [triageRes, feedbackRes] = await Promise.all([
    // `projects!inner(deleted_at)` n'est pas une colonne lue, c'est le FILTRE de
    // la corbeille : jeter un projet ne touche pas ses tickets (ils reviennent
    // avec lui), et `can_access_project` ne regarde pas `deleted_at` — ceux d'un
    // projet jeté continuent donc de passer RLS. Sans ce filtre, ils tombaient
    // dans `counts` sous l'id d'un projet que la sidebar ne liste plus : aucune
    // ligne ne les portait, mais le badge « Accueil » — qui SOMME la table — les
    // comptait. Un « +1 » qu'on ne pouvait trouver nulle part, jusqu'à ce que
    // vider la corbeille le fasse disparaître. Même jointure que le tableau de
    // bord (app/api/me/summary/route.ts) et la réconciliation des cycles.
    auth.supabase
      .from("issues")
      .select("project_id, projects!inner(deleted_at)")
      .eq("status", "triage")
      .is("deleted_at", null)
      .is("projects.deleted_at", null),
    getServiceClient()
      .from("feedback_posts")
      .select("project_id")
      .is("deleted_at", null)
      .in("project_id", projectIds)
      .is("merged_into_id", null)
      .in("status", ["open", "planned"]),
  ]);

  // Une panne de lecture n'est pas une erreur 500 : ces chiffres décorent une
  // barre latérale montée sur toutes les pages, et un 500 par navigation ferait
  // plus de bruit que le badge ne rend de service. On journalise, et la moitié
  // qui a répondu s'affiche seule.
  if (triageRes.error) {
    console.error("[api/me/triage-counts] triage load failed:", triageRes.error.message);
  }
  if (feedbackRes.error) {
    console.error("[api/me/triage-counts] feedback load failed:", feedbackRes.error.message);
  }

  const counts: Record<string, ProjectTriageCount> = {};
  const bump = (projectId: string, half: keyof ProjectTriageCount) => {
    const entry = (counts[projectId] ??= { triage: 0, feedback: 0 });
    entry[half] += 1;
  };
  for (const row of (triageRes.data ?? []) as { project_id: string }[]) {
    bump(row.project_id, "triage");
  }
  for (const row of (feedbackRes.data ?? []) as { project_id: string }[]) {
    bump(row.project_id, "feedback");
  }

  return NextResponse.json({ counts } satisfies TriageCountsResponse);
}
