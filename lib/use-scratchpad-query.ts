"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { planProgress, type PlanProgress } from "@/lib/plan";
import { mergeScratchpad } from "@/lib/scratchpad";

/** Cache key for the personal scratchpad note. */
export const SCRATCHPAD_KEY = ["me", "scratchpad"] as const;

export interface ScratchpadResponse {
  content: string;
  updated_at: string | null;
  /** Version counter (CAS token) — the base a save is checked against. */
  rev: number;
  progress: PlanProgress;
}

const EMPTY: ScratchpadResponse = {
  content: "",
  updated_at: null,
  rev: 0,
  progress: { done: 0, total: 0 },
};

async function fetchScratchpad(): Promise<ScratchpadResponse> {
  const res = await fetch("/api/me/scratchpad");
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || text.trim() || "Request failed"
    );
  }
  return (data ?? EMPTY) as ScratchpadResponse;
}

/** A conditional (compare-and-swap) write. `ok:false` is a 409 conflict carrying
    the CURRENT server state, which the caller 3-way merges against and retries. */
type PutResult =
  | { ok: true; content: string; updated_at: string | null; rev: number }
  | { ok: false; content: string; rev: number };

async function putScratchpad(content: string, rev: number): Promise<PutResult> {
  const res = await fetch("/api/me/scratchpad", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, rev }),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.status === 409) {
    const d = data as { content?: string; rev?: number } | null;
    return { ok: false, content: d?.content ?? "", rev: d?.rev ?? 0 };
  }
  if (!res.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error || text.trim() || "Request failed"
    );
  }
  const d = data as ScratchpadResponse;
  return { ok: true, content: d.content, updated_at: d.updated_at, rev: d.rev };
}

/**
 * Task counts for the header trigger's badge — a light, always-on read of the
 * very same cached note the modal edits. One small GET on load, then kept
 * current for free: the RealtimeProvider invalidates SCRATCHPAD_KEY on every
 * write (yours, another tab's, or the agent's via the MCP), and the modal's own
 * saves write the cache directly, so the badge follows what you tick off live.
 * Warming the cache also makes opening the notebook instant — it renders the
 * cached note while it revalidates.
 */
export function useScratchpadProgress(): PlanProgress {
  return useScratchpadSummary().progress;
}

/**
 * The note ITSELF, from this same always-hot cache: a surface that
 * shows the remaining tasks, grouped by section, does not only have the account to
 * read. The GET is the same as the badge — a single request for both, and the real-time bridge refreshes them together.
 */
export function useScratchpadSummary(): { content: string; progress: PlanProgress } {
  const { data } = useQuery({
    queryKey: SCRATCHPAD_KEY,
    queryFn: fetchScratchpad,
    staleTime: 60_000,
  });
  return {
    content: data?.content ?? EMPTY.content,
    progress: data?.progress ?? EMPTY.progress,
  };
}

const responseOf = (content: string, updatedAt: string | null, rev: number): ScratchpadResponse => ({
  content,
  updated_at: updatedAt,
  rev,
  progress: planProgress(content),
});

/**
 * The scratchpad note with conflict-safe, never-lose-your-edits sync.
 *
 * The single doc has two writers — your open editor (autosave) and your agent
 * via the MCP. Every write is a compare-and-swap on `rev`; on a 409 the client
 * 3-way merges its edit onto the server's current version (yours wins overlaps)
 * and retries. `baseRef` tracks the last server-confirmed state (the common
 * ancestor for merges). When a merge changes the doc, the result is adopted back
 * into the editor so your view — and the next save's base — includes the other
 * side's changes. Realtime (the RealtimeProvider invalidates SCRATCHPAD_KEY on
 * any write) refreshes the editor whenever it's idle.
 *
 * `liveRef`/`applyRef` are populated by the editor: read its current markdown,
 * and replace its content (see components/scratchpad/scratchpad-editor.tsx).
 */
