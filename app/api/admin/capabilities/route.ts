import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { capabilities } from "@/lib/server/capabilities";

/**
 * Diagnostic opérateur sans secret : classification, état, noms des variables
 * manquantes et conduite à tenir. Le endpoint n'importe ni ne sonde aucun SDK.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ capabilities: capabilities() });
}
