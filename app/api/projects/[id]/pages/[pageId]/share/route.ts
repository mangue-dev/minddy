import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  deletePageShare,
  getPageShare,
  upsertPageShare,
} from "@/lib/server/view-shares";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * La PUBLICATION d'une page (MIN-283) — une cible de plus pour le partage
 * public de MIN-26, donc la même forme de route que `/api/views/[id]/share` :
 * GET l'état, PUT publier ou re-régler, DELETE dépublier.
 *
 * Le `projectId` de l'URL n'est pas relu ici : l'accès se contrôle sur le
 * projet de la PAGE (lib/server/view-shares.ts), qui est la seule vérité —
 * accepter un id de projet dans le chemin et s'y fier ouvrirait exactement le
 * trou que la vérification par la page ferme.
 */

// Borne du mot de passe, alignée sur la route de partage d'une vue (MIN-118) :
// scrypt hache ce qu'on lui donne, et un refus vaut mieux qu'une troncature
// silencieuse — un mot de passe tronqué ne déverrouillerait jamais rien.
const MAX_PASSWORD_LENGTH = 256;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await getPageShare(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ share: result.share });
}

/**
 * PUT — publier (ou re-régler) : { level, password?, include_children? }.
 *
 * Aucun réglage d'indexation : une page publiée porte `noindex`, toujours. Le
 * lien EST le secret (cf. la migration `page_shares_no_indexing`).
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
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
  const { level, password, include_children } = (body ?? {}) as {
    level?: unknown;
    password?: unknown;
    include_children?: unknown;
  };
  if (level !== "password" && level !== "public") {
    return NextResponse.json({ error: t("invalidShareLevel") }, { status: 400 });
  }
  if (typeof password === "string" && password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  if (include_children !== undefined && typeof include_children !== "boolean") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const result = await upsertPageShare({
    pageId,
    actorId: auth.user.id,
    level,
    password: typeof password === "string" ? password : undefined,
    includeChildren: include_children as boolean | undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ share: result.share });
}

/** DELETE — cesser de publier : le lien cesse de répondre immédiatement. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await deletePageShare(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
