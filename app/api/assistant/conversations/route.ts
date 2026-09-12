import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

export { GET, POST } from "@/app/api/numo/conversations/route";

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
