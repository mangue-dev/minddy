import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

import { AwsKmsKeyWrapper } from "./aws-kms";
import { ManagedDataKeys, type KeyRegistry, type WrappedDataKey } from "./keys";
import { EncryptedStore, type EncryptionScope } from "./store";

type Purpose = "content" | "blind_index";

type DbKey = {
  scope_kind: string;
  scope_id: string;
  purpose: string;
  version: number;
  wrapped_key: string;
};

function decodeKey(row: DbKey, scope: EncryptionScope, purpose: Purpose): WrappedDataKey {
  if (row.scope_kind !== scope.kind || row.scope_id !== scope.id ||
      row.purpose !== purpose || !Number.isSafeInteger(row.version) || row.version < 1 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(row.wrapped_key)) {
    throw new Error("Invalid wrapped data key record");
  }
  const bytes = Buffer.from(row.wrapped_key, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== row.wrapped_key) {
    throw new Error("Invalid wrapped data key record");
  }
  return { scope, version: row.version, wrappedKey: bytes };
}

export class SupabaseKeyRegistry implements KeyRegistry {
  constructor(private readonly purpose: Purpose) {}

  async loadCurrent(scope: EncryptionScope): Promise<WrappedDataKey | null> {
    const { data, error } = await getServiceClient()
      .from("envelope_data_keys")
      .select("scope_kind,scope_id,purpose,version,wrapped_key")
      .eq("scope_kind", scope.kind)
      .eq("scope_id", scope.id)
      .eq("purpose", this.purpose)
      .eq("is_current", true)
      .maybeSingle();
    if (error) throw new Error(`Unable to load current data key: ${error.code}`);
    return data ? decodeKey(data as DbKey, scope, this.purpose) : null;
  }

  async loadVersion(scope: EncryptionScope, version: number): Promise<WrappedDataKey | null> {
    const { data, error } = await getServiceClient()
      .from("envelope_data_keys")
      .select("scope_kind,scope_id,purpose,version,wrapped_key")
      .eq("scope_kind", scope.kind)
      .eq("scope_id", scope.id)
      .eq("purpose", this.purpose)
      .eq("version", version)
      .maybeSingle();
    if (error) throw new Error(`Unable to load data key version: ${error.code}`);
    return data ? decodeKey(data as DbKey, scope, this.purpose) : null;
  }

  async insertFirst(record: WrappedDataKey): Promise<WrappedDataKey> {
    const { data, error } = await getServiceClient().rpc(
      "create_envelope_data_key_if_absent",
      {
        p_scope_kind: record.scope.kind,
        p_scope_id: record.scope.id,
        p_purpose: this.purpose,
        p_wrapped_key: Buffer.from(record.wrappedKey).toString("base64"),
      },
    );
    if (error || !data) {
      throw new Error(`Unable to create data key: ${error?.code ?? "empty_result"}`);
    }
    return decodeKey(data as DbKey, record.scope, this.purpose);
  }

  async rotate(record: WrappedDataKey, expectedVersion: number): Promise<boolean> {
    const { data, error } = await getServiceClient().rpc("rotate_envelope_data_key", {
      p_scope_kind: record.scope.kind,
      p_scope_id: record.scope.id,
      p_purpose: this.purpose,
      p_expected_version: expectedVersion,
      p_wrapped_key: Buffer.from(record.wrappedKey).toString("base64"),
    });
    if (error) throw new Error(`Unable to rotate data key: ${error.code}`);
    return data === true;
  }
}

let contentKeys: ManagedDataKeys | null = null;
let indexKeys: ManagedDataKeys | null = null;
let store: EncryptedStore | null = null;

function configuredKeys(purpose: Purpose): ManagedDataKeys {
  const keyId = process.env.MINDDY_DATA_KMS_KEY_ID;
  const region = process.env.MINDDY_DATA_KMS_REGION ?? process.env.AWS_REGION;
  if (!keyId || !region) throw new Error("Data encryption KMS is not configured");
  return new ManagedDataKeys(
    new SupabaseKeyRegistry(purpose),
    new AwsKmsKeyWrapper(keyId, region, purpose),
  );
}

export function getEncryptedStore(): EncryptedStore {
  if (!store) store = new EncryptedStore(getContentKeys());
  return store;
}

export function getContentKeys(): ManagedDataKeys {
  return contentKeys ??= configuredKeys("content");
}

export function getBlindIndexKeys(): ManagedDataKeys {
  return indexKeys ??= configuredKeys("blind_index");
}

export type DueDataKey = { scope: EncryptionScope; version: number };

/** Content rotation never changes equality indexes or removes historical DEKs. */
export async function listDueContentKeys(before: string, limit: number): Promise<DueDataKey[]> {
  const { data, error } = await getServiceClient().from("envelope_data_keys")
    .select("scope_kind,scope_id,version")
    .eq("purpose", "content")
    .eq("is_current", true)
    .lt("created_at", before)
    .order("rotation_attempted_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .order("scope_kind", { ascending: true })
    .order("scope_id", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to list due data keys: ${error.code}`);
  return (data ?? []).map((row) => {
    if (!["project", "user", "system"].includes(row.scope_kind) ||
        typeof row.scope_id !== "string" || !row.scope_id ||
        !Number.isSafeInteger(row.version) || row.version < 1) {
      throw new Error("Invalid due data key record");
    }
    return { scope: { kind: row.scope_kind, id: row.scope_id }, version: row.version };
  });
}

/** Persist before calling KMS so a timeout or failing scope cannot starve later tenants. */
export async function markContentKeyRotationAttempt(record: DueDataKey, attemptedAt: string): Promise<void> {
  const { error } = await getServiceClient().from("envelope_data_keys")
    .update({ rotation_attempted_at: attemptedAt })
    .eq("scope_kind", record.scope.kind)
    .eq("scope_id", record.scope.id)
    .eq("purpose", "content")
    .eq("version", record.version)
    .eq("is_current", true);
  if (error) throw new Error(`Unable to record data key rotation attempt: ${error.code}`);
}
