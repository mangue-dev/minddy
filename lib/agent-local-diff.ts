import type { AgentRunEvent, PullRequestFile } from "./agent-api";

/** Forme transportée par le direct local et par l'event `files_changed`. */
export interface AgentLocalDiff {
  files: PullRequestFile[];
  truncated: boolean;
  snapshot?: boolean;
}

const FILE_CAP = 100;
const PATCH_CAP = 240_000;
const STATUSES = new Set(["added", "removed", "renamed", "modified"]);

/** Frontière client : un event historique ou un message Realtime mal formé ne
 * doit jamais alimenter directement le renderer de diff. */
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

/** Les events sont des diffs PAR TOUR. Le dernier patch d'un chemin gagne : il
 * est calculé contre la baseline de la session et contient donc les retouches
 * des tours précédents sur ce même fichier. */
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

/** Ajoute l'instantané du tour en cours au diff déjà persisté. */
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

function byFilename(a: PullRequestFile, b: PullRequestFile): number {
  return a.filename.localeCompare(b.filename);
}
