import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import {
  DEFAULT_AGENT_PROVIDER,
  isKnownAgentProvider,
  isLocalAgentProvider,
  resolveProviderBaseUrl,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  LOCAL_ENDPOINT_WITHOUT_API_KEY,
} from "./byok-credentials";
import { decodeUserAiKeyRow, type UserAiKeyRow } from
  "@/lib/server/user-ai-key-content";
import {
  roleUsageKey,
  usageKeyFor,
  type AiSurface,
  type ByokFeatureModels,
  type ByokModelKey,
} from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { providerSupportsModelCapability, type ModelCatalogCapability } from "@/lib/model-catalog-capability";

/**
 * Resolved model endpoint (MIN-46).
 *
 * ENDPOINT — the BYOK credential assigned to the requested model capability,
 * if present (unlimited use, at own expense), otherwise the OpenRouter platform key
 * OPENROUTER_API_KEY. That endpoint only lists models: billed calls resolve
 * their key through `resolveAiRuntime`, which on Minddy Cloud uses the
 * account's own capped key (MIN-761).
 */

// ── Endpoint (provider + base URL + key) ─────────────────────────────────────

export interface UserByok {
  provider: AgentProviderId;
  apiKey: string;
  /** Non-secret row version used to invalidate credential-bound caches. */
  credentialVersion: string;
  /** Effective URL base (register, or custom for 'generic'). */
  baseUrl: string;
  featureModels: ByokFeatureModels;
}

/** A local endpoint cannot serve a call the server makes. */
export class LocalEndpointRequiresLocalRunError extends Error {
  code = "localEndpointRequiresLocalRun" as const;
  constructor() {
    super("This BYOK endpoint is local and can only be used by a local run");
    this.name = "LocalEndpointRequiresLocalRunError";
  }
}

/**
 * Is an unvalidated key recognized NOW? (MIN-344)
 *
 * The normal path sets `validated_at` to registration. There remain two cases where
 * the column is null: lines before MIN-344, and those recorded
 * during a supplier outage (`unknown` verdict). Rather than condemning them, we try again here — on first use — and set the date if the key
 * responds. A key that does not respond remains inert: the account falls back to the key
 * platform and its ceiling, which is exactly the desired behavior.
 *
 * The NEGATIVE result is stored for a few minutes: without that, an account with a dead key
 * would pay a network round trip for each endpoint reading, and a request
 * reads it several times.
 */
const UNVALIDATED_TTL_MS = 5 * 60 * 1000;
const unvalidatedProbes = new Map<string, number>();

async function confirmsUnvalidatedKey(params: {
  userId: string;
  provider: AgentProviderId;
  apiKey: string;
  baseUrl: string;
}): Promise<boolean> {
  const probeKey = `${params.userId}:${params.provider}`;
  const lastFailure = unvalidatedProbes.get(probeKey);
  if (lastFailure && Date.now() - lastFailure < UNVALIDATED_TTL_MS)
    return false;

  const { probeByokKey } = await import("./byok-validate");
  const verdict = await probeByokKey({
    ...params,
    rateLimitKey: params.userId,
  });
  if (verdict !== "valid") {
    unvalidatedProbes.set(probeKey, Date.now());
    return false;
  }
  unvalidatedProbes.delete(probeKey);
  await getServiceClient()
    .from("user_ai_keys")
    .update({ validated_at: new Date().toISOString() })
    .eq("user_id", params.userId)
    .eq("provider", params.provider);
  return true;
}

/**
 * The account credential serving a usage or a provider, decrypted and
 * resolved to an endpoint, or null (= Minddy Cloud).
 *
 * A call type is served by the credential its route names (MIN-826); no
 * route means Minddy Cloud. A surface-level read uses the surface's main call
 * type (`usageKeyFor`). A capability the routed provider does not offer falls
 * back to Minddy Cloud as well.
 *
 * Ignores a row whose URL base is not resolvable (generic without URL), whose
 * key no longer decrypts (secret turned → “reconfigure your key”), or — since
 * MIN-344 — that the provider has never recognized.
 */
