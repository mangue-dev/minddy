import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { listOpenNumoWatches } from "@/lib/server/numo/watches";
import { watchSubjects } from "@/lib/server/numo/watch-clock";
import { confirmNumoWatchProposal } from "@/lib/server/numo/watch-proposal";

/** Account → AI & Numo (MIN-923): the reminders Numo keeps for the user, paused ones included. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const service = getServiceClient();
    const watches = await listOpenNumoWatches(service, auth.user.id);
    const named = await watchSubjects(service, auth.user.id, watches);
    return NextResponse.json({
      watches: watches.map(({ user_id: _owner, ...watch }) => ({
        ...watch,
        subject: named.get(watch.id)?.subject ?? null,
        accessible: named.get(watch.id)?.accessible ?? false,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load the reminders" }, { status: 503 });
  }
}

/**
 * Confirm a recurring reminder Numo proposed with permissions (MIN-953):
 * the user's own request is what saves it.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  try {
    const confirmed = await confirmNumoWatchProposal(getServiceClient(), auth.user.id, body);
    if (!confirmed.ok) {
      return NextResponse.json({ error: "Could not set the reminder", code: confirmed.code },
        { status: confirmed.status });
    }
    const { user_id: _owner, ...watch } = confirmed.watch;
    return NextResponse.json({ watch });
  } catch {
    return NextResponse.json({ error: "Could not set the reminder", code: "unavailable" }, { status: 503 });
  }
}
