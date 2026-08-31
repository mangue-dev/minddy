/** Input accepted by the desktop bridge for a run-scoped diff lookup. */
export interface DesktopLocalRunDiffInput {
  runId: string;
}

export interface DesktopLocalRunDiffFile {
  filename: string;
  status: "added" | "removed" | "renamed" | "modified";
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

export interface DesktopLocalRunDiff {
  files: DesktopLocalRunDiffFile[];
  truncated: boolean;
  snapshot?: boolean;
}

export const DESKTOP_LOCAL_DIFF_PATCH_CAP = 2_000_000;

const FILE_CAP = 100;
const STATUSES = new Set(["added", "removed", "renamed", "modified"]);

/**
 * Accept only one opaque run identifier. The renderer can select a run, but it
 * cannot provide a repository path or a file path to the native process.
 */
export function desktopLocalRunDiffId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const runId = (raw as { runId?: unknown }).runId;
  if (typeof runId !== "string") return null;
  const value = runId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) return null;
  return value;
}

/** Validate the native artifact before returning it to the remote renderer. */
export function parseDesktopLocalRunDiff(raw: unknown): DesktopLocalRunDiff {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(value.files) ? value.files : [];
  const files: DesktopLocalRunDiffFile[] = [];
  let remaining = DESKTOP_LOCAL_DIFF_PATCH_CAP;
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
        ? row.status as DesktopLocalRunDiffFile["status"]
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
