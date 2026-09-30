import "server-only";

import { isContentEncryptionEnabled } from "./content-config";
import { getEncryptedStore } from "./registry";
import { EncryptedRowCodec, type StoredRow } from "./row-codec";

const scope = { kind: "system" as const, id: "00000000-0000-0000-0000-000000000000" };

export type AppConfigRow = {
  key: string;
  value: string | null;
  encryption_version?: number;
  encrypted_content?: string | null;
  encryption_checked_at?: string | null;
};

export async function decodeAppConfig(row: AppConfigRow): Promise<string> {
  if (row.encryption_version === undefined || row.encryption_version === 0) {
    if (typeof row.value !== "string" || row.encrypted_content) {
      throw new Error("Invalid legacy app configuration");
    }
    return row.value;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as unknown as StoredRow, { table: "app_config", scope },
    { actorId: null, reason: "repository_read" },
  );
  if (typeof decoded.value !== "string") throw new Error("Invalid app configuration");
  return decoded.value;
}

export async function encodeAppConfig(key: string, value: string,
  previousVersion = 0): Promise<AppConfigRow> {
  if (!appConfigEncryptionEnabled() && previousVersion === 0) return { key, value };
  const encoded = await new EncryptedRowCodec(getEncryptedStore()).encode(
    { key, value, encryption_version: 0, encrypted_content: null },
    { table: "app_config", scope },
  );
  return { key, value: null, encryption_version: encoded.encryption_version,
    encrypted_content: encoded.encrypted_content };
}

export function appConfigEncryptionEnabled(): boolean {
  return isContentEncryptionEnabled();
}
