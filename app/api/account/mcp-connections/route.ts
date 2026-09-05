import { mcpSettingsUpdate } from "@/lib/server/mcp-settings";
import { mcpOAuthCallback } from "@/lib/server/mcp-oauth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { mcpConnectionInput } from "@/lib/mcp-client";
import { listMcpConnections } from "@/lib/server/mcp-client";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({
      connections: await listMcpConnections(auth.user.id),
      callback_url: mcpOAuthCallback(),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load MCP connections" },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "mcp-settings", { limit: 10 });
  if (limited) return limited;
  const parsed = mcpConnectionInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await assertPublicHttpUrl(parsed.data.url);
  } catch {
    return NextResponse.json({ error: "endpoint" }, { status: 400 });
  }
  let values;
  try {
    values = mcpSettingsUpdate(parsed.data);
  } catch {
    return NextResponse.json({ error: "encryption" }, { status: 503 });
  }
  const { data, error } = await getServiceClient()
    .from("user_mcp_connections")
    .insert({ ...values, user_id: auth.user.id })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "save" }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
