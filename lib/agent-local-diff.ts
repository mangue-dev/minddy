import type {
  AgentFileChange,
  AgentRunEvent,
  PullRequestFile,
} from "./agent-api";

/** Form transported by the local direct and by the `files_changed` event. */
export interface AgentLocalDiff {
  files: PullRequestFile[];
  truncated: boolean;
  snapshot?: boolean;
}

const FILE_CAP = 100;
const PATCH_CAP = 240_000;
const STATUSES = new Set(["added", "removed", "renamed", "modified"]);

/** Client boundary: a historical event or malformed Realtime message should never feed directly to the diff renderer. */
export function parseAgentLocalDiff(raw: unknown): AgentLocalDiff {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(value.files) ? value.files : [];
  const files: PullRequestFile[] = [];
  let remaining = PATCH_CAP;
  let truncated = value.truncated === true;
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const filename = typeof row.filename === "string" ? row.filename.slice(0, 2_000) : "";
    if (!filename) continue;
    const rawPatch = typeof row.patch === "string" ? row.patch : "";
    const patch = rawPatch.slice(0, remaining);
    if (patch.length < rawPatch.length) truncated = true;
    remaining -= patch.length;
    files.push({
      filename,
      status: typeof row.status === "string" && STATUSES.has(row.status)
        ? row.status
        : "modified",
      additions: nonNegative(row.additions),
      deletions: nonNegative(row.deletions),
      ...(patch ? { patch } : {}),
      ...(typeof row.previous_filename === "string"
        ? { previous_filename: row.previous_filename.slice(0, 2_000) }
        : {}),
    });
    if (files.length === FILE_CAP || remaining === 0) {
      if (rows.length > files.length || remaining === 0) truncated = true;
      break;
    }
  }
  return { files, truncated, ...(value.snapshot === true ? { snapshot: true } : {}) };
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

/** Events are PER TURN diffs. The last patch of a path wins: it
 * is calculated against the baseline of the session and therefore contains the retouches
 * of previous rounds on this same file. */
export function settledAgentLocalDiff(events: AgentRunEvent[]): AgentLocalDiff {
  const byPath = new Map<string, PullRequestFile>();
  let truncated = false;
  for (const event of events) {
    if (event.type !== "files_changed") continue;
    const parsed = parseAgentLocalDiff(event.payload?.diff);
    if (parsed.snapshot) byPath.clear();
    truncated ||= parsed.truncated;
    for (const file of parsed.files) byPath.set(file.filename, file);
  }
  return { files: [...byPath.values()].sort(byFilename), truncated };
}

/** Adds the current round snapshot to the already persisted diff. */
export function mergeAgentLocalDiff(
  settled: AgentLocalDiff,
  live: AgentLocalDiff | null,
): AgentLocalDiff {
  if (!live) return settled;
  if (live.snapshot) return live;
  if (live.files.length === 0) return settled;
  const byPath = new Map(settled.files.map((file) => [file.filename, file]));
  for (const file of live.files) byPath.set(file.filename, file);
  return {
    files: [...byPath.values()].sort(byFilename),
    truncated: settled.truncated || live.truncated,
  };
}

/**
 * Chooses the one session diff that drives every conversation surface.
 *
 * An authoritative empty response must win over historical file events: it means
 * the changes were reverted. Falling back in that case used to resurrect stale
 * files, show their counters, and offer a pull request for an empty diff.
 */
export function selectAgentSessionDiff(opts: {
  local: boolean;
  localDiff: AgentLocalDiff;
  remoteFiles: PullRequestFile[];
  remoteReady: boolean;
  fallbackFiles: AgentFileChange[];
}): PullRequestFile[] {
  if (opts.local) return opts.localDiff.files;
  if (opts.remoteReady) return opts.remoteFiles;
  return opts.fallbackFiles.map((file) => ({
    filename: file.path,
    status: file.status === "deleted" ? "removed" : file.status,
    additions: file.additions,
    deletions: file.deletions,
    ...(file.previousPath ? { previous_filename: file.previousPath } : {}),
  }));
}

function byFilename(a: PullRequestFile, b: PullRequestFile): number {
  return a.filename.localeCompare(b.filename);
}
