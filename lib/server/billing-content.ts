import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";

const marker = "mdye3:";
type Field = "email" | "admin_override_note";

function binding(userId: string, field: Field) {
  if (!userId) throw new Error("Billing account owner is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "billing_accounts", column: field, rowId: userId };
}

export async function shouldProtectBillingIdentity(
  service: SupabaseClient = getServiceClient(),
): Promise<boolean> {
  if (isContentEncryptionEnabled())
    return true;
  const { data, error } = await service.from("billing_identity_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("Unable to resolve billing identity protection state");
  return !!data;
}

export async function encodeBillingField(
  userId: string, field: Field, value: string | null,
): Promise<string | null> {
  if (value === null) return null;
  if (!value) throw new Error("Invalid billing identity value");
  const cipher = await getEncryptedStore().encrypt(value, binding(userId, field));
  return `${marker}${cipher}`;
}

export async function decodeBillingField(
  userId: string, field: Field, value: string | null,
): Promise<string | null> {
  if (value === null || !value.startsWith(marker)) return value;
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(value.slice(marker.length));
  if (store.formatOf(cipher) !== 3)
    throw new Error("Invalid billing identity envelope");
  const opened = await store.decrypt(cipher, binding(userId, field));
  if (typeof opened !== "string" || !opened)
    throw new Error("Invalid protected billing identity");
  return opened;
}

export function billingFieldVersion(value: string | null): number {
  if (!value || !value.startsWith(marker)) return 0;
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value.slice(marker.length));
  if (store.formatOf(cipher) !== 3)
    throw new Error("Invalid billing identity envelope");
  return store.versionOf(cipher);
}

export async function decodeBillingAccount<T extends { user_id: string;
  email?: string | null; admin_override_note?: string | null }>(
  userId: string, row: T,
): Promise<T> {
  if (row.user_id !== userId) throw new Error("Billing account owner changed");
  return { ...row,
    ...(Object.hasOwn(row, "email") ? { email: await decodeBillingField(
      userId, "email", row.email ?? null) } : {}),
    ...(Object.hasOwn(row, "admin_override_note") ? {
      admin_override_note: await decodeBillingField(userId,
        "admin_override_note", row.admin_override_note ?? null),
    } : {}),
  };
}
