import { mcpSettingsUpdate } from "@/lib/server/mcp-settings";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { mcpConnectionId, mcpConnectionPatch } from "@/lib/mcp-client";
import { getMcpConnection } from "@/lib/server/mcp-client";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = mcpConnectionPatch.safeParse(
    await request.json().catch(() => null),
  );
  if (!mcpConnectionId.safeParse(id).success || !parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const current = await getMcpConnection(auth.user.id, id);
    if (!current)
      return NextResponse.json({ error: "missing" }, { status: 404 });
    const fields = parsed.data;
    if (fields.url) {
      try {
        await assertPublicHttpUrl(fields.url);
      } catch {
        return NextResponse.json({ error: "endpoint" }, { status: 400 });
      }
    }
    let values;
    try {
      values = mcpSettingsUpdate(fields, current);
    } catch {
      return NextResponse.json({ error: "encryption" }, { status: 503 });
    }
    const service = getServiceClient();
    const { error: pendingError } = await service
      .from("user_mcp_oauth_attempts")
      .delete()
      .eq("connection_id", id)
      .eq("user_id", auth.user.id);
    if (pendingError)
      return NextResponse.json({ error: "save" }, { status: 503 });
    const { data, error } = await service
      .from("user_mcp_connections")
      .update(values)
      .eq("user_id", auth.user.id)
      .eq("id", id)
      .eq("url", current.url)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "save" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "missing" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "save" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!mcpConnectionId.safeParse(id).success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await getServiceClient()
    .from("user_mcp_connections")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("id", id);
  if (error) return NextResponse.json({ error: "save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
