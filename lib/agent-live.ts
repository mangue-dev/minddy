import {
  parseFilesChangedPayload,
  type AgentEventType,
  type AgentFileChange,
} from "./agent-api";

/**
 * WHAT THE THREAD SHOWS OF THE CURRENT ROUND, and the two rules that make it change.
 *
 * Aside from [use-agent-run-live.ts](use-agent-run-live.ts), which keeps the channel, the
 * cache and ordering: what's left here is PURE, therefore exercisable. The sequel
 * does not have a React rendering, and this is precisely what failed the first
 * version of MIN-248 bis — the client half of the feature had no tests.
 */

export interface AgentRunLive {
  /** Model response as written so far. */
  text: string;
  /** Tool calls already started in this round: >0 ⇒ narration, the round continues. */
  tools: number;
  /** The model is reasoning AT THIS MOMENT (MIN-122) → indicator + counter in the thread.
 * The TEXT of the reasoning is NOT streamed: it arrives persisted at the end of the round. */
  reasoningActive: boolean;
  /** Milliseconds of reflection for this round, measured on the server side (the counter). */
  reasoningMs: number;
  /** ISO — first moment this round wrote something (round timeline). */
  startedAt: string;
  /**
 * Files touched so far by the round, PROVISIONAL: the server returns the
 * ENTIRE list on each load, so this is authentic without having to merge.
 * `additions`/`deletions` are worth 0 — the direct only signals the paths.
 * The thread enriches them with the live Git statistic diff when available,
 * and a counter still at zero goes silent (`hideEmpty`) rather than reading as
 * a measurement.
 */
  files: AgentFileChange[];
  /** The list has been limited on the server side (big trick). */
  filesTruncated: boolean;
  /** Round-exact Git counters when coming back from the local executor. */
  fileStats: AgentFileChange[];
}

export interface StreamPayload {
  text?: unknown;
  tools?: unknown;
  reasoningActive?: unknown;
  reasoningMs?: unknown;
  at?: unknown;
  files?: unknown;
  filesTruncated?: unknown;
  fileStats?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * A direct charge applied to the wire state. `null` = nothing left to show.
 *
 * A charge is a complete SNAPSHOT of the round: what it hides, we erase.
 * Nothing is merged with `prev` except the timer, which dates from the FIRST sign of life
 * of round and not the last.
 */
export function liveFromStream(
  prev: AgentRunLive | null,
  payload: StreamPayload,
  now: () => string = () => new Date().toISOString(),
): AgentRunLive | null {
  const text = str(payload.text);
  const tools = typeof payload.tools === "number" ? payload.tools : 0;
  const reasoningActive = payload.reasoningActive === true;
  const reasoningMs = typeof payload.reasoningMs === "number" ? payload.reasoningMs : 0;
  // The SAME reading as that of the `files_changed` (`agent-api`) event: two
  // parsers for the same payload always end up diverging, and the second
  // already lost the statuses and counters of the first one.
  const { files: announcedFiles, truncated } = parseFilesChangedPayload({
    files: payload.files,
    truncated: payload.filesTruncated,
  });
  const { files: fileStats } = parseFilesChangedPayload({ files: payload.fileStats });
  // The built-in tool announces its path as soon as writing is authorized. THE
  // statement Git arrives a little later, once the writing is really done; he
  // also catch modifications made by a shell command.
  const files = announcedFiles.length > 0 ? announcedFiles : fileStats;
  // Sending EMPTY: the real events of the round are set, they take over
  // the screen. A phase of PURE reflection does not write a text or a tool — without
  // `reasoningActive` in this test the flag would disappear instead of
  // display. Files count as a sign of life: the load that carries them
  // door is precisely that of a round at rest.
  if (!text && !tools && !reasoningActive && files.length === 0 && fileStats.length === 0) return null;
  return {
    text,
    tools,
    reasoningActive,
    reasoningMs,
    files,
    filesTruncated: truncated,
    fileStats,
    startedAt: prev?.startedAt ?? now(),
  };
}

/**
 * The state of the thread when an event is SET. The provisional is erased: the real message
 * arrives, and without that the two would overlap while the server sends its
 * purge (an insert later).
 *
 * The FILES remain. No event placed replaces them before the
 * `files_changed` end of turn: clearing them at each `tool_call` made them
 * disappear during the entire tools phase, the same one where the agent edits and
 * where we want to see them.
 *
 * Except `files_changed`, precisely — HE is the authority, and his arrival is the
 * handover. Declare it HERE rather than waiting for a purge charge,
 * because one does not always come: when the loop is running in the microVM,
 * the event is set by the function AFTER the round has returned its report, and there is no one left in the VM to broadcast the omission. The two lists would have
 * superimposed until the end of the run.
 *
 * And except what ENDS THE TURN (`summary`, `quota_exhausted`): the living list
 * belongs to the current round, it does not survive it. She did it, by the time that
 * the `files_changed` at the end of the round arrived — and the thread, which puts what follows a
 * answer in a NEW round, opened a second accordion under it, chrono
 * understood: the round was read in double.
 */
const CLOSES_TURN: ReadonlySet<AgentEventType> = new Set<AgentEventType>([
  "files_changed",
  "summary",
  "quota_exhausted",
]);

export function liveAfterEvent(
  prev: AgentRunLive | null,
  type: AgentEventType,
): AgentRunLive | null {
  if (!prev || prev.files.length === 0 || CLOSES_TURN.has(type)) return null;
  return { ...prev, text: "", tools: 0, reasoningActive: false };
}
