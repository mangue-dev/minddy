import "server-only";
import { getEncryptedStore } from "./encryption/registry";
import { assertDraftProjectsAccess, localSnapshotProjectAccess } from "./local-snapshot-access";

export const LOCAL_SNAPSHOT_TTL = {
  "query-cache": 24 * 60 * 60 * 1000,
  "issue-drafts": 30 * 24 * 60 * 60 * 1000,
  "objective-drafts": 30 * 24 * 60 * 60 * 1000,
  "search-history": 24 * 60 * 60 * 1000,
  "page-list-settings": 30 * 24 * 60 * 60 * 1000,
  "status-history": 24 * 60 * 60 * 1000,
  "window-tabs": 24 * 60 * 60 * 1000,
} as const;
export type LocalSnapshotSlot = keyof typeof LOCAL_SNAPSHOT_TTL;
export type SealedLocalSnapshot = { format: "minddy-local-v1"; owner: string; expiresAt: number; ciphertext: string };
const context = (owner: string, slot: LocalSnapshotSlot) => ({
  scope: { kind: "user" as const, id: owner }, table: "local_client_snapshots", column: slot, rowId: owner,
});
const isDraft = (slot: LocalSnapshotSlot) => slot === "issue-drafts" || slot === "objective-drafts";

export async function sealLocalSnapshot(owner: string, slot: LocalSnapshotSlot, value: unknown, claimLegacy = false): Promise<SealedLocalSnapshot> {
  if (claimLegacy && isDraft(slot)) await assertDraftProjectsAccess(owner, value);
  // Self-authored drafts remain an account-owned recovery copy. Cached project
  // responses instead lose decrypt access as soon as project membership changes.
  const accessFingerprint = isDraft(slot) ? null : (await localSnapshotProjectAccess(owner)).fingerprint;
  const expiresAt = Date.now() + LOCAL_SNAPSHOT_TTL[slot];
  const ciphertext = await getEncryptedStore().encrypt({ expiresAt, accessFingerprint, value }, context(owner, slot));
  if (!isDraft(slot) && (await localSnapshotProjectAccess(owner)).fingerprint !== accessFingerprint) throw new Error("Local snapshot access changed");
  return { format: "minddy-local-v1", owner, expiresAt, ciphertext };
}

export async function openLocalSnapshot(owner: string, slot: LocalSnapshotSlot, snapshot: SealedLocalSnapshot): Promise<unknown> {
  if (snapshot.format !== "minddy-local-v1" || snapshot.owner !== owner) throw new Error("Invalid local snapshot");
  const store = getEncryptedStore();
  const decoded = await store.decrypt<{ expiresAt: number; accessFingerprint: string | null; value: unknown }>(store.fromDatabase(snapshot.ciphertext), context(owner, slot));
  if (!Number.isSafeInteger(decoded.expiresAt) || decoded.expiresAt <= Date.now() || decoded.expiresAt !== snapshot.expiresAt) {
    throw new Error("Expired local snapshot");
  }
  if (!isDraft(slot) && (await localSnapshotProjectAccess(owner)).fingerprint !== decoded.accessFingerprint) throw new Error("Local snapshot access changed");
  return decoded.value;
}
