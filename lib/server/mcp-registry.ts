import "server-only";

import {
  MCP_REGISTRY_URL,
  normalizeMcpRegistryPayload,
  type McpRegistryServer,
} from "@/lib/mcp-registry";

/**
 * Server-side search into the public MCP registry (MIN-586).
 *
 * The registry is a public service: the search runs with Next's fetch cache
 * keyed by the full query URL (one upstream request per distinct search for a
 * few minutes), parses defensively, and fails soft — an empty list, never an
 * exception, since the registry being down must not break the curated catalog
 * flows that call it as a side dish.
 */

/** Largest page one search may pull from the registry. */
const REGISTRY_PAGE_LIMIT = 50;

/** Outbound call budget for one search. */
const REGISTRY_TIMEOUT_MS = 8_000;

export async function searchMcpRegistry(
  query: string,
  limit = 12,
): Promise<McpRegistryServer[]> {
  const url = new URL(MCP_REGISTRY_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(REGISTRY_PAGE_LIMIT));
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    return normalizeMcpRegistryPayload(payload, limit);
  } catch {
    // Registry unreachable: the catalog still carries the curated presets.
    return [];
  }
}
