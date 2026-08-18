"use client";

// RECORDING a page (MIN-271) — unbound, versioned, merged.
//
// Three things, and they hold together:
//
// 1. **A single in-flight write.** What is typed during a query
// trip does not open a second request: it waits its turn in
// `pending`, and leaves as soon as the first one returns. Two PATCHES
// competitors on the same body would arrive in an order that no one
// control, and the oldest would win half the time.
//
// 2. **The version travels with the body.** Each scripture says what it says about
// leans; the server refuses (409) if the page has moved since then, instead
// to crush. That's the whole guardrail, and it only costs a whole.
//
// 3. **Refusal is resolved by a merge, not by a choice.** The 409 reports
// the server document: we merge it block by block with that of
// the screen (`lib/pages-merge.ts`), we adopt the result in the editor, and
// we REPLAY the writing on the new version. What we don't know
// merge — a block that both wrote — is not decided in
// silence: it comes out in `conflicts`, and the screen says it.
//
// What is NOT here: real time. A page does not update at all
// alone before the eyes of its reader; we only learn each other's writing
// time to record yours. This is the framing of MIN-271, and the door
// left open is `prosemirror-collab`, which would land on exactly this
// compteur de version.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/react";

import {
  PageConflictError,
  type UpdatePageInput,
} from "@/lib/pages-api";
import type { Page } from "@/lib/pages";
import {
  applyRestore,
  mergeDocs,
  type PageBlockConflict,
  type PageDocJSON,
} from "@/lib/pages-merge";

/** What the header displays. `conflict` survives the writing that produced it:
    the page IS saved, but a block has been replaced and it needs to be said. */
export type PageSaveState = "saved" | "saving" | "conflict";

/**
 * The number of consecutive replays. Three, because a replay only fails if one
 * THIRD record played during merge — beyond, insist
 * would spin a loop rather than converge. We then keep the draft
 * waiting: the next keystroke (or the next ⌘S) will return it.
 */
const MAX_REPLAYS = 3;

export interface PageAutosave {
  state: PageSaveState;
  /** The timestamp of the last accepted write, for the tooltip. */
  savedAt: string | null;
  /** The blocks that we refused to cut. Empty = silent merge. */
  conflicts: PageBlockConflict[];
  /** Stack a change; the write leaves after the inactivity timeout. */
  schedule: (patch: UpdatePageInput) => void;
  /** Now writes what is waiting (⌘S, page exit, hidden tab). */
  flush: () => Promise<void>;
  /** Remove draft from queue — last chance writing
      (`pagehide`) must win itself, without going through a promise. */
  takePending: () => UpdatePageInput | null;
  /** Submits my version of a contested block, and saves it. */
  restore: (conflict: PageBlockConflict) => void;
  /** “I saw” — the blindfold closes, the document does not move. */
  dismiss: () => void;
}

