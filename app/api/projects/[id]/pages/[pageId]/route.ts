import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getPage, trashPage, updatePage } from "@/lib/server/pages";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/** GET — une page avec son corps (document ProseMirror). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await getPage(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page);
}

/**
 * PATCH — titre, icône, parent, position, corps.
 *
 * Un `parent_id` qui mettrait la page sous un de ses propres descendants répond
 * **409** et n'écrit RIEN : la profondeur est illimitée, donc la seule chose qui
 * empêche la sidebar de partir en récursion infinie est ce refus-là.
 *
 * Un corps envoyé avec une `version` PÉRIMÉE répond 409 lui aussi, et pour la
 * même raison de fond : ne jamais écrire par-dessus ce qu'on n'a pas lu. La
 * différence est dans la réponse — celle-ci porte `conflict: true` et la page
 * du serveur, corps compris, pour que le client fusionne par bloc
 * (`lib/pages-merge.ts`) sans un aller-retour de plus.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await updatePage({
    pageId,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    if (result.conflict) {
      return NextResponse.json(
        { error: t(result.errorKey), conflict: true, page: result.conflict },
        { status: result.status }
      );
    }
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page);
}

/**
 * DELETE — passage en corbeille, RÉCURSIF (la page et ses descendants).
 *
 * Rien n'est détruit : la ligne est marquée, sort des lectures pendant 30 jours,
 * et revient telle quelle par `POST .../restore` ou depuis la corbeille. C'est
 * ce qui rend acceptable que supprimer le bloc sous-page dans le corps du parent
 * (MIN-272) supprime la page — le geste est rattrapable.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await trashPage(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true, trashed: result.trashed });
}
