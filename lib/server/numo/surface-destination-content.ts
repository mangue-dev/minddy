import "server-only";

import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getServiceClient } from "@/lib/supabase-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { auditDecryption } from "@/lib/server/encryption/audit";
import type { NumoSurfaceDestination } from "./surface-conversations";

export type StoredSurfaceDestination = NumoSurfaceDestination | {
  ciphertext: string;
};

const PREFIX = "mdyn3:";
const ENCODED = /^mdyn3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const context = (actorId: string, eventId: string) => ({
  scope: { kind: "user" as const, id: actorId },
  table: "numo_surface_events", column: "destination", rowId: eventId,
});

export function isEncryptedSurfaceDestination(value: unknown): value is {
  ciphertext: string;
} {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as { ciphertext?: unknown }).ciphertext === "string" &&
    (value as { ciphertext: string }).ciphertext.startsWith(PREFIX);
}

export async function shouldEncryptSurfaceDestination(
  service?: SupabaseClient): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_NUMO_SURFACE_DESTINATION_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await (service ?? getServiceClient())
    .from("numo_surface_destination_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve surface destination encryption state");
  }
  return !!data;
}

export async function encodeSurfaceDestination(actorId: string, eventId: string,
  value: NumoSurfaceDestination, service?: SupabaseClient):
    Promise<StoredSurfaceDestination> {
  if (!await shouldEncryptSurfaceDestination(service)) return value;
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, context(actorId, eventId));
  return { ciphertext: `${PREFIX}${store.versionOf(cipher)}:${Buffer.from(cipher)
    .toString("base64url")}` };
}

export async function decodeSurfaceDestination(actorId: string, eventId: string,
  value: StoredSurfaceDestination): Promise<NumoSurfaceDestination> {
  if (!isEncryptedSurfaceDestination(value)) return value as NumoSurfaceDestination;
  const match = ENCODED.exec(value.ciphertext);
  if (!match) throw new Error("Invalid surface destination ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid surface destination encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<NumoSurfaceDestination>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Surface destination key version mismatch");
  }
  const clear = await store.decrypt(cipher, context(actorId, eventId));
  if (!clear || typeof clear !== "object" || Array.isArray(clear) ||
      (clear.kind !== "comment" && clear.kind !== "pull_request")) {
    throw new Error("Invalid surface destination");
  }
  auditDecryption(context(actorId, eventId), { actorId,
    reason: "repository_read" });
  return clear;
}

export function surfaceDestinationState(value: StoredSurfaceDestination) {
  if (!isEncryptedSurfaceDestination(value)) throw new Error("Not encrypted");
  const match = ENCODED.exec(value.ciphertext);
  if (!match) throw new Error("Invalid surface destination ciphertext");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url")
    .toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Surface destination key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
