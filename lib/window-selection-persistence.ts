import { localSnapshotGeneration, saveLocalSnapshot } from "./local-snapshots";

type Selection = { id: string; href: string; revision: number; saved: boolean };
type Flight = { selection: Selection; abort: AbortController; done: Promise<void> };

/**
 * One account/window lifetime. Normal writes are serial and retain only the
 * newest waiting selection. Owners must keep this instance across effect replay
 * and dispose it only when that lifetime actually ends; disposal is permanent.
 */
export function createWindowSelectionPersistence(storage: Storage | undefined, key: string, owner: string) {
  const generation = localSnapshotGeneration();
  let disposed = false, scheduled = false, revision = 0;
  let latest: Selection | undefined, pending: Selection | undefined, running: Flight | undefined;
  let saved: { id: string; href: string; raw: string } | undefined;
  const current = () => !disposed && generation === localSnapshotGeneration();
  const identical = (selection: { id: string; href: string } | undefined, id: string, href: string) =>
    selection?.id === id && selection.href === href;
  const alreadySaved = (selection: Selection) => {
    if (!identical(saved, selection.id, selection.href) || !storage) return false;
    try {
      if (storage.getItem(key) !== saved!.raw) return false;
      const envelope = JSON.parse(saved!.raw);
      return envelope.format === "minddy-local-v1" && envelope.owner === owner && envelope.expiresAt > Date.now();
    } catch { return false; }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true; revision += 1; pending = undefined; latest = undefined; saved = undefined;
    const old = running; running = undefined;
    old?.abort.abort();
  };
  const start = (selection: Selection): Flight | undefined => {
    if (!current() || !storage) { dispose(); return; }
    pending = undefined;
    if (alreadySaved(selection)) { selection.saved = true; return; }
    selection.saved = false;
    const flight: Flight = { selection, abort: new AbortController(), done: Promise.resolve() };
    running = flight;
    const guardedStorage = { setItem: (slot: string, raw: string) => {
      // Enqueueing a newer selection fences this ACK before another request
      // starts. Generic seal revisions alone cannot protect a queued value.
      if (!current() || running !== flight || latest !== selection || revision !== selection.revision || flight.abort.signal.aborted) return;
      storage.setItem(slot, raw);
      saved = { id: selection.id, href: selection.href, raw };
      selection.saved = true;
    } } as Storage;
    flight.done = saveLocalSnapshot(guardedStorage, key, "window-tabs", { id: selection.id, href: selection.href }, false,
      { signal: flight.abort.signal, expectedOwner: owner }).catch(() => {
      // Selection recovery is optional. Keep the latest intent in memory for an
      // explicit flush or later changed selection, without an automatic loop.
    }).finally(() => {
      if (running !== flight) return;
      running = undefined;
      if (!current()) { dispose(); return; }
      schedule();
    });
    return flight;
  };
  const schedule = () => {
    if (!current() || !pending || running || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!current()) { dispose(); return; }
      if (pending && !running) start(pending);
    });
  };
  return {
    remember(id: string, href: string) {
      if (!current() || !storage) { dispose(); return; }
      if (identical(latest, id, href)) {
        // Do not turn a repeated notification after failure into a retry loop.
        // A cleared/expired successfully saved envelope does need replacement.
        if (!latest!.saved || alreadySaved(latest!) || running || pending) return;
      }
      latest = { id, href, revision: ++revision, saved: false };
      latest.saved = alreadySaved(latest);
      pending = latest.saved ? undefined : latest;
      schedule();
    },
    flush(): Promise<void> {
      if (!current() || !storage || !latest) { if (!current()) dispose(); return Promise.resolve(); }
      if (alreadySaved(latest)) return Promise.resolve();
      if (running?.selection === latest) return running.done;
      pending = latest;
      if (running) {
        // A hide/refresh flush must not wait behind an obsolete seal. Its
        // client operation is retired before dispatching the newest selection;
        // a transport ignoring abort still cannot install its late response.
        const old = running; running = undefined;
        old.abort.abort();
      }
      return start(latest)?.done ?? Promise.resolve();
    },
    dispose,
  };
}
