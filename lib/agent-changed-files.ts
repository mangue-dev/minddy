import {
  parseFilesChangedPayload,
  type AgentFileChange,
  type AgentFileChangeStatus,
  type AgentRunEvent,
} from "./agent-api";
import type { FileStatus } from "./pr-file-tree";

/**
 * Derivations "changed files" of an agent run (MIN-46, note "diff per round"),
 * shared between the thread (SETTLED block under the response of a round) and the bar
 * above the composer (LIVE block of the current round + "create PR" button ".
 *
 * Two sources, two loyalties:
 * • AUTHORITY — the `files_changed` events, emitted at the end of the round, calculated by git
 * in the sandbox (status + exact counters). This is the truth, but it only happens
 * once the turn is finished.
 * • APPROXIMATE (live) — reconstructed from the `tool_call` editing of the CURRENT turn,
 * to show "live" what the agent is touching while working (before
 * that git has not committed). Without counters, guessed tool status — `run_command`
 * can change files outside this list: it's a hint, not a count.
 */

/** Ordre d'affichage stable des statuts (ajouts d'abord, suppressions ensuite). */
const STATUS_RANK: Record<AgentFileChangeStatus, number> = {
  added: 0,
  modified: 1,
  renamed: 2,
  deleted: 3,
};

function byStatusThenPath(a: AgentFileChange, b: AgentFileChange): number {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  return r !== 0 ? r : a.path.localeCompare(b.path);
}

/**
 * Union of `files_changed` events of a run → CUMULATIVE state of the branch (last
 * status known by path, counters of the last event which touched it). Serves the bar
 * at rest: “N files modified · create a pull request”. `truncated` goes up if
 * an event has been limited (big turn).
 */
export function cumulativeBranchFiles(events: AgentRunEvent[]): {
  files: AgentFileChange[];
  truncated: boolean;
} {
  const byPath = new Map<string, AgentFileChange>();
  let truncated = false;
  for (const e of events) {
    if (e.type !== "files_changed") continue;
    const parsed = parseFilesChangedPayload(e.payload);
    if (parsed.truncated) truncated = true;
    for (const f of parsed.files) byPath.set(f.path, f);
  }
  return { files: [...byPath.values()].sort(byStatusThenPath), truncated };
}

/** Do we have at least one `files_changed` event? (⇒ the run has committed code.) */
export function hasCommittedChanges(events: AgentRunEvent[]): boolean {
  return events.some((e) => e.type === "files_changed");
}

/**
 * The status of a file in the PR diffs vocabulary, so that the block
 * of an agent turn has the same marks as them (icon, color, word). The
 * only difference between the two nomenclatures: git says `deleted`, the forge says
 * `removed`.
 */
export function prFileStatus(status: AgentFileChangeStatus): FileStatus {
  return status === "deleted" ? "removed" : status;
}

/** Totals +/− of a list (0 when unknown — live view). Takes any list which
 * HAS these two numbers: the same sum serves the files of an event
 * `files_changed` and those of the diff read in the microVM, which speak the language of
 * diffs of forge (`filename`) and not that of git (`path`). */
export function changeTotals(
  files: { additions: number; deletions: number }[],
): { additions: number; deletions: number } {
  return files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 },
  );
}

/** Statistics of a file returned by the diff route (forge form). */
export interface LiveDiffStat {
  filename: string;
  additions: number;
  deletions: number;
  previous_filename?: string;
}

/**
 * Adds the exact counters of the Git
 * live diff to the tour's provisional files. The provisional list remains the source of the scope of the round: the live diff
 * also covers the previous rounds of the branch, so we should not make it directly in the thread.
 */
export function mergeLiveFileStats(
  liveFiles: AgentFileChange[],
  diffFiles: LiveDiffStat[],
): AgentFileChange[] {
  const statsByPath = new Map<string, LiveDiffStat>();
  for (const file of diffFiles) {
    statsByPath.set(file.filename, file);
    if (file.previous_filename) statsByPath.set(file.previous_filename, file);
  }

  return liveFiles.map((file) => {
    const stat = statsByPath.get(file.path);
    return stat
      ? { ...file, additions: stat.additions, deletions: stat.deletions }
      : file;
  });
}
