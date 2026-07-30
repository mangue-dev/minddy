import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { previewAccountDeletion } from "@/lib/server/account-deletion";

/**
 * Ce que la suppression du compte détruira (MIN-119) — lu par l'écran de
 * confirmation avant que quoi que ce soit ne parte.
 *
 * Le chiffre qui compte est celui des projets possédés : leur suppression
 * emporte les tickets et l'accès des autres membres. Une confirmation qui ne
 * dit pas ça n'est pas un consentement éclairé.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await previewAccountDeletion(auth.user.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
