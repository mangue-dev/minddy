import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  claimAvatarSeed,
  fetchAvatarSeed,
  regenerateAvatarSeed,
} from "@/lib/server/avatar-seeds";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Mon avatar.
 *
 * GET — the seed of my brand, which the interface needs to draw it
 * (sidebar, mobile menu, settings). OTHERS’ brands
 * arrive with the members of the project, never around here.
 * POST — a new print. This is the only grip the user has on their
 * avatar: he doesn't choose it, he restarts it.
 * With a `{ seed }` in the body, it is the ADOPTION of the draw made
 * during registration (MIN-300): the wizard showed a mark before
 * that no account exists, and puts it here as soon as he has a session. She
 * never overwrites a mark already in place — see `claimAvatarSeed`.
 *
 * The table has no RLS policy, so everything goes through the service key, and
 * `getAuthedUser` guarantees that only YOUR account is touched: the identifier comes
 * of the verified JWT, never of the request body.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const seed = await fetchAvatarSeed(getServiceClient(), auth.user.id);
  return NextResponse.json({ seed });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { seed?: unknown } | null;
  const claimed = typeof body?.seed === "string" ? body.seed : null;

  try {
    const service = getServiceClient();
    if (claimed) {
      await claimAvatarSeed(service, auth.user.id, claimed);
      // We reread rather than return what we proposed: if the account had
      // already a brand, it is that which is valuable, and the interface must see it.
      return NextResponse.json({ seed: await fetchAvatarSeed(service, auth.user.id) });
    }
    const seed = await regenerateAvatarSeed(service, auth.user.id);
    return NextResponse.json({ seed });
  } catch (err) {
    console.error("[me/avatar] regenerate failed:", (err as Error).message);
    return NextResponse.json({ error: "Regenerate failed" }, { status: 500 });
  }
}
