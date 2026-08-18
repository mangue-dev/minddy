import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getMfaStatus, issueRecoveryCodes } from "@/lib/server/mfa";

/**
 * Regenerates all ten recovery codes (MIN-132). The previous ones — consumed
 * or not — immediately cease to be valid: it is the gesture we make when we
 * doesn't know where the leaf is anymore, so half replacing it wouldn't make sense.
 *
 * Nothing to write to require `aal2`: the safeguard of `getAuthedUser` already refuses
 * any `aal1` session on a protected account.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const status = await getMfaStatus(auth.user.id);
    if (!status.enabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }
    return NextResponse.json({ recoveryCodes: await issueRecoveryCodes(auth.user.id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
