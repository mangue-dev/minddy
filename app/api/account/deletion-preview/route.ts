import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { previewAccountDeletion } from "@/lib/server/account-deletion";

/**
 * What account deletion will destroy (MIN-119) — read by the screen of
 * confirmation before anything goes.
 *
 * The number that counts is that of projects owned: their deletion
 * takes away tickets and access from other members. A confirmation that
 * Don't say that's not informed consent.
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
