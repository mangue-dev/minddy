type Slot = "query-cache" | "issue-drafts" | "objective-drafts" | "search-history" | "page-list-settings" | "status-history" | "window-tabs";
type Snapshot = { format: "minddy-local-v1"; owner: string; expiresAt: number; ciphertext: string };
let generation = 0;
const revisions = new Map<string, number>();
const pendingOpens = new WeakMap<Storage, Map<string, { raw: string; generation: number; value: Promise<unknown> }>>();

async function request(body: Record<string, unknown>) {
  const response = await fetch("/api/me/local-snapshots", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to save or restore local data");
  return await response.json();
}

export function invalidateLocalSnapshotWrites(): void { generation += 1; }
export function localSnapshotGeneration(): number { return generation; }
export function removeLocalSnapshot(storage: Storage, key: string): void {
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  storage.removeItem(key);
}

/** The server owns all keys; only authenticated ciphertext is written to device storage. */
export async function saveLocalSnapshot(storage: Storage, key: string, slot: Slot, value: unknown, claimLegacy = false): Promise<void> {
  const started = generation;
  const revision = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, revision);
  const { snapshot } = await request({ operation: "seal", slot, value, claimLegacy });
  if (started !== generation) throw new Error("Local account changed");
  if (revisions.get(key) !== revision) return;
  if (snapshot?.format !== "minddy-local-v1" || typeof snapshot.ciphertext !== "string") throw new Error("Invalid local snapshot");
  storage.setItem(key, JSON.stringify(snapshot));
}

export async function restoreLocalSnapshot(storage: Storage, key: string, slot: Slot): Promise<unknown> {
  const started = generation;
  const revision = revisions.get(key);
  const raw = storage.getItem(key);
  if (!raw) return undefined;
  const snapshot = JSON.parse(raw) as Snapshot;
  if (snapshot?.format !== "minddy-local-v1") return undefined;
  if (snapshot.expiresAt <= Date.now()) { removeLocalSnapshot(storage, key); return undefined; }
  // Share only a currently authorized operation on identical ciphertext. Never
  // reuse a completed plaintext result or cross storage/account generations.
  let opens = pendingOpens.get(storage);
  if (!opens) { opens = new Map(); pendingOpens.set(storage, opens); }
  const identity = `${slot}:${key}`;
  let pending = opens.get(identity);
  if (!pending || pending.raw !== raw || pending.generation !== started) {
    const entry = { raw, generation: started, value: request({ operation: "open", slot, snapshot }).then(({ value }) => value) };
    opens.set(identity, entry);
    void entry.value.finally(() => {
      if (opens.get(identity) === entry) opens.delete(identity);
    }).catch(() => {});
    pending = entry;
  }
  const value = await pending.value;
  if (started !== generation || revisions.get(key) !== revision || storage.getItem(key) !== raw) return undefined;
  return value;
}
