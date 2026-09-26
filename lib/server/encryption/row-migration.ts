import "server-only";

import { isDeepStrictEqual } from "node:util";
import { EncryptedRowCodec, type RowContext, type StoredRow } from "./row-codec";
import type { EncryptedStore } from "./store";
import policies from "./data-policy.json";

/** Repositories supply an opaque revision and resolve ownership before this boundary. */
export type MigrationCandidate = {
  row: StoredRow;
  context: RowContext;
  revision: string;
};

export interface RowMigrationRepository {
  /**
   * Select a stable, bounded batch including legacy rows and old formats/key versions.
   * Failed rows must remain eligible; a persisted cursor must eventually revisit them.
   */
  scan(limit: number): Promise<MigrationCandidate[]>;
  /**
   * Atomically compare the revision AND ownership, then persist the complete encoded
   * row. Return false for deleted/edited/moved rows. Never retry with an unguarded write.
   * A thrown error can mean an uncertain commit; the next pass must read fresh state.
   */
  compareAndSwap(candidate: MigrationCandidate, replacement: StoredRow): Promise<boolean>;
}

export type RowMigrationResult = {
  scanned: number;
  migrated: number;
  unchanged: number;
  conflicted: number;
  failed: number;
  interrupted: boolean;
};

/**
 * Shared migration/rotation mechanism. Deployment must register each converted
 * repository explicitly; the schema inventory alone never authorizes migration.
 */
export async function migrateProtectedRows(
  repository: RowMigrationRepository,
  store: EncryptedStore,
  { limit = 50, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<RowMigrationResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Invalid protected row migration batch size");
  }
  const result: RowMigrationResult = {
    scanned: 0, migrated: 0, unchanged: 0, conflicted: 0, failed: 0, interrupted: false,
  };
  if (signal?.aborted) return { ...result, interrupted: true };
  const candidates = await repository.scan(limit);
  if (candidates.length > limit) throw new Error("Migration repository exceeded its batch limit");
  const codec = new EncryptedRowCodec(store);
  const audit = { actorId: null, reason: "migration_verification" as const };

  for (const candidate of candidates) {
    if (signal?.aborted) {
      result.interrupted = true;
      break;
    }
    result.scanned += 1;
    try {
      if (!candidate.revision) throw new Error("Migration requires a revision");
      const plain = await codec.decode(candidate.row, candidate.context, audit);
      const replacement = await codec.encode({
        ...plain, encryption_version: 0, encrypted_content: null,
      }, candidate.context);

      // Never clear legacy columns or replace a historical ciphertext before verifying
      // that the new envelope recovers the exact logical row, including JSON nulls.
      const verified = await codec.decode(replacement, candidate.context, audit);
      const expected = { ...plain };
      const clear = policies[candidate.context.table].clear;
      if ("remove_projection" in clear) {
        for (const column of clear.remove_projection) {
          delete expected[column];
          delete verified[column];
        }
      }
      if (!isDeepStrictEqual(expected, verified)) throw new Error("Migration verification failed");
      if (replacement.encryption_version < candidate.row.encryption_version) {
        throw new Error("Migration would downgrade the data key version");
      }
      if (candidate.row.encryption_version === replacement.encryption_version &&
          candidate.row.encrypted_content !== null && replacement.encrypted_content !== null &&
          store.formatOf(candidate.row.encrypted_content) === store.formatOf(replacement.encrypted_content)) {
        result.unchanged += 1;
        continue;
      }
      if (signal?.aborted) {
        result.interrupted = true;
        break;
      }
      if (await repository.compareAndSwap(candidate, replacement)) result.migrated += 1;
      else result.conflicted += 1;
    } catch {
      // Corrupt ciphertext, unavailable historical keys or provider outages must not
      // become destructive writes. Report counts only; DB errors can contain content.
      result.failed += 1;
    }
  }
  return result;
}
