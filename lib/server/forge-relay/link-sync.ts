import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Control-plane side of `POST /relay/links`
 * (docs/managed-forge-relay-plan.md, "Link lifecycle sync").
 *
 * The link mirror is the authorization check for token minting, so it must
 * track link/unlink events that happen after the initial claim. Two channels,
 * because at-least-once delivery means events alone are not sufficient:
 *
 * - `events` — incremental `linked` / `unlinked` pushes, applied idempotently;
 * - `snapshot` — full reconciliation pushed at instance startup and on the
 *   periodic heartbeat; rows absent from the snapshot are deleted, which heals
 *   any lost event.
 *
 * Fail-safe direction: when the mirror is stale, mints are REFUSED (the mirror
 * only ever over-grants protection here, never under-grants it).
 */

const FULL_REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MAX_EVENTS_PER_SYNC = 200;
const MAX_SNAPSHOT_ENTRIES = 500;

export interface RelayLinkEvent {
  event: "linked" | "unlinked";
  provider: "github" | "gitlab";
  repo: string;
  connectionId?: string;
}

export interface RelayLinkSnapshotEntry {
  provider: "github" | "gitlab";
  repo: string;
  connectionId?: string;
}

export interface RelayLinkSyncPayload {
  events?: RelayLinkEvent[];
  snapshot?: RelayLinkSnapshotEntry[];
}

export type ParsedLinkSyncPayload =
  | { ok: true; payload: RelayLinkSyncPayload }
  | { ok: false; error: string };

function parseEntry(raw: unknown): RelayLinkSnapshotEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  const provider = entry.provider;
  const repo = entry.repo;
  if (provider !== "github" && provider !== "gitlab") return null;
  if (typeof repo !== "string" || !FULL_REPO_NAME.test(repo)) return null;
  const connectionId = entry.connectionId;
  return {
    provider,
    repo,
    ...(typeof connectionId === "string" && connectionId ? { connectionId } : {}),
  };
}

export function parseRelayLinkSyncPayload(raw: unknown): ParsedLinkSyncPayload {
  const body = (raw ?? {}) as Record<string, unknown>;
  const payload: RelayLinkSyncPayload = {};

  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length > MAX_EVENTS_PER_SYNC) {
      return { ok: false, error: `events must be an array of at most ${MAX_EVENTS_PER_SYNC} entries` };
    }
    const events: RelayLinkEvent[] = [];
    for (const rawEvent of body.events) {
      const entry = parseEntry(rawEvent);
      if (!entry) return { ok: false, error: "Invalid link event" };
      const kind = (rawEvent as Record<string, unknown>).event;
      if (kind !== "linked" && kind !== "unlinked") {
        return { ok: false, error: "Invalid link event kind" };
      }
      events.push({ ...entry, event: kind });
    }
    payload.events = events;
  }

  if (body.snapshot !== undefined) {
    if (!Array.isArray(body.snapshot) || body.snapshot.length > MAX_SNAPSHOT_ENTRIES) {
      return {
        ok: false,
        error: `snapshot must be an array of at most ${MAX_SNAPSHOT_ENTRIES} entries`,
      };
    }
    const snapshot: RelayLinkSnapshotEntry[] = [];
    for (const rawEntry of body.snapshot) {
      const entry = parseEntry(rawEntry);
      if (!entry) return { ok: false, error: "Invalid snapshot entry" };
      snapshot.push(entry);
    }
    payload.snapshot = snapshot;
  }

  if (!payload.events && !payload.snapshot) {
    return { ok: false, error: "events or snapshot required" };
  }
  return { ok: true, payload };
}

export type LinkSyncResult = { ok: true; applied: number } | { ok: false; error: string };

export async function applyRelayLinkSync(input: {
  instanceId: string;
  payload: RelayLinkSyncPayload;
}): Promise<LinkSyncResult> {
  const supabase = getServiceClient();
  let applied = 0;

  for (const event of input.payload.events ?? []) {
    if (event.event === "linked") {
      const { error } = await supabase.from("forge_relay_link_mirror").upsert(
        {
          instance_id: input.instanceId,
          provider: event.provider,
          repo_full_name: event.repo,
          connection_id: event.connectionId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instance_id,provider,repo_full_name" },
      );
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("forge_relay_link_mirror")
        .delete()
        .eq("instance_id", input.instanceId)
        .eq("provider", event.provider)
        .eq("repo_full_name", event.repo);
      if (error) return { ok: false, error: error.message };
    }
    applied += 1;
  }

  if (input.payload.snapshot) {
    // Reconcile: drop mirror rows this instance no longer claims, then upsert
    // the full current set. Last write wins — the snapshot IS the truth.
    const keep = new Set(input.payload.snapshot.map((e) => `${e.provider}:${e.repo}`));
    const { data: current, error: readError } = await supabase
      .from("forge_relay_link_mirror")
      .select("provider, repo_full_name")
      .eq("instance_id", input.instanceId);
    if (readError) return { ok: false, error: readError.message };
    const stale = ((current ?? []) as { provider: string; repo_full_name: string }[]).filter(
      (row) => !keep.has(`${row.provider}:${row.repo_full_name}`),
    );
    for (const row of stale) {
      const { error } = await supabase
        .from("forge_relay_link_mirror")
        .delete()
        .eq("instance_id", input.instanceId)
        .eq("provider", row.provider)
        .eq("repo_full_name", row.repo_full_name);
      if (error) return { ok: false, error: error.message };
      applied += 1;
    }
    for (const entry of input.payload.snapshot) {
      const { error } = await supabase.from("forge_relay_link_mirror").upsert(
        {
          instance_id: input.instanceId,
          provider: entry.provider,
          repo_full_name: entry.repo,
          connection_id: entry.connectionId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instance_id,provider,repo_full_name" },
      );
      if (error) return { ok: false, error: error.message };
      applied += 1;
    }
  }

  return { ok: true, applied };
}
