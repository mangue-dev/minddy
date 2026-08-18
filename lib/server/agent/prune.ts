/**
 * Code agent context hardening (MIN-46): pruning stale output from
 * tools. Inspired by opencode's `prune`.
 *
 * On a long run, the biggest consumers of context are the results of
 * `read_file`/`grep`/`list_dir`/`glob` read ago many tricks: large
 * and expired (the agent has already acted on it). We protect the LAST ~400 KB of output
 * from tools (recent context, still useful) and we replace the oldest with a
 * marker — BUT only if we recover at least ~100 KB (otherwise we don't touch
 * nothing: no churn on small runs), and never the LAST reading from a
 * given path (`keepLastPerKey`, MIN-248). PURE logic, testable; called at the
 * round boundary in agent-loop.ts, and only under context pressure.
 * Pruning reduces the cost per call AND the size of the checkpoint (the history IS the
 * checkpoint).
 *
 * Safety: we ONLY modify the `content` of `role:"tool"` messages (their
 * `tool_call_id` and the tool_call ↔ result pairing remain intact). The
 * messages from the agent, user and tool-calls are never affected.
 */

import { contentChars, imageCount, stripImages, type AgentContentPart } from "./content";

/**
 * Wrapper of ONE tool result in history: the loop serializes the
 * result into JSON and passes it to `headTail`. A tool that composes its output must
 * fit IN — otherwise it is this cut that decides, and it elides the middle
 * of the JSON (so, for a command, the tail of stdout: the verdict, MIN-107).
 */
export const TOOL_RESULT_MAX_CHARS = 6000;

/**
 * Tools output bytes (most recent) protected from pruning.
 *
 * 400 KB ≈ 100 k tokens, of the same order as `AGENT_COMPACT_BASELINE_TOKENS`
 * (120 k): prune is the gesture PRECEDING the compaction, not the one that the
 * replaces. The original 40 KB (MIN-46) was worth ~7 windows of `read_file` —
 * an order of magnitude below the compaction threshold, so the only one of the two
 * safeguards ever to come into play. The model lost its readings after a few rounds and bought them back one by one: 83 reads from the same file in
 * 44 minutes, zero edits (MIN-248).
 */
export const PRUNE_PROTECT_BYTES = 400_000;
/** We only prune if we recover at least this much (avoid churn). */
export const PRUNE_MINIMUM_BYTES = 100_000;
/** Marker that replaces pruned tool output. */
export const PRUNE_STUB =
  "[Tool output elided to save context. Re-read the file or re-run the search if you still need it.]";

/**
 * Truncates a string while keeping the START and END (the middle elided). Better than
 * head-only for command output: the tail (tail of a failing test,
 * last grep matches) is often the useful part.
 */
export function headTail(str: string, max: number): string {
  if (str.length <= max) return str;
  const keep = Math.max(1, Math.floor((max - 40) / 2));
  const elided = str.length - keep * 2;
  return `${str.slice(0, keep)}\n… [${elided} chars elided] …\n${str.slice(-keep)}`;
}

/** Minimal form of a manipulated message (AgentChatMessage compatible). */
interface PrunableMessage {
  role: string;
  content?: string | AgentContentPart[] | null;
}

/**
 * MEMORY key of a tool result: two results with the same key say the
 * same thing of the same object (the same file read twice, within two windows),
 * and only the most recent is worth keeping. Return `null` = this result has nothing
 * re-readable to protect, it is pruned as before.
 *
 * The function comes from the CALLER: `prune.ts` knows neither the names of tools nor
 * the form of their arguments (cf. `toolMemoryKeys` in agent-loop.ts). It's this
 * that keeps this module pure — and testable without microVM.
 */
export type ToolMemoryKey<T> = (msg: T, index: number) => string | null;

/**
 * Image parts kept in ALL history (MIN-111). The history IS the
 * checkpoint: a model remains there in the form of data URL, round after round. Without
 * cap, a conversation that opens mockups repeatedly would grow the
 * checkpoint up to the `MAX_CHECKPOINT_BYTES` (8 MB) which puts the run to rest. Three
 * images (≈ 3 MB at worst, cf. the cap per image of issue-tools.ts) cover the real case
 * — the ticket carries a model, sometimes two states of the same screen — and
 * leave room for the rest of the context.
 */
