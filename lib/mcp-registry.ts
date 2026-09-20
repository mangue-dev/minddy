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
  /** https icon URL published by the registry, when the server declares one. */
  icon?: string;
  /** The remote endpoint minddy connects to. */
  url: string;
  /** Registry transport mapped onto minddy's two transports. */
  transport: "http" | "sse";
}

/** The official registry search endpoint, stable public API. */
export const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers";

/** MIME types the registry schema allows for icons, matched by declared type or extension. */
const ICON_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/** Icon size to aim for: readable at 20 px, cheap to download. */
const IDEAL_ICON_SIZE = 64;

/**
 * One icon of a registry server entry, resolved to a renderable https URL.
 *
 * The schema allows any src, so only https image URLs the browser can display
 * survive. When several candidates exist the best-sized one wins: a raster
 * declared between 32 and 256 px ranks first (closest to the ideal size),
 * then the scalable SVG, then whatever is left. A stable pick, never a
 * random one.
 */
export function pickRegistryIcon(icons: unknown): string | undefined {
  if (!Array.isArray(icons)) return undefined;
  const candidates: Array<{ src: string; score: number }> = [];
  for (const icon of icons) {
    const rawSrc = (icon as { src?: unknown })?.src;
    if (typeof rawSrc !== "string") continue;
    let url: URL;
    try {
      url = new URL(rawSrc);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    const declared = (icon as { mimeType?: unknown }).mimeType;
    const mime =
      typeof declared === "string"
        ? declared
        : ICON_MIME_BY_EXTENSION[
            url.pathname.split(".").pop()?.toLowerCase() ?? ""
          ];
    if (!Object.values(ICON_MIME_BY_EXTENSION).includes(mime)) continue;
    const sizes = Array.isArray((icon as { sizes?: unknown }).sizes)
      ? ((icon as { sizes: unknown[] }).sizes)
      : [];
    const size = sizes
      .map((entry) =>
        typeof entry === "string" && /^\d+x\d+$/.test(entry)
          ? Number(entry.split("x")[0])
          : undefined,
      )
      .filter((entry): entry is number => typeof entry === "number")
      .sort((a, b) => a - b)[0];
    // Lower is better: an in-range raster first, then SVG, then the rest.
    const score =
      size !== undefined && size >= 32 && size <= 256
        ? Math.abs(size - IDEAL_ICON_SIZE)
        : mime === "image/svg+xml"
          ? 1000
          : size !== undefined
            ? 1000 + Math.abs(size - IDEAL_ICON_SIZE)
            : 1100;
    candidates.push({ src: url.toString(), score });
  }
  return candidates.sort((a, b) => a.score - b.score)[0]?.src;
}

const registryEntry = ({
  server,
  _meta,
}: {
  server?: {
    name?: unknown;
    title?: unknown;
    description?: unknown;
    icons?: unknown;
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
  const icon = pickRegistryIcon(server.icons);
  return {
    id: server.name,
    name:
      typeof server.title === "string" && server.title.length > 0
        ? server.title
        : server.name.split("/").pop() ?? server.name,
    ...(typeof server.description === "string" && server.description.length > 0
      ? { description: server.description }
      : {}),
    ...(icon ? { icon } : {}),
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
