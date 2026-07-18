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
  const { data, isLoading } = useQuery({
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

  const saveRef = useRef<(content: string) => Promise<void>>(async () => {});
  const save = useCallback(
    async (ours: string) => {
      setSaving(true);
      try {
        let attempt = ours;
        let mergeBase = baseRef.current.content;
        let expectRev = baseRef.current.rev;
        let saved: Extract<PutResult, { ok: true }> | null = null;

        for (let i = 0; i < 8; i++) {
          const res = await putScratchpad(attempt, expectRev);
          if (res.ok) {
            saved = res;
            break;
          }
          // Conflict: fold our edit onto the server's current version and retry.
          attempt = mergeScratchpad(mergeBase, attempt, res.content);
          mergeBase = res.content;
          expectRev = res.rev;
        }

        if (!saved) {
          // Sustained contention (very rare) — resync to the server, don't loop.
          const latest = await fetchScratchpad();
          baseRef.current = { content: latest.content, rev: latest.rev };
          qc.setQueryData(SCRATCHPAD_KEY, latest);
          const live = getLive();
          if (live !== undefined && live !== latest.content) {
            applyExternal(latest.content, { emitUpdate: false });
          }
          return;
        }

        baseRef.current = { content: saved.content, rev: saved.rev };
        qc.setQueryData(
          SCRATCHPAD_KEY,
          responseOf(saved.content, saved.updated_at, saved.rev)
        );

        // If a merge changed the doc, reflect it in the editor so the view — and
        // the next save's base — carries the other side's changes.
        const live = getLive();
        if (live !== undefined && live !== saved.content) {
          if (live === ours) {
            applyExternal(saved.content, { emitUpdate: false });
          } else {
            // You typed during the round-trip → fold those in-flight edits too,
            // then persist the result.
            const target = mergeScratchpad(ours, live, saved.content);
            applyExternal(target, { emitUpdate: false });
            if (target !== saved.content) void saveRef.current(target);
          }
        }
      } catch {
        // Transient failure (network / server error). Leave baseRef untouched so
        // the edit stays in the editor and the next change retries from the same
        // base — the user's work is never dropped on a failed request.
      } finally {
        setSaving(false);
      }
    },
    [qc, getLive, applyExternal]
  );
  saveRef.current = save;

  // Idle adoption: when the server advances past our base and the editor has no
  // unsaved edits, pull the fresh content in. If the editor IS dirty, leave it —
  // the next save's 3-way merge reconciles without losing what you typed.
  useEffect(() => {
    if (!data || !seededRef.current) return;
    if (data.rev <= baseRef.current.rev) return;
    const live = getLive();
    if (live === undefined || live !== baseRef.current.content) return;
    baseRef.current = { content: data.content, rev: data.rev };
    if (live !== data.content) applyExternal(data.content, { emitUpdate: false });
  }, [data, getLive, applyExternal]);

  return {
    content: data?.content ?? "",
    progress: data?.progress ?? EMPTY.progress,
    isLoading,
    isSaving,
    save,
  };
}
