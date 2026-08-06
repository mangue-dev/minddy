import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { eraseFeedbackUser } from "@/lib/server/feedback/erasure";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Les personnes déjà connues du projet, pour le sélecteur d'auteur de la saisie
 * interne — et leur effacement sur demande (DELETE, RGPD art. 17).
 *
 * Saisir un retour au nom de quelqu'un demandait de retaper son email de tête,
 * à la lettre près : une faute et c'est une SECONDE identité qui naît, avec son
 * propre pseudonyme et sa propre voix. Ceux qui ont déjà écrit ou voté sont
 * donc proposés, et la saisie libre reste ouverte pour les nouveaux.
 *
 * Vraies identités (email, nom) : c'est la vue équipe, comme `team-queries`.
 */

const LIMIT = 20;

export interface TeamFeedbackUserOption {
  id: string;
  email: string | null;
  name: string | null;
  pseudonym: string;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const service = getServiceClient();
  let select = service
    .from("feedback_users")
    .select("id, email, name, pseudonym")
    .eq("project_id", id)
    // Une identité effacée n'a plus ni email ni nom : la proposer reviendrait à
    // offrir une ligne vide au sélecteur, et à laisser croire qu'on peut encore
    // écrire au nom de quelqu'un qui a demandé à disparaître.
    .is("erased_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (query) {
    // `%` et `,` sont des métacaractères de la syntaxe `or` de PostgREST : les
    // laisser passer laisserait une frappe changer la forme de la requête.
    const needle = query.replace(/[%,()]/g, " ");
    select = select.or(`email.ilike.%${needle}%,name.ilike.%${needle}%`);
  }

  const { data } = await select;
  return NextResponse.json({ users: (data ?? []) as TeamFeedbackUserOption[] });
}

/**
 * Effacement d'un participant, sur demande de l'intéressé (RGPD art. 17).
 *
 * Garde `requireProjectMember` comme toutes les routes d'équipe du feedback :
 * qui peut faire tourner le token public du board ou effacer son secret SSO peut
 * honorer une demande d'effacement. En faire la seule exception réservée au
 * propriétaire ferait dépendre un droit d'une hiérarchie interne.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const userId = request.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const result = await eraseFeedbackUser({ projectId: id, userId });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "notFound" ? 404 : 500 }
    );
  }
  return NextResponse.json({ report: result.report });
}
