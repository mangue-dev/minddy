import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { listFeedbackForIssue } from "@/lib/server/feedback/team-queries";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/issues/[id]/feedback — les retours du board que ce ticket met en
 * œuvre (MIN-196), pour la section « Relations » du panneau latéral.
 *
 * Une route à part plutôt qu'un champ de la liste des retours du projet : le
 * panneau s'ouvre sur UN ticket et n'a besoin que de ses zéro à trois lignes,
 * là où `/api/projects/[id]/feedback` en charge jusqu'à cinq cents, corps
 * compris. Ce qui est bon marché pour la page des retours ne l'est pas pour un
 * panneau qu'on ouvre et ferme vingt fois.
 *
 * En LECTURE SEULE, et c'est délibéré : le lien se défait depuis le retour,
 * jamais depuis le ticket. Un ticket ignore combien de demandes il porte, et
 * les détacher d'ici retirerait à quelqu'un le suivi de la sienne sans que
 * l'écran qui le montre soit sous les yeux.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // Le ticket résout le projet ; l'accès se vérifie dessus. `feedback_posts`
  // étant RLS deny-all, la lecture qui suit passe par le service client — sans
  // ce contrôle explicite, elle n'aurait aucune garde.
  const service = getServiceClient();
  const { data: issue } = await service
    .from("issues")
    .select("id, project_id")
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();
  if (!issue) {
    return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  }
  const access = await getProjectAccess(auth.user.id, issue.project_id as string);
  if (!access) {
    // Invisible plutôt qu'interdit : la même réponse que celle d'un ticket qui
    // n'existe pas, pour ne pas confirmer l'existence de celui-là.
    return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  }

  return NextResponse.json({
    feedback: await listFeedbackForIssue(issue.project_id as string, issue.id as string),
  });
}
