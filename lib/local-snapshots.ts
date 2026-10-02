type Slot = "query-cache" | "issue-drafts" | "objective-drafts" | "search-history" | "page-list-settings" | "status-history" | "window-tabs";
type Snapshot = { format: "minddy-local-v1"; owner: string; expiresAt: number; ciphertext: string };
let generation = 0;
const revisions = new Map<string, number>();

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
  const { value } = await request({ operation: "open", slot, snapshot });
  if (started !== generation || revisions.get(key) !== revision || storage.getItem(key) !== raw) return undefined;
  return value;
}
