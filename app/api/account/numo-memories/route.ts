import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { deleteAllNumoMemories, listNumoMemories } from "@/lib/server/numo/memory-content";

/** Account → AI & Numo (MIN-915): the memories Numo keeps about the user. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ memories: await listNumoMemories(getServiceClient(), auth.user.id) });
  } catch {
    return NextResponse.json({ error: "Could not load Numo's memory" }, { status: 503 });
  }
}

/** "Forget everything": deletes every memory of the user. */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ deleted: await deleteAllNumoMemories(getServiceClient(), auth.user.id) });
  } catch {
    return NextResponse.json({ error: "Could not delete Numo's memory" }, { status: 503 });
  }
}
