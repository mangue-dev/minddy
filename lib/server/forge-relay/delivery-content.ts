import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { getServiceClient } from "@/lib/supabase-service";

const PREFIX = "mdyd3";
const ENCODED = /^mdyd3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };
export type DeliveryColumn = "payload" | "last_error";

function binding(instanceId: string, provider: string,
  deliveryGuid: string, column: DeliveryColumn) {
  if (!instanceId || !provider || !deliveryGuid) {
    throw new Error("Relay delivery identity is required");
  }
  return { scope: SCOPE, table: "forge_relay_deliveries", column,
    rowId: `${instanceId}:${provider}:${deliveryGuid}` };
}

export function isEncryptedRelayDelivery(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptRelayDelivery(): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await getServiceClient()
    .from("forge_relay_delivery_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve relay delivery encryption state");
  }
  return !!data;
}

export async function encodeRelayDelivery(instanceId: string, provider: string,
  deliveryGuid: string, column: DeliveryColumn, value: string): Promise<string> {
  if (isEncryptedRelayDelivery(value)) throw new Error("Invalid relay delivery value");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value,
    binding(instanceId, provider, deliveryGuid, column));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeRelayDelivery(instanceId: string, provider: string,
  deliveryGuid: string, column: DeliveryColumn, value: string | null,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedRelayDelivery(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid encrypted relay delivery");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid relay delivery ciphertext encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Relay delivery key version mismatch");
  }
  const context = binding(instanceId, provider, deliveryGuid, column);
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string") throw new Error("Invalid relay delivery content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

export function relayDeliveryState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted relay delivery");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Relay delivery key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
