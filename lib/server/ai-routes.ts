import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  getAgentProvider,
  isKnownAgentProvider,
  isLocalAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  BYOK_MODEL_KEYS,
  MINDDY_CLOUD_PROVIDER,
  type AiProviderChoice,
  type ByokModelKey,
} from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { providerServesModelKey } from "@/lib/model-catalog-capability";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";
import type { AiProviderOption } from "@/lib/ai-provider-options";

/**
 * Which provider serves each AI call type of an account (MIN-826).
 *
 * A row of `user_ai_usage_routes` routes a call type (Numo conversations,
 * conversation titles, Smart Fill, transcription…) to one credential; no row
 * means Minddy Cloud. Every call type is independent: Numo conversations can
 * run on a personal key while their titles and everything else stay on
 * Minddy Cloud.
 */

export type AiRoutes = Record<ByokModelKey, AiProviderChoice>;

interface KeyRow {
  id: string;
  provider: string;
  validated_at: string | null;
}

/** A validated server-side credential whose provider can serve the call type. */
function keyServesUsage(key: KeyRow, usageKey: ByokModelKey): key is KeyRow & { provider: AgentProviderId } {
  if (!isKnownAgentProvider(key.provider) || isLocalAgentProvider(key.provider)) return false;
  return !!key.validated_at && providerServesModelKey(key.provider, usageKey);
}

async function readKeys(userId: string): Promise<KeyRow[]> {
  const { data, error, status } = await getServiceClient().from("user_ai_keys")
    .select("id, provider, validated_at").eq("user_id", userId);
  if (error) throw new DatabaseOperationError("read_ai_keys", error, status);
  return (data ?? []) as KeyRow[];
}

async function readRoutes(userId: string): Promise<Array<{ usage_key: ByokModelKey; ai_key_id: string }>> {
  const { data, error, status } = await getServiceClient().from("user_ai_usage_routes")
    .select("usage_key, ai_key_id").eq("user_id", userId);
  if (error) throw new DatabaseOperationError("read_ai_routes", error, status);
  return (data ?? []) as Array<{ usage_key: ByokModelKey; ai_key_id: string }>;
}

/** The provider of every call type; Minddy Cloud where no route exists. */
export async function getAiRoutes(userId: string): Promise<AiRoutes> {
  const [rows, keys] = await Promise.all([readRoutes(userId), readKeys(userId)]);
  const providerByKey = new Map(keys.map((key) => [key.id, key.provider]));
  const routes = Object.fromEntries(
    BYOK_MODEL_KEYS.map((usageKey) => [usageKey, MINDDY_CLOUD_PROVIDER]),
  ) as AiRoutes;
  for (const row of rows) {
    const provider = providerByKey.get(row.ai_key_id);
    if (provider && isKnownAgentProvider(provider)) routes[row.usage_key] = provider;
  }
  return routes;
}

function optionsFor(keys: KeyRow[], usageKey: ByokModelKey): AiProviderOption[] {
  return [
    ...(isManagedAiEnabled() ? [{ id: MINDDY_CLOUD_PROVIDER, label: "minddy Cloud" }] : []),
    ...keys.filter((key) => keyServesUsage(key, usageKey)).map((key) => ({
      id: key.provider as AgentProviderId,
      label: getAgentProvider(key.provider)?.label ?? key.provider,
    })),
  ];
}

/** Providers the account can choose for one call type: Minddy Cloud, then its credentials. */
export async function getAiProviderOptions(
  userId: string,
  usageKey: ByokModelKey,
): Promise<AiProviderOption[]> {
  return optionsFor(await readKeys(userId), usageKey);
}

/** Providers the account can choose for every call type, from one key read. */
export async function getAllAiProviderOptions(userId: string): Promise<Record<ByokModelKey, AiProviderOption[]>> {
  const keys = await readKeys(userId);
  return Object.fromEntries(BYOK_MODEL_KEYS.map((usageKey) => [usageKey, optionsFor(keys, usageKey)])) as
    Record<ByokModelKey, AiProviderOption[]>;
}

export class AiRouteError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "AiRouteError";
  }
}

/** Routes a call type to a provider; Minddy Cloud removes the route. */
export async function setAiRoute(
  userId: string,
  usageKey: ByokModelKey,
  provider: AiProviderChoice,
): Promise<void> {
  const service = getServiceClient();
  if (provider === MINDDY_CLOUD_PROVIDER) {
    if (!isManagedAiEnabled()) throw new AiRouteError("minddy Cloud is not available on this instance.");
    const { error, status } = await service.from("user_ai_usage_routes")
      .delete().eq("user_id", userId).eq("usage_key", usageKey);
    if (error) throw new DatabaseOperationError("delete_ai_route", error, status);
    return;
  }
  const key = (await readKeys(userId)).find((entry) => entry.provider === provider);
  if (!key) throw new AiRouteError("Connect this provider before choosing it.");
  if (!keyServesUsage(key, usageKey)) throw new AiRouteError("This provider cannot serve this usage.");
  const { error, status } = await service.from("user_ai_usage_routes").upsert({
    user_id: userId, usage_key: usageKey, ai_key_id: key.id, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,usage_key" });
  if (error) throw new DatabaseOperationError("save_ai_route", error, status);
}

/**
 * On an instance without Minddy Cloud, a call type with no route has no
 * provider at all: a newly connected credential takes every call type still
 * unrouted that it can serve. On Minddy Cloud nothing moves until the account
 * chooses.
 */
export async function routeUnservedUsages(userId: string, provider: AgentProviderId): Promise<void> {
  if (isManagedAiEnabled()) return;
  const [routes, keys] = await Promise.all([getAiRoutes(userId), readKeys(userId)]);
  const key = keys.find((entry) => entry.provider === provider);
  if (!key) return;
  const usageKeys = BYOK_MODEL_KEYS.filter((usageKey) =>
    routes[usageKey] === MINDDY_CLOUD_PROVIDER && keyServesUsage(key, usageKey));
  if (usageKeys.length === 0) return;
  const { error, status } = await getServiceClient().from("user_ai_usage_routes").upsert(
    usageKeys.map((usageKey) => ({ user_id: userId, usage_key: usageKey, ai_key_id: key.id })),
    { onConflict: "user_id,usage_key", ignoreDuplicates: true },
  );
  if (error) throw new DatabaseOperationError("save_ai_route", error, status);
}

/** The call types each credential serves, for the key list. */
export async function routedUsagesByKey(userId: string): Promise<Map<string, ByokModelKey[]>> {
  const byKey = new Map<string, ByokModelKey[]>();
  for (const row of await readRoutes(userId)) {
    byKey.set(row.ai_key_id, [...(byKey.get(row.ai_key_id) ?? []), row.usage_key]);
  }
  return byKey;
}
