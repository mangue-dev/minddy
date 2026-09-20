/**
 * The public MCP registry (MIN-586): the official directory at
 * registry.modelcontextprotocol.io, the one every remote server publishes to.
 * The curated catalog in ./mcp-catalog stays the hand-verified short list;
 * the registry makes everything else findable instead of typed by hand.
 *
 * The search result of one server entry, normalized for both consumers:
 * the settings search box and Numo's list_mcp_presets.
 */
export interface McpRegistryServer {
  /** Registry identifier, reverse-DNS style ("io.github.grafana/mcp-grafana"). */
  id: string;
  /** Display title or the readable tail of the identifier. */
  name: string;
  description?: string;
  /** The remote endpoint minddy connects to. */
  url: string;
  /** Registry transport mapped onto minddy's two transports. */
  transport: "http" | "sse";
}

/** The official registry search endpoint, stable public API. */
export const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers";

const registryEntry = ({
  server,
  _meta,
}: {
  server?: {
    name?: unknown;
    title?: unknown;
    description?: unknown;
    remotes?: unknown;
  };
  _meta?: Record<string, unknown>;
}) => {
  if (typeof server?.name !== "string" || server.name.length === 0) return null;
  const official = _meta?.["io.modelcontextprotocol.registry/official"] as
    | { isLatest?: unknown; status?: unknown }
    | undefined;
  // Every published version of a server shares one entry: only the latest
  // revision of an active server is a connectable candidate.
  if (official?.isLatest !== true) return null;
  if (typeof official.status === "string" && official.status !== "active")
    return null;
  // Only remote servers are connectable from minddy: a remote endpoint on a
  // supported transport must exist, otherwise the entry describes a local
  // (npm/npx) server that would push the user back to manual configuration.
  const remotes = Array.isArray(server.remotes) ? server.remotes : [];
  const supported = remotes.filter(
    (remote): remote is { type: string; url: string } =>
      typeof (remote as { type?: unknown })?.type === "string" &&
      typeof (remote as { url?: unknown })?.url === "string" &&
      ["streamable-http", "sse"].includes(
        (remote as { type: string }).type,
      ),
  );
  // Streamable HTTP first: SSE is the legacy transport.
  const remote =
    supported.find((entry) => entry.type === "streamable-http") ??
    supported[0];
  if (!remote) return null;
  return {
    id: server.name,
    name:
      typeof server.title === "string" && server.title.length > 0
        ? server.title
        : server.name.split("/").pop() ?? server.name,
    ...(typeof server.description === "string" && server.description.length > 0
      ? { description: server.description }
      : {}),
    url: remote.url,
    transport: remote.type === "sse" ? ("sse" as const) : ("http" as const),
  };
};

/** Defensive normalization of one registry search page; malformed entries are skipped. */
export function normalizeMcpRegistryPayload(
  payload: unknown,
  limit = 12,
): McpRegistryServer[] {
  const servers = Array.isArray((payload as { servers?: unknown })?.servers)
    ? ((payload as { servers: unknown[] }).servers)
    : [];
  const normalized: McpRegistryServer[] = [];
  const seen = new Set<string>();
  for (const entry of servers) {
    if (normalized.length >= limit) break;
    const server = registryEntry(
      entry as Parameters<typeof registryEntry>[0],
    );
    // Duplicate identifier = republished version on the same page: keep one.
    if (!server || seen.has(server.id)) continue;
    seen.add(server.id);
    normalized.push(server);
  }
  return normalized;
}
