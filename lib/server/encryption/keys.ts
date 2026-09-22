import "server-only";

import type { DataKey, DataKeyProvider, EncryptionScope } from "./store";

export type WrappedDataKey = {
  scope: EncryptionScope;
  version: number;
  wrappedKey: Uint8Array;
};

export interface KeyRegistry {
  loadCurrent(scope: EncryptionScope): Promise<WrappedDataKey | null>;
  loadVersion(scope: EncryptionScope, version: number): Promise<WrappedDataKey | null>;
  /** Atomic insert; returns the winner if another request created the first key. */
  insertFirst(record: WrappedDataKey): Promise<WrappedDataKey>;
  /** Atomic compare-and-swap; a concurrent rotation must be rejected. */
  rotate(record: WrappedDataKey, expectedVersion: number): Promise<boolean>;
}

export interface KeyWrapper {
  generate(scope: EncryptionScope): Promise<{ bytes: Buffer; wrappedKey: Uint8Array }>;
  unwrap(record: WrappedDataKey): Promise<Buffer>;
}

type CacheEntry = {
  key: DataKey;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 512;

function scopeId(scope: EncryptionScope): string {
  if ((scope.kind !== "project" && scope.kind !== "user" && scope.kind !== "system") || !scope.id) {
    throw new Error("Invalid encryption scope");
  }
  return `${scope.kind}:${scope.id}`;
}

/** Keeps decrypted keys only in process memory for a bounded time. */
export class ManagedDataKeys implements DataKeyProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly initialPending = new Map<string, Promise<number>>();

  constructor(
    private readonly registry: KeyRegistry,
    private readonly wrapper: KeyWrapper,
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 ||
        !Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("Invalid data key cache configuration");
    }
  }

  private cached(id: string): DataKey | null {
    const entry = this.cache.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.evict(id);
      return null;
    }
    return entry.key;
  }

  private evict(id: string): void {
    const entry = this.cache.get(id);
    if (entry) entry.key.bytes.fill(0);
    this.cache.delete(id);
  }

  private remember(id: string, key: DataKey): void {
    this.evict(id);
    while (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.evict(oldest);
    }
    this.cache.set(id, {
      key: { version: key.version, bytes: Buffer.from(key.bytes) },
      expiresAt: Date.now() + this.ttlMs,
    });
    key.bytes.fill(0);
  }

  private singleFlight(id: string, load: () => Promise<void>): Promise<void> {
    const running = this.pending.get(id);
    if (running) return running;
    const promise = load().finally(() => this.pending.delete(id));
    this.pending.set(id, promise);
    return promise;
  }

  async current(scope: EncryptionScope): Promise<DataKey> {
    const prefix = scopeId(scope);
    const record = await this.registry.loadCurrent(scope);
    if (record) {
      const id = `${prefix}:${record.version}`;
      const cached = this.cached(id);
      if (cached) return { version: cached.version, bytes: Buffer.from(cached.bytes) };
      await this.singleFlight(id, async () => this.remember(id, {
        version: record.version,
        bytes: await this.wrapper.unwrap(record),
      }));
      return this.byVersion(scope, record.version);
    }

    let initial = this.initialPending.get(prefix);
    if (!initial) {
      initial = (async () => {
        const generated = await this.wrapper.generate(scope);
        try {
          const winner = await this.registry.insertFirst({
            scope,
            version: 1,
            wrappedKey: generated.wrappedKey,
          });
          const id = `${prefix}:${winner.version}`;
          if (winner.version === 1 &&
              Buffer.from(winner.wrappedKey).equals(Buffer.from(generated.wrappedKey))) {
            this.remember(id, { version: 1, bytes: generated.bytes });
          } else {
            this.remember(id, {
              version: winner.version,
              bytes: await this.wrapper.unwrap(winner),
            });
          }
          return winner.version;
        } finally {
          generated.bytes.fill(0);
        }
      })().finally(() => this.initialPending.delete(prefix));
      this.initialPending.set(prefix, initial);
    }
    return this.byVersion(scope, await initial);
  }

  async byVersion(scope: EncryptionScope, version: number): Promise<DataKey> {
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error("Invalid data key version");
    }
    const id = `${scopeId(scope)}:${version}`;
    const cached = this.cached(id);
    if (cached) return { version, bytes: Buffer.from(cached.bytes) };
    await this.singleFlight(id, async () => {
      const record = await this.registry.loadVersion(scope, version);
      if (!record) throw new Error("Data key version is unavailable");
      this.remember(id, {
        version,
        bytes: await this.wrapper.unwrap(record),
      });
    });
    const loaded = this.cached(id);
    if (!loaded) throw new Error("Data key cache entry was evicted during load");
    return { version, bytes: Buffer.from(loaded.bytes) };
  }

  /** A rotation job calls this before it begins writing with the new version. */
  async rotate(scope: EncryptionScope): Promise<number> {
    const prior = await this.registry.loadCurrent(scope);
    if (!prior) {
      await this.current(scope);
      return 1;
    }
    const nextVersion = prior.version + 1;
    if (!Number.isSafeInteger(nextVersion)) throw new Error("Data key version exhausted");
    const generated = await this.wrapper.generate(scope);
    try {
      const updated = await this.registry.rotate({
        scope,
        version: nextVersion,
        wrappedKey: generated.wrappedKey,
      }, prior.version);
      if (!updated) throw new Error("Concurrent data key rotation");
      this.invalidate(scope);
      return nextVersion;
    } finally {
      generated.bytes.fill(0);
    }
  }

  invalidate(scope: EncryptionScope): void {
    const prefix = `${scopeId(scope)}:`;
    for (const id of this.cache.keys()) {
      if (id.startsWith(prefix)) this.evict(id);
    }
  }
}
