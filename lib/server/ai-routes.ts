import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  getAgentProvider,
  isKnownAgentProvider,
  isLocalAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  AI_SURFACE_DEFINITIONS,
  MINDDY_CLOUD_PROVIDER,
  ROUTED_AI_SURFACES,
  type AiProviderChoice,
  type RoutedAiSurface,
} from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";
import {
  modelCatalogCapabilityForKey,
  providerSupportsModelCapability,
} from "@/lib/model-catalog-capability";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";
import type { AiProviderOption } from "@/lib/ai-provider-options";

/**
 * Which provider serves each AI usage of an account (MIN-826).
 *
 * A row of `user_ai_surface_routes` routes a usage to one credential; no row
 * means Minddy Cloud. Every usage is independent: Numo can run on a personal
 * key while automations, dictation and feedback stay on Minddy Cloud.
 */

export type AiRoutes = Record<RoutedAiSurface, AiProviderChoice>;

export type { AiProviderOption } from "@/lib/ai-provider-options";

interface KeyRow {
  id: string;
  provider: string;
  validated_at: string | null;
}

/** Model families a usage calls (text, transcription, embedding). */
function surfaceCapabilities(surface: RoutedAiSurface) {
  const definition = AI_SURFACE_DEFINITIONS.find((entry) => entry.id === surface);
  return [...new Set((definition?.modelKeys ?? []).map(modelCatalogCapabilityForKey))];
}

/** A credential can serve a usage when it runs on the server and offers one of its families. */
function keyServesSurface(key: KeyRow, surface: RoutedAiSurface): key is KeyRow & { provider: AgentProviderId } {
  if (!isKnownAgentProvider(key.provider) || isLocalAgentProvider(key.provider)) return false;
  if (!key.validated_at) return false;
  const provider = key.provider;
  return surfaceCapabilities(surface)
    .some((capability) => providerSupportsModelCapability(provider, capability));
}

async function readKeys(userId: string): Promise<KeyRow[]> {
  const { data, error, status } = await getServiceClient().from("user_ai_keys")
    .select("id, provider, validated_at").eq("user_id", userId);
  if (error) throw new DatabaseOperationError("read_ai_keys", error, status);
  return (data ?? []) as KeyRow[];
}

/** The provider of every usage; Minddy Cloud where no route exists. */
export async function getAiRoutes(userId: string): Promise<AiRoutes> {
  const service = getServiceClient();
  const [{ data, error, status }, keys] = await Promise.all([
    service.from("user_ai_surface_routes").select("surface, ai_key_id").eq("user_id", userId),
    readKeys(userId),
  ]);
  if (error) throw new DatabaseOperationError("read_ai_routes", error, status);
  const providerByKey = new Map(keys.map((key) => [key.id, key.provider]));
  const routes = Object.fromEntries(
    ROUTED_AI_SURFACES.map((surface) => [surface, MINDDY_CLOUD_PROVIDER]),
  ) as AiRoutes;
  for (const row of (data ?? []) as Array<{ surface: RoutedAiSurface; ai_key_id: string }>) {
    const provider = providerByKey.get(row.ai_key_id);
    if (provider && isKnownAgentProvider(provider)) routes[row.surface] = provider;
  }
  return routes;
}

/** Providers the account can choose for one usage: Minddy Cloud, then its credentials. */
export async function getAiProviderOptions(
  userId: string,
  surface: RoutedAiSurface,
): Promise<AiProviderOption[]> {
  const capabilities = surfaceCapabilities(surface);
  const keys = (await readKeys(userId)).filter((key) => keyServesSurface(key, surface));
  return [
    ...(isManagedAiEnabled()
      ? [{ id: MINDDY_CLOUD_PROVIDER, label: "minddy Cloud", fallbackCapabilities: [] }]
      : []),
    ...keys.map((key) => ({
      id: key.provider as AgentProviderId,
      label: getAgentProvider(key.provider)?.label ?? key.provider,
      fallbackCapabilities: capabilities.filter(
        (capability) => !providerSupportsModelCapability(key.provider as AgentProviderId, capability),
      ),
    })),
  ];
}

export class AiRouteError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "AiRouteError";
  }
}

/** Routes a usage to a provider; Minddy Cloud removes the route. */
export async function setAiRoute(
  userId: string,
  surface: RoutedAiSurface,
  provider: AiProviderChoice,
): Promise<void> {
  const service = getServiceClient();
  if (provider === MINDDY_CLOUD_PROVIDER) {
    if (!isManagedAiEnabled()) throw new AiRouteError("minddy Cloud is not available on this instance.");
    const { error, status } = await service.from("user_ai_surface_routes")
      .delete().eq("user_id", userId).eq("surface", surface);
    if (error) throw new DatabaseOperationError("delete_ai_route", error, status);
    return;
  }
  const key = (await readKeys(userId)).find((entry) => entry.provider === provider);
  if (!key) throw new AiRouteError("Connect this provider before choosing it.");
  if (!keyServesSurface(key, surface)) throw new AiRouteError("This provider cannot serve this usage.");
  const { error, status } = await service.from("user_ai_surface_routes").upsert({
    user_id: userId, surface, ai_key_id: key.id, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,surface" });
  if (error) throw new DatabaseOperationError("save_ai_route", error, status);
}

/**
 * On an instance without Minddy Cloud, a usage with no route has no provider
 * at all: a newly connected credential takes every usage still unrouted that
 * it can serve. On Minddy Cloud nothing moves until the account chooses.
 */
export async function routeUnservedSurfaces(userId: string, provider: AgentProviderId): Promise<void> {
  if (isManagedAiEnabled()) return;
  const [routes, keys] = await Promise.all([getAiRoutes(userId), readKeys(userId)]);
  const key = keys.find((entry) => entry.provider === provider);
  if (!key) return;
  const surfaces = ROUTED_AI_SURFACES.filter((surface) =>
    routes[surface] === MINDDY_CLOUD_PROVIDER && keyServesSurface(key, surface));
  if (surfaces.length === 0) return;
  const { error, status } = await getServiceClient().from("user_ai_surface_routes").upsert(
    surfaces.map((surface) => ({ user_id: userId, surface, ai_key_id: key.id })),
    { onConflict: "user_id,surface", ignoreDuplicates: true },
  );
  if (error) throw new DatabaseOperationError("save_ai_route", error, status);
}

/** The usages each credential serves, for the key list (`enabled_surfaces`). */
export async function routedSurfacesByKey(userId: string): Promise<Map<string, RoutedAiSurface[]>> {
  const { data, error, status } = await getServiceClient().from("user_ai_surface_routes")
    .select("surface, ai_key_id").eq("user_id", userId);
  if (error) throw new DatabaseOperationError("read_ai_routes", error, status);
  const byKey = new Map<string, RoutedAiSurface[]>();
  for (const row of (data ?? []) as Array<{ surface: RoutedAiSurface; ai_key_id: string }>) {
    byKey.set(row.ai_key_id, [...(byKey.get(row.ai_key_id) ?? []), row.surface]);
  }
  return byKey;
}