export function useScratchpadDoc({
  open,
  liveRef,
  applyRef,
}: {
  open: boolean;
  liveRef: MutableRefObject<(() => string) | null>;
  applyRef: MutableRefObject<
    ((content: string, opts?: { emitUpdate?: boolean }) => void) | null
  >;
}) {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: SCRATCHPAD_KEY,
    queryFn: fetchScratchpad,
    enabled: open,
    staleTime: 10_000,
  });

  const baseRef = useRef<{ content: string; rev: number }>({ content: "", rev: 0 });
  const seededRef = useRef(false);
  const [isSaving, setSaving] = useState(false);

  // Seed the merge base from the first load (the editor is created with it), and
  // reset on close so a reopen re-seeds from fresh server state.
  if (data && !seededRef.current) {
    baseRef.current = { content: data.content, rev: data.rev };
    seededRef.current = true;
  }
  useEffect(() => {
    if (!open) seededRef.current = false;
  }, [open]);

  const getLive = useCallback(() => liveRef.current?.(), [liveRef]);
  const applyExternal = useCallback(
    (content: string, opts?: { emitUpdate?: boolean }) => applyRef.current?.(content, opts),
    [applyRef]
  );

  // One CAS write of `ours`, with 3-way merge + retry only if the server was
  // changed by SOMEONE ELSE meanwhile (the agent via MCP). In normal solo use no
  // conflict ever happens, so `res.content === ours` and the editor is left
  // completely alone — no setContent, no cursor jump, no revert.
  const commitOnce = useCallback(
    async (ours: string) => {
      let attempt = ours;
      let mergeBase = baseRef.current.content;
      let expectRev = baseRef.current.rev;

      for (let i = 0; i < 8; i++) {
        const res = await putScratchpad(attempt, expectRev);
        if (res.ok) {
          baseRef.current = { content: res.content, rev: res.rev };
          qc.setQueryData(
            SCRATCHPAD_KEY,
            responseOf(res.content, res.updated_at, res.rev)
          );
          // Only a real external merge makes the stored version differ from what
          // we submitted → adopt it so the editor and the next base carry the
          // other side's changes. (Never triggered by plain typing.)
          if (res.content !== ours) {
            const live = getLive();
            if (live !== undefined && live !== res.content) {
              const target =
                live === ours
                  ? res.content
                  : mergeScratchpad(ours, live, res.content);
              applyExternal(target, { emitUpdate: target !== res.content });
            }
          }
          return;
        }
        // Conflict: fold our edit onto the server's current version and retry.
        attempt = mergeScratchpad(mergeBase, attempt, res.content);
        mergeBase = res.content;
        expectRev = res.rev;
      }
      // Couldn't converge (sustained contention) — resync the base to the server.
      const latest = await fetchScratchpad();
      baseRef.current = { content: latest.content, rev: latest.rev };
      qc.setQueryData(SCRATCHPAD_KEY, latest);
    },
    [qc, getLive, applyExternal]
  );

  // Serialize autosaves: coalesce rapid edits to the latest content and never let
  // two writes overlap (overlapping writes would self-conflict and churn). The
  // editor's markdown is cumulative, so a save that fails is picked up in full by
  // the next one.
  const pendingRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const commitRef = useRef(commitOnce);
  commitRef.current = commitOnce;

  const save = useCallback((content: string) => {
    pendingRef.current = content;
    if (runningRef.current) return;
    runningRef.current = true;
    setSaving(true);
    void (async () => {
      try {
        while (pendingRef.current !== null) {
          const next = pendingRef.current;
          pendingRef.current = null;
          try {
            await commitRef.current(next);
          } catch {
            // Transient failure — drop this attempt; the next edit's full-content
            // save includes it, so nothing the user typed is lost.
          }
        }
      } finally {
        runningRef.current = false;
        setSaving(false);
      }
    })();
  }, []);

  // Idle adoption: when the server advances past our base (the agent wrote) and
  // the editor has no unsaved edits, pull the fresh content in. If the editor IS
  // dirty, leave it — the next save's 3-way merge reconciles without losing what
  // you typed.
  useEffect(() => {
    if (!data || !seededRef.current) return;
    if (data.rev <= baseRef.current.rev) return;
    const live = getLive();
    if (live === undefined || live !== baseRef.current.content) return;
    baseRef.current = { content: data.content, rev: data.rev };
    if (live === data.content) return;
    // OUT of the commit phase (`queueMicrotask`): replace the content
    // pull up the React views of the tasks, and tiptap mounts them in `flushSync`.
    // Called directly in the effect, React refuses — “flushSync was called
    // from inside a lifecycle method” (same trap as putting mentions,
    // cf. components/markdown-editor.tsx). A microtask runs right after
    // commit it, therefore out of any rendering.
    const adopted = data.content;
    queueMicrotask(() => applyExternal(adopted, { emitUpdate: false }));
  }, [data, getLive, applyExternal]);

  return {
    content: data?.content ?? "",
    progress: data?.progress ?? EMPTY.progress,
    /** When the note last reached the server — the save indicator's "… ago". */
    updatedAt: data?.updated_at ?? null,
    isLoading: open && isPending,
    isSaving,
    save,
  };
}
