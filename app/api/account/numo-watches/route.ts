import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { listActiveNumoWatches } from "@/lib/server/numo/watches";
import { watchSubjects } from "@/lib/server/numo/watch-clock";

/** Account → AI & Numo (MIN-923): the reminders Numo is waiting on for the user. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const service = getServiceClient();
    const watches = await listActiveNumoWatches(service, auth.user.id);
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
