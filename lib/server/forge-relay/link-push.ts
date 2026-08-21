import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { relayRequest } from "./client";

/**
 * Instance-side push of the link lifecycle to the control-plane mirror
 * (docs/managed-forge-relay-plan.md, "Link lifecycle sync").
 *
 * The mirror is the Cloud-side authorization check for token minting, so every
 * bind/unlink of a RELAYED repository is pushed over the signed channel. Each
 * push carries the incremental event AND a full snapshot of the instance's
 * relayed links: the snapshot is what heals a lost event without waiting for a
 * dedicated heartbeat (at-least-once delivery means the event channel alone is
 * not sufficient).
 *
 * Best-effort by design: a relay outage must never fail a local link gesture —
 * the next gesture re-sends the full snapshot and repairs the mirror. The
 * fail-safe direction stays Cloud-side: a stale mirror refuses mints.
 */

interface LinkEventInput {
  event: "linked" | "unlinked";
  provider: string;
  repo: string;
  connectionId: string | null;
}

async function currentRelayedLinks(): Promise<
  { provider: string; repo: string; connectionId: string | null }[]
> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("project_git_links")
    .select("provider, repo_full_name, connection_id, git_connections(source)")
    .eq("git_connections.source", "relay");
  return ((data ?? []) as unknown as Array<{
    provider: string;
    repo_full_name: string | null;
    connection_id: string;
  }>)
    .filter((row) => row.repo_full_name)
    .map((row) => ({
      provider: row.provider,
      repo: row.repo_full_name as string,
      connectionId: row.connection_id,
    }));
}

/**
 * Pushes one link gesture (event + reconciliation snapshot). Never raises:
 * callers are user-facing gestures, the mirror heals on the next push.
 */
export async function pushRelayLinkEvent(input: LinkEventInput): Promise<void> {
  try {
    const links = await currentRelayedLinks();
    const snapshot = links.map((link) => ({
      provider: link.provider,
      repo: link.repo,
      connectionId: link.connectionId ?? undefined,
    }));
    const event = {
      event: input.event,
      provider: input.provider,
      repo: input.repo,
      connectionId: input.connectionId ?? undefined,
    };
    // An unlink removes the row before the snapshot is read, so the event and
    // the snapshot agree; a bind appears in both. Sending both in one request
    // keeps one round trip and one self-healing payload.
    await relayRequest("/api/relay/links", { events: [event], snapshot });
  } catch (err) {
    console.warn("[forge-relay] link sync push failed:", (err as Error).message);
  }
}
