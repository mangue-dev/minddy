import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getBlindIndexKeys } from "./registry";
import { blindIndex, type EncryptionScope } from "./store";

const SCOPE: EncryptionScope = { kind: "system",
  id: "00000000-0000-0000-0000-000000000000" };
const CONTEXT = { scope: SCOPE, table: "provider_operation_reservations",
  column: "resource_key" };

export async function shouldIndexProviderResource(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await service
    .from("provider_operation_resource_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve provider resource protection state");
  }
  return !!data;
}

export async function providerResourceIndex(value: string): Promise<string> {
  if (!value || value.length > 512 || value.startsWith("mdyp1:")) {
    throw new Error("Invalid provider resource key");
  }
  const keys = getBlindIndexKeys();
  const current = await keys.current(SCOPE);
  current.bytes.fill(0);
  const stable = await keys.byVersion(SCOPE, 1);
  try {
    return `mdyp1:${blindIndex(value, CONTEXT, stable.bytes)}`;
  } finally {
    stable.bytes.fill(0);
  }
}
