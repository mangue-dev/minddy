import type { AgentLiveDiff, AgentLiveDiffFile } from "./agent-contract";
import { CHANGED_FILES_CAP } from "./repo-host";
import { LOCAL_WORKING_DIFF_MAX_BYTES } from "./working-diff";

const DIFF_FILE_STATUSES = new Set(["added", "removed", "renamed", "modified"]);

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Le patch local traverse un jeton lisible par le modèle : on ne fait donc
 * confiance ni à sa forme ni à sa taille. La borne globale est réappliquée
 * avant Realtime ET avant la persistance dans `files_changed`, même si le
 * harness officiel l'a déjà appliquée. */
export function localDiffPayload(raw: unknown): AgentLiveDiff {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(input.files) ? input.files : [];
  const files: AgentLiveDiffFile[] = [];
  let remaining = LOCAL_WORKING_DIFF_MAX_BYTES;
  let truncated = input.truncated === true;
  for (const item of rows) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const filename = typeof r.filename === "string" ? r.filename.slice(0, 2_000) : "";
    if (!filename) continue;
    const rawPatch = typeof r.patch === "string" ? r.patch : "";
    const patch = rawPatch.slice(0, remaining);
    if (patch.length < rawPatch.length) truncated = true;
    remaining -= patch.length;
    files.push({
      filename,
      status: (typeof r.status === "string" && DIFF_FILE_STATUSES.has(r.status)
        ? r.status
        : "modified") as AgentLiveDiffFile["status"],
      additions: Math.max(0, Math.round(num(r.additions) ?? 0)),
      deletions: Math.max(0, Math.round(num(r.deletions) ?? 0)),
      ...(patch ? { patch } : {}),
      ...(typeof r.previous_filename === "string"
        ? { previous_filename: r.previous_filename.slice(0, 2_000) }
        : {}),
    });
    if (files.length === CHANGED_FILES_CAP || remaining === 0) {
      if (rows.length > files.length || remaining === 0) truncated = true;
      break;
    }
  }
  return { files, truncated, ...(input.snapshot === true ? { snapshot: true } : {}) };
}
