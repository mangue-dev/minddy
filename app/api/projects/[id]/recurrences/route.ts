import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/recurrences — les récurrences actives du projet
 * (MIN-136), pour l'onglet « Récurrences » de ses paramètres.
 *
 * Un seul ticket vivant par série porte une cadence : la liste des tickets où
 * `recurrence is not null` EST la liste des récurrences. Rien à filtrer sur le
 * statut — un ticket terminé a passé sa cadence à son successeur, un ticket
 * annulé l'a perdue (lib/server/update-issue.ts), et la corbeille est déjà
 * exclue par la policy `issues_select`.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issues")
    .select("id, number, title, status, assignee_id, due_date, recurrence")
    .eq("project_id", id)
    .not("recurrence", "is", null)
    // La prochaine échéance d'abord : c'est l'ordre dans lequel on les lit.
    .order("due_date", { ascending: true });

  if (error) {
    console.error("[api/recurrences] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