async function resolveUserByok(
  userId: string,
  surface: AiSurface | undefined,
  target: { capability: ModelCatalogCapability; provider?: AgentProviderId; usageKey?: ByokModelKey },
): Promise<UserByok | null> {
  const supabase = getServiceClient();
  let aiKeyId: string | null = null;
  if (!target.provider) {
    // Surface-less reads follow the Numo route.
    // A call type follows its role's route (MIN-954): one provider for the
    // LLM, one for embeddings, one for speech to text.
    const usageKey = roleUsageKey(target.usageKey ?? usageKeyFor(surface, target.capability));
    const { data: route } = await supabase
      .from("user_ai_usage_routes")
      .select("ai_key_id")
      .eq("user_id", userId)
      .eq("usage_key", usageKey)
      .maybeSingle();
    aiKeyId = (route as { ai_key_id?: string } | null)?.ai_key_id ?? null;
    if (!aiKeyId) return null;
  }
  let keyQuery = supabase
    .from("user_ai_keys")
    .select(
      "id, user_id, provider, key_encrypted, base_url, validated_at, updated_at, enabled_surfaces, feature_models, encrypted_content, encryption_version, content_revision",
    )
    .eq("user_id", userId);
  keyQuery = target.provider
    ? keyQuery.eq("provider", target.provider)
    : keyQuery.eq("id", aiKeyId!);
  const { data } = await keyQuery.maybeSingle();
  const stored = data as ({
    provider: string;
    key_encrypted: string | null;
    base_url: string | null;
    validated_at: string | null;
    updated_at: string;
    enabled_surfaces: AiSurface[] | null;
    feature_models: ByokFeatureModels | null;
  } & UserAiKeyRow) | null;
  if (!stored) return null;
  const row = await decodeUserAiKeyRow(stored, userId).catch(() => null);
  if (!row) return null;
  if (!isKnownAgentProvider(row.provider) ||
    !providerSupportsModelCapability(row.provider as AgentProviderId, target.capability)) {
    return null;
  }
  const localProvider = isLocalAgentProvider(row.provider);
  // Only the agent surface has an explicit local-execution handoff. Every
  // other surface runs on the server and must ignore a legacy or corrupted
  // local-provider assignment even if it bypassed the database constraint.
  if (localProvider && surface && surface !== "agent") return null;
  const apiKey =
    row.key_encrypted === LOCAL_ENDPOINT_WITHOUT_API_KEY
      ? ""
      : row.key_encrypted;
  // The key remains mandatory for all cloud providers. Locally, Ollama
  // and most OpenAI-compatible servers do not require any: the
  // proxy will then remove the placeholder from opencode instead of sending it.
  if (!apiKey && !localProvider) return null;
  const baseUrl = resolveProviderBaseUrl(row.provider, row.base_url);
  if (!baseUrl) return null;
  // A custom cloud URL database is revalidated for EACH use, not just for
  // the registration (MIN-341): between the two, the DNS of the domain belongs
  // always to the one who seized it, and nothing prevents it from now on pointing
  // on the internal network. A URL that has become unresolvable falls into the same situation
  // that the other unusable lines — we ignore it.
  // The server never resolves a local address: only the LLM proxy and the
  // harness from the desktop app access it.
  if (row.base_url && !localProvider) {
    try {
      await assertPublicHttpUrl(baseUrl);
    } catch {
      return null;
    }
  }
  const provider = row.provider as AgentProviderId;
  if (
    !row.validated_at &&
    !localProvider &&
    !(await confirmsUnvalidatedKey({
      userId,
      provider,
      apiKey: apiKey!,
      baseUrl,
    }))
  ) {
    return null;
  }
  return {
    provider,
    apiKey: apiKey ?? "",
    credentialVersion: stored.updated_at,
    baseUrl,
    featureModels: row.feature_models ?? {},
  };
}

export async function getUserByok(
  userId: string,
  surface?: AiSurface,
  capability: ModelCatalogCapability = "text",
  /** The precise call type; the surface's main one otherwise. */
  usageKey?: ByokModelKey,
): Promise<UserByok | null> {
  return resolveUserByok(userId, surface, { capability, usageKey });
}

/**
 * The account's credential for one provider, whatever the routes say: a Numo
 * conversation set to that provider, or the settings catalog of its models.
 */
export async function getUserByokForProvider(
  userId: string,
  provider: AgentProviderId,
  options: { surface?: AiSurface; capability?: ModelCatalogCapability } = {},
): Promise<UserByok | null> {
  return resolveUserByok(userId, options.surface, {
    capability: options.capability ?? "text",
    provider,
  });
}

/** True if the user has a usable BYOK (→ unlimited use). */
export async function userHasByokKey(
  userId: string,
  surface: AiSurface = "agent",
): Promise<boolean> {
  return (await getUserByok(userId, surface)) != null;
}

export type AgentKeyMode = "platform" | "byok" | "subscription";

export class ManagedAgentServiceUnavailableError extends Error {
  constructor() {
    super(
      "Managed AI is not configured. Configure BYOK or enable MINDDY_MANAGED_AI.",
    );
    this.name = "ManagedAgentServiceUnavailableError";
  }
}

export interface ResolvedAgentEndpoint {
  apiKey: string;
  /** Present only for BYOK and changes when its stored credential is updated. */
  credentialVersion: string | null;
  mode: Exclude<AgentKeyMode, "subscription">;
  provider: AgentProviderId;
  /** OpenAI-compatible base URL, excluding /chat/completions. */
  baseUrl: string;
}

/** Read-only catalog access: listing models spends no credit (MIN-761). */
function resolvePlatformAgentEndpoint(): ResolvedAgentEndpoint {
  if (!isManagedAiEnabled()) throw new ManagedAgentServiceUnavailableError();
  const platform = process.env.OPENROUTER_API_KEY;
  if (!platform) throw new ManagedAgentServiceUnavailableError();
  const baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER);
  return {
    apiKey: platform,
    credentialVersion: null,
    mode: "platform",
    provider: DEFAULT_AGENT_PROVIDER,
    baseUrl: baseUrl!,
  };
}

/**
 * Resolves the effective endpoint: BYOK the user if present (provider + base URL +
 * key), otherwise the OpenRouter platform key. Raised if no platform key.
 */
export async function resolveAgentApiKey(
  userId: string,
  surface: Extract<AiSurface, "agent" | "assistant" | "automations"> = "agent",
  options: {
    allowLocal?: boolean;
    /** This request's `getUserByok(userId, surface)`, when the caller already started it. */
    byok?: Promise<UserByok | null>;
  } = {},
): Promise<ResolvedAgentEndpoint> {
  const byok = await (options.byok ?? getUserByok(userId, surface));
  if (byok) {
    if (isLocalAgentProvider(byok.provider) && !options.allowLocal) {
      throw new LocalEndpointRequiresLocalRunError();
    }
    return {
      apiKey: byok.apiKey,
      credentialVersion: byok.credentialVersion,
      mode: "byok",
      provider: byok.provider,
      baseUrl: byok.baseUrl,
    };
  }
  return resolvePlatformAgentEndpoint();
}
