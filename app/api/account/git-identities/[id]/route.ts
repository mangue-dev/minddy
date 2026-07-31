import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { deleteUserIdentity } from "@/lib/server/git/user-identities";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/account/git-identities/[id] — déconnecte le compte git personnel
 * (MIN-144). Ne touche QUE `git_user_identities` : le compte GitLab, lui, est la
 * connexion OAuth du compte, et la supprimer délierait les dépôts de tous les
 * projets qui l'utilisent — ça se fait dans « Comptes git connectés », où
 * l'avertissement est écrit.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const ok = await deleteUserIdentity(auth.user.id, id);
  if (!ok) {
    return NextResponse.json({ error: t("gitConnectionNotFound") }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
