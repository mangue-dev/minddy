import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getMcpConnection,
  withMcpClient,
  listMcpToolPage,
} from "@/lib/server/mcp-client";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimitRefusal(auth.user.id, "mcp-settings", { limit: 10 });
  if (limited) return limited;
  try {
    const connection = await getMcpConnection(
      auth.user.id,
      (await context.params).id,
    );
    if (!connection)
      return NextResponse.json({ error: "missing" }, { status: 404 });
    const result = await withMcpClient(connection, async (client) => ({
      tools: (await listMcpToolPage(client)).tools.length,
    }));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "connection" }, { status: 502 });
  }
}
