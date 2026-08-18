import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { deleteUserIdentity } from "@/lib/server/git/user-identities";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/account/git-identities/[id] — disconnects personal git account
 * (MIN-144). ONLY touches `git_user_identities`: the GitLab account is the
 * account's OAuth connection, and removing it would unbind the repositories of all
 * projects that use it — this is done in “Connected git accounts”, where
 * the warning is written.
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