export function usePageAutosave({
  pageId,
  page,
  fresh,
  delayMs,
  save,
  editorRef,
  onError,
}: {
  pageId: string;
  /** The page as it was read: the BASIS of the first writing. */
  page: Page | undefined;
  /**
   * Does `page` come from a reading made during THIS editing?
   *
   * The version counter is only valid if it is that of the server: keep it
   * of a cache, it is basing the entire safeguard on a data of which we do not know
   * not the age. `isFetchedAfterMount`, at the caller's house.
   */
  fresh: boolean;
  delayMs: number;
  /** The writing itself — `usePagesQuery.updatePage`, which also patches
      the tree. It raises `PageConflictError` on a version refusal. */
  save: (pageId: string, input: UpdatePageInput) => Promise<Page>;
  editorRef: React.MutableRefObject<Editor | null>;
  onError: (error: unknown) => void;
}): PageAutosave {
  /** The last known SERVER version: its body and its counter. This is the
      basis of the merger, and it advances with each accepted write. */
  const base = useRef<{ content: PageDocJSON | null; version: number }>({
    content: null,
    version: 0,
  });
  /** What the SCREEN carries, always up to date — the fusion works on it and not
      on the body left in the request, which is one second late. */
  const screen = useRef<PageDocJSON | null>(null);

  // The basis is laid ONCE per page, and ONLY after reading
  // during this assembly (`fresh`). Both halves of this sentence correct
  // each a 409 on a page where no one else writes:
  //
  // - once: a refetch that passes through here again would overwrite the version that
  // the writes moved forward, and the next save would start again
  // on an expired meter;
  // - from a fresh reading: otherwise we stick to the FIRST data
  // came, that is to say the cache — a snapshot of localStorage old
  // several hours to recharge. The lock below then froze
  // this outdated version for the entire session, and ALL saves
  // left in 409 (silently resolved by the merger, but free).
  const seeded = useRef<string | null>(null);
  const loaded = fresh && page?.id === pageId;
  useEffect(() => {
    if (!loaded || !page || seeded.current === pageId) return;
    seeded.current = pageId;
    base.current = {
      content: (page.content as PageDocJSON | null) ?? null,
      version: page.version,
    };
    screen.current = base.current.content;
  }, [loaded, page, pageId]);

  const pending = useRef<UpdatePageInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<PageBlockConflict[]>([]);

  const takePending = useCallback((): UpdatePageInput | null => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = null;
    // A last chance entry is made on the version we have in hand:
    // without it, it would crush — with it, it is simply refused.
    if (patch && patch.content !== undefined && patch.version === undefined) {
      return { ...patch, version: base.current.version };
    }
    return patch;
  }, []);

  /** Adopt a document from elsewhere without restarting the autosave: the
      cursor is placed back where it was, as much as the new document
      allows — a conflict must not send the reader back to the top of the page. */
  const adopt = useCallback(
    (doc: PageDocJSON) => {
      screen.current = doc;
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) return;
      const at = editor.state.selection.from;
      editor.commands.setContent(doc as JSONContent, { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.min(at, Math.max(0, max - 1)));
    },
    [editorRef]
  );

  const write = useCallback(async () => {
    if (inFlight.current) return; // the line is already served
    let patch = takePending();
    if (!patch) return;

    inFlight.current = true;
    setSaving(true);
    try {
      // A writing, its replays, then what was typed during — all
      // in ONE loop, so never two requests in flight.
      while (patch) {
        let replays = 0;
        let sent: UpdatePageInput | null = patch;
        while (sent) {
          const attempt: UpdatePageInput = sent;
          try {
            const saved = await save(pageId, attempt);
            if (attempt.content !== undefined) {
              base.current = {
                content: attempt.content as PageDocJSON,
                version: saved.version,
              };
            }
            setSavedAt(saved.updated_at);
            sent = null;
          } catch (err) {
            if (!(err instanceof PageConflictError) || replays >= MAX_REPLAYS) {
              // A refusal that we do not know how to resolve does not lose its impact: the
              // draft returns to the queue, the next attempt the
              // reprendra.
              pending.current = { ...attempt, ...pending.current };
              throw err;
            }
            replays += 1;
            sent = resolve(err, attempt);
          }
        }
        patch = takePending();
      }
    } catch (err) {
      onError(err);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }

    /** The 409: merge, adopt, and say what we have not been able to merge. */
    function resolve(
      err: PageConflictError,
      sent: UpdatePageInput
    ): UpdatePageInput | null {
      const theirs = (err.page.content as PageDocJSON | null) ?? null;
      const mine = screen.current ?? (sent.content as PageDocJSON | null);
      const merged = mergeDocs(base.current.content, mine, theirs);

      base.current = { content: merged.doc, version: err.page.version };
      adopt(merged.doc);
      if (merged.conflicts.length > 0) {
        setConflicts((current) => [...current, ...merged.conflicts]);
      }
      setSavedAt(err.page.updated_at);

      // Nothing to return to the server: the fusion only retained what it carries
      // Already. The fields outside the body (title, icon) still start again — they
      // have not been written, and they do not argue with anyone.
      const { content: _content, version: _version, ...rest } = sent;
      if (!merged.changed) {
        return Object.keys(rest).length > 0 ? rest : null;
      }
      return { ...rest, content: merged.doc, version: err.page.version };
    }
  }, [pageId, save, takePending, adopt, onError]);

  const writeRef = useRef(write);
  writeRef.current = write;

  const flush = useCallback(async () => {
    await writeRef.current();
  }, []);

  const schedule = useCallback(
    (patch: UpdatePageInput) => {
      if (patch.content !== undefined) {
        screen.current = patch.content as PageDocJSON;
      }
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void writeRef.current(), delayMs);
    },
    [delayMs]
  );

  const restore = useCallback(
    (conflict: PageBlockConflict) => {
      const doc = applyRestore(
        screen.current ?? base.current.content ?? { type: "doc", content: [] },
        conflict,
        screen.current
      );
      adopt(doc);
      setConflicts((current) => current.filter((c) => c.id !== conflict.id));
      schedule({ content: doc });
      void writeRef.current();
    },
    [adopt, schedule]
  );

  const dismiss = useCallback(() => setConflicts([]), []);

  // The timer does not survive the component: a programmed write which leaves
  // after dismantling would write on a page that we no longer look at. The exit
  // page, it is written by the caller (`flush`) BEFORE disassembling.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const state: PageSaveState = saving
    ? "saving"
    : conflicts.length > 0
      ? "conflict"
      : "saved";

  return useMemo(
    () => ({
      state,
      savedAt,
      conflicts,
      schedule,
      flush,
      takePending,
      restore,
      dismiss,
    }),
    [state, savedAt, conflicts, schedule, flush, takePending, restore, dismiss]
  );
}