export const MAX_HISTORY_IMAGES = 3;
/** Note which replaces a pruned image (same contract as PRUNE_STUB: re-requestable). */
export const IMAGE_ELIDED_NOTE =
  "[Image elided to save context. Call read_resource again if you still need to look at it.]";

/**
 * Limits the number of images RETAINED in history: keeps the most recent
 * `max`, replaces the oldest with a note. ONLY affects
 * `role:"tool"` messages (same guarantees as `pruneToolOutputs`: the pairing
 * tool_call↔result remains intact, agent and user messages are never rewritten). Returns the number of pruned images.
 */
export function capHistoryImages<T extends PrunableMessage>(
  messages: T[],
  max: number = MAX_HISTORY_IMAGES,
): number {
  let seen = 0;
  let elided = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "tool") continue;
    const count = imageCount(m.content);
    if (count === 0) continue;
    if (seen + count <= max) {
      seen += count;
      continue;
    }
    // This message overflows the ceiling: we empty it of its images in one block
    // (part of the same tool result doesn't make half sense).
    messages[i] = { ...m, content: stripImages(m.content, IMAGE_ELIDED_NOTE) } as T;
    elided += count;
  }
  return elided;
}

/**
 * Prunes the oldest tools output in place. Scans the history
 * from the end to the beginning: as long as the cumulative tools output remains under
 * `protectBytes`, we protect; beyond that, we mark to prune. Does not change anything if
 * the recoverable total is under `minimumBytes`. Returns the number of bytes
 * retrieved (0 if no pruning).
 *
 * `keepLastPerKey` adds a second protection, independent of age: the
 * LAST result of each key survives, no matter how old it is. A file read twenty
 * times only keeps one reading; he never keeps zero. Without it, the stub
 * ("reread the file if you still need it") closes like a conveyor belt —
 * the model rereads, the replay exits the window in the next round, it rereads
 * again (MIN-248). The RESCUE path (`checkpoint-fit.ts`) does not pass it:
 * when the checkpoint overflows, everything must be able to leave.
 */
export function pruneToolOutputs<T extends PrunableMessage>(
  messages: T[],
  opts?: { protectBytes?: number; minimumBytes?: number; keepLastPerKey?: ToolMemoryKey<T> },
): number {
  const protectBytes = opts?.protectBytes ?? PRUNE_PROTECT_BYTES;
  const minimumBytes = opts?.minimumBytes ?? PRUNE_MINIMUM_BYTES;
  const keyOf = opts?.keepLastPerKey;

  let remainingProtect = protectBytes;
  let reclaimable = 0;
  const toPrune: number[] = [];
  /** Keys for which we have already crossed the most recent result (we go back in time). */
  const seenKeys = new Set<string>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "tool") continue;
    if (typeof m.content !== "string") {
      // MULTIPART result (an image attachment, MIN-111): we do not replace it
      // not by a text marker — this would remove the image from the model that comes
      // to ask for it. It still consumes the protected window (at the proxy of
      // `contentChars`, not to base64 bytes); it's `capHistoryImages`
      // qui borne son accumulation.
      remainingProtect -= contentChars(m.content);
      markSeen(keyOf?.(m, i), seenKeys);
      continue;
    }
    if (m.content === PRUNE_STUB) continue; // already pruned
    const size = m.content.length;
    if (remainingProtect > 0) {
      remainingProtect -= size; // in the recent protected window
      // Even in the window: the key is seen, so the OLDER readings of the
      // same file prunes normally. We keep one reading per key, not one
      // de plus.
      markSeen(keyOf?.(m, i), seenKeys);
      continue;
    }
    const key = keyOf?.(m, i) ?? null;
    if (key !== null && !seenKeys.has(key)) {
      seenKeys.add(key); // last reading of this path: it remains
      continue;
    }
    reclaimable += size;
    toPrune.push(i);
  }

  if (reclaimable < minimumBytes) return 0;
  for (const i of toPrune) {
    messages[i] = { ...messages[i], content: PRUNE_STUB };
  }
  return reclaimable;
}

function markSeen(key: string | null | undefined, seen: Set<string>): void {
  if (key) seen.add(key);
}
