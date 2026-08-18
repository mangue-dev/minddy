import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { buildAccountExport } from "@/lib/server/account-export";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Right of access and portability (MIN-119, GDPR art. 15 and 20) — only one
 * JSON file, downloaded on demand.
 *
 * No queue or email with a link: on this scale an account
 * fits in memory, and an asynchronous chain would only add storage
 * temporary one more to monitor — that is to say personal data
 * additional, for a right whose aim is to keep less.
 *
 * What the file contains is described in `lib/server/account-export.ts`;
 * he carries NO secrets.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // An export is a broad reading: a few per hour are enough, and the
  // limit prevents a client-side loop from hammering the base.
  const limit = checkSessionRateLimit(auth.user.id, "account-export", {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many export requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let payload: Awaited<ReturnType<typeof buildAccountExport>>;
  try {
    payload = await buildAccountExport(auth.user.id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  captureServerEvent({
    distinctId: auth.user.id,
    event: "account_data_exported",
    properties: { owned_projects: payload.owned_projects.length },
  });

  const day = payload.exported_at.slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="minddy-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
