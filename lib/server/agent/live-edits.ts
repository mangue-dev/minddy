import type { EmitAgentLive } from "./agent-contract";
import type { AgentLiveEdit, AgentLiveFileStat } from "./agent-contract";
import { CHANGED_FILES_CAP } from "./repo-host";

/**
 * THE FILES OF THE CURRENT TOUR, kept for live — the provisional half of the
 * couple of which `files_changed` (derived from git, at the end of the tour) is the authority.
 *
 * SHARED BY THE TWO ENGINES, and not for elegance: the function
 * ([execute.ts](execute.ts)) and microVM ([vm/turn.ts](vm/turn.ts)) should
 * tell the same thread, and that's exactly what the first version didn't
 * do — the hook only existed on the function side, so the feature didn't worked
 * on no project switched to `loop_in_vm`, that is to say on the one where we looked at
 *. A state to be kept in duplicate is held in a module, not by copy.
 *
 * Two rules live there:
 *
 * - **one `Map` per path**: a file edited six times only appears once,
 * and the last new wins (written then deleted ⇒ deleted) ;
 * - **the list leaves with EACH load of the direct**, not only with that of
 * the edition. A charge is a complete SNAPSHOT of the round, and the thread erases
 * what a charge does not: issued separately, the list disappears on the next charge
 *.
 */
export interface LiveEditLog {
  /** Ce qu'un tool vient de toucher. */
  note(edits: AgentLiveEdit[]): void;
  /** Exact Git counters read after the tool actually writes. */
  noteStats(stats: AgentLiveFileStat[]): void;
  /** The baton has passed to the git list: we forget. Returns `true` if there was
 * anything to forget — the caller only has to rebroadcast in this case. */
  clear(): boolean;
  /**
 * What a direct charge should carry. Empty (no key) when nothing has been touched: the thread distinguishes "no files" from "empty list", and an extra key
 * `files: []` would be enough to pass off a round at rest for a sign
 * of life.
 *
 * Bounded to the same ceiling than the authoritarian list, and the same admission: a round
 * which touches 200 files should not broadcast 200 four times per second,
 * and a list truncated without saying it reads like a complete list.
 */
  payload(): {
    files?: AgentLiveEdit[];
    filesTruncated?: boolean;
    fileStats?: AgentLiveFileStat[];
  };
}

export function newLiveEditLog(): LiveEditLog {
  const edits = new Map<string, AgentLiveEdit>();
  const stats = new Map<string, AgentLiveFileStat>();
  return {
    note: (batch) => {
      for (const edit of batch) edits.set(edit.path, edit);
    },
    noteStats: (batch) => {
      stats.clear();
      for (const stat of batch) stats.set(stat.path, stat);
    },
    clear: () => {
      if (edits.size === 0 && stats.size === 0) return false;
      edits.clear();
      stats.clear();
      return true;
    },
    payload: () => {
      if (edits.size === 0) return {};
      const all = [...edits.values()];
      const filesTruncated = all.length > CHANGED_FILES_CAP;
      return {
        files: filesTruncated ? all.slice(0, CHANGED_FILES_CAP) : all,
        filesTruncated,
        ...(stats.size > 0 ? { fileStats: [...stats.values()].slice(0, CHANGED_FILES_CAP) } : {}),
      };
    },
  };
}

/**
 * The exec-tool's `onEdit` hook, as BOTH engines wire it: on
 * note, then immediately rebroadcast — otherwise the thread would wait for the next
 * text load, i.e. the next round.
 *
 * The charge is that of one round AT REST. An edition does not advance the
 * round (neither text, nor reflection, nor tool-call moreover): announcing `tools: 1`
 * would lie on a counter that the thread reads to decide if a text is a
 * response or narration.
 */
export function liveEditHook(
  log: LiveEditLog,
  emitLive: EmitAgentLive,
): (edits: AgentLiveEdit[]) => void {
  return (edits) => {
    log.note(edits);
    emitLive({ text: "", tools: 0, reasoningActive: false, reasoningMs: 0 });
  };
}
