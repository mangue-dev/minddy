import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const projectId = request.nextUrl.searchParams.get("projectId");

  let query = supabase
    .from("conversations")
    .select("*, project:projects(name)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const conversationId = request.nextUrl.searchParams.get("id");
  if (!conversationId) {
    return Response.json({ error: "Missing conversation ID" }, { status: 400 });
  }

  const { error, count } = await supabase
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!count) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
