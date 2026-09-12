import type { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { NUMO_UUID, resolveNumoConversation } from "@/lib/server/numo/conversations";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const source = request.nextUrl.searchParams.get("source");
  if (!NUMO_UUID.test(id) || (source !== "assistant" && source !== "agent" && source !== "run")) {
    return Response.json({ error: "Invalid legacy reference" }, { status: 400 });
  }
  try {
    const resolved = await resolveNumoConversation(auth.supabase, source, id);
    return resolved ? Response.json(resolved) : Response.json({ error: "Not found" }, { status: 404 });
  } catch {
    return Response.json({ error: "Unable to resolve conversation" }, { status: 500 });
  }
}
