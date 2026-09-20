import { searchMcpRegistry } from "@/lib/server/mcp-registry";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * Search proxy for the public MCP registry (MIN-586): the browser never calls
 * registry.modelcontextprotocol.io directly, both to keep the third-party
 * origin out of the client and to cache and rate-limit the upstream on one
 * server-side point.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  // One or two letters would pull half the registry for no useful answer.
  if (query.length < 2 || query.length > 120)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const limited = rateLimitRefusal(auth.user.id, "mcp-registry", { limit: 30 });
  if (limited) return limited;
  const servers = await searchMcpRegistry(query);
  return NextResponse.json({ servers });
}
