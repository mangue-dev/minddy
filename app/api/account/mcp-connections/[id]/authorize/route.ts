import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getMcpConnection } from "@/lib/server/mcp-client";
import { startMcpOAuth } from "@/lib/server/mcp-oauth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "mcp-oauth", { limit: 10 });
  if (limited) return limited;
  try {
    const connection = await getMcpConnection(
      auth.user.id,
      (await context.params).id,
    );
    if (!connection)
      return NextResponse.json({ error: "missing" }, { status: 404 });
    return NextResponse.json({ url: await startMcpOAuth(connection) });
  } catch {
    return NextResponse.json({ error: "oauth" }, { status: 400 });
  }
}
