import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import {
  encryptUserAiKey,
  keyPrefix,
  LOCAL_ENDPOINT_WITHOUT_API_KEY,
} from "@/lib/server/agent/byok-credentials";
import {
  BYOK_PROBE_RETRY_AFTER_SECONDS,
  probeByokKey,
} from "@/lib/server/agent/byok-validate";
import {
  getAgentProvider,
  isLocalAgentProvider,
  isKnownAgentProvider,
  normalizeBaseUrl,
  resolveProviderBaseUrl,
} from "@/lib/agent-providers";
import { parseAiSurfaces, parseByokFeatureModels } from "@/lib/ai-surfaces";
import { BYOK_MODEL_KEYS } from "@/lib/ai-surfaces";
import { resolveByokFeatureDefaultModel } from "@/lib/server/ai-runtime";
import type { AgentProviderId } from "@/lib/agent-providers";
import type { ByokFeatureModels } from "@/lib/ai-surfaces";
import type { ModelCatalogCapability } from "@/lib/model-catalog-capability";
import {
  byokCapabilitiesForProvider,
  isModelCatalogCapability,
  providerSupportsModelKey,
  providerSupportsModelCapability,
} from "@/lib/model-catalog-capability";

/**
 * Account BYOK credentials (MIN-46 / MIN-10 / MIN-573). An account may keep
 * several providers and assigns each model capability to at most one of them.
 * The plaintext key is NEVER returned — only provider,
 * key_prefix, and base_url. Writes use the service client (RLS is read-owner);
 * the key is encrypted at rest
 * (AES-256-GCM). Changing or removing the provider leaves the account worker
 * preference untouched; the provider-bound resolver fails closed until the
 * user deliberately chooses a compatible model in Account settings.
 */

const SANITIZED =
  "id, provider, key_prefix, base_url, created_at, updated_at, last_used_at, validated_at, enabled_surfaces, feature_models";

// Wide bounds: an actual API key and base URL fit well below.
const MAX_KEY_LENGTH = 1024;
const MAX_BASE_URL_LENGTH = 2048;

interface SanitizedAiKeyRow {
  id: string;
  provider: string;
  key_prefix: string | null;
  base_url: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  validated_at: string | null;
  enabled_surfaces: string[];
  feature_models: ByokFeatureModels;
}

function supportedFeatureModels(
  provider: AgentProviderId,
  featureModels: ByokFeatureModels | null | undefined,
): ByokFeatureModels {
  return Object.fromEntries(
    Object.entries(featureModels ?? {}).filter(([modelKey]) =>
      providerSupportsModelKey(provider, modelKey),
    ),
  ) as ByokFeatureModels;
}

async function decorateAiKey(
  row: SanitizedAiKeyRow,
  assignedCapabilities: readonly ModelCatalogCapability[] = [],
) {
  if (!isKnownAgentProvider(row.provider)) {
    return {
      ...row,
      feature_models: {},
      supported_capabilities: [],
      assigned_capabilities: [],
      resolved_feature_models: {},
    };
  }
  const provider = row.provider as AgentProviderId;
  const resolvedEntries = await Promise.all(
    BYOK_MODEL_KEYS.filter((modelKey) =>
      providerSupportsModelKey(provider, modelKey),
    ).map(
      async (modelKey) =>
        [
          modelKey,
          await resolveByokFeatureDefaultModel(provider, modelKey),
        ] as const,
    ),
  );
  return {
    ...row,
    feature_models: supportedFeatureModels(provider, row.feature_models),
    supported_capabilities: byokCapabilitiesForProvider(provider),
    assigned_capabilities: assignedCapabilities,
    resolved_feature_models: Object.fromEntries(
      resolvedEntries.filter((entry) => entry[1] !== null),
    ),
  };
}

/**
 * Local endpoints are never reached from this route: check their
 * host by `assertPublicHttpUrl` would be both false (localhost is intended) and
 * dangerous (a future server probe would become an SSRF). We only validate
 * the form that the local harness will use.
 */
function isHttpEndpointUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const service = getServiceClient();
  const { data } = await service
    .from("user_ai_keys")
    .select(SANITIZED)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  const { data: assignments } = await service
    .from("user_ai_capability_assignments")
    .select("ai_key_id, capability")
    .eq("user_id", auth.user.id);
  const assignedByKey = new Map<string, ModelCatalogCapability[]>();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const row = assignment as { ai_key_id: string; capability: string };
    if (!isModelCatalogCapability(row.capability)) continue;
    assignedByKey.set(row.ai_key_id, [
      ...(assignedByKey.get(row.ai_key_id) ?? []),
      row.capability,
    ]);
  }
  const keys = await Promise.all(
    (data ?? []).map((row) =>
      decorateAiKey(
        row as SanitizedAiKeyRow,
        assignedByKey.get((row as SanitizedAiKeyRow).id),
      ),
    ),
  );
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { key?: string; provider?: string; base_url?: string };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { key?: string; provider?: string; base_url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const provider =
    typeof body.provider === "string" ? body.provider.trim() : "";
  if (!isKnownAgentProvider(provider)) {
    return NextResponse.json(
      { error: "Unsupported provider" },
      { status: 400 },
    );
  }
  const localProvider = isLocalAgentProvider(provider);
  // An Ollama installation or a local OpenAI-compatible server has most
  // often no authentication. An empty key is therefore ONLY valid
  // for these providers: all cloud endpoints remain fail-closed.
  if (!key && !localProvider)
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (key.length > MAX_KEY_LENGTH) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  // Base URL required for the generic provider and local providers. A URL
  // cloud remains subject to anti-SSRF guard; a local URL will NEVER go outside
  // this machine and should therefore never be resolved or probed by this server.
  const def = getAgentProvider(provider)!;
  let baseUrl: string | null = null;
  if (def.requiresBaseUrl) {
    const raw = typeof body.base_url === "string" ? body.base_url.trim() : "";
    if (raw.length > MAX_BASE_URL_LENGTH || !isHttpEndpointUrl(raw)) {
      return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
    }
    if (!localProvider) {
      try {
        await assertPublicHttpUrl(raw);
      } catch {
        return NextResponse.json(
          { error: "Invalid base URL" },
          { status: 400 },
        );
      }
    }
    baseUrl = normalizeBaseUrl(raw);
  }

  // The key is PRESENTED to the supplier before being registered (MIN-344): its
  // mere presence on base lifted any usage ceiling, including that of
  // compute of the microVM, which minddy pays for. A frank refusal (401/403) is a fact
  // which is returned to the user immediately — registering a dead key does not
  // help either now or on the first run. An `unknown` verdict
  // (supplier unreachable) saves the key WITHOUT validation date: it does not
  // raises nothing, and `getUserByok` will try again on first use.
  const effectiveBaseUrl = resolveProviderBaseUrl(provider, baseUrl);
  // A local endpoint is deliberately opaque to the cloud: no listing or
  // probe should only bring this query out of the desktop app. The key is
  // considered configured so that the local run can receive it; the first
  // Calling the proxy will return an explicit error if the endpoint is unavailable.
  const verdict = localProvider
    ? "valid"
    : effectiveBaseUrl
      ? await probeByokKey({
          provider,
          apiKey: key,
          baseUrl: effectiveBaseUrl,
          rateLimitKey: auth.user.id,
        })
      : "unknown";
  if (verdict === "rate_limited") {
    return NextResponse.json(
      {
        error: "Too many provider validation requests",
        retry_after: BYOK_PROBE_RETRY_AFTER_SECONDS,
      },
      {
        status: 429,
        headers: { "Retry-After": String(BYOK_PROBE_RETRY_AFTER_SECONDS) },
      },
    );
  }
  if (verdict === "invalid") {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("aiKeyRejected") }, { status: 400 });
  }

  // `user_ai_keys.key_encrypted` is NOT NULL on instances already
  // deployed. A local endpoint without authentication has no secrets
  // encrypt: persist a non-sensitive marker understood by
  // `getUserByok`, rather than a NULL which would cause the save to fail.
  let encrypted = LOCAL_ENDPOINT_WITHOUT_API_KEY;
  if (key) {
    try {
      encrypted = encryptUserAiKey(key);
    } catch {
      // Missing AI_KEY_ENCRYPTION_SECRET → fail closed (never store plaintext).
      return NextResponse.json(
        { error: "BYOK is not configured on the server" },
        { status: 503 },
      );
    }
  }

  const service = getServiceClient();

  const { data, error } = await service
    .rpc("upsert_user_ai_key", {
      p_user_id: auth.user.id,
      p_provider: provider,
      p_key_encrypted: encrypted,
      p_key_prefix: key ? keyPrefix(key) : null,
      p_base_url: baseUrl,
      p_validated_at: verdict === "valid" ? new Date().toISOString() : null,
    })
    .select(SANITIZED)
    .single();
  if (error || !data) {
    console.error("[api/account/ai-keys] upsert failed:", error?.message);
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("aiKeySaveFailed") }, { status: 500 });
  }

  const { data: assignments } = await service
    .from("user_ai_capability_assignments")
    .select("capability")
    .eq("user_id", auth.user.id)
    .eq("ai_key_id", (data as SanitizedAiKeyRow).id);
  const assignedCapabilities = (Array.isArray(assignments) ? assignments : [])
    .map((assignment) => (assignment as { capability: string }).capability)
    .filter(isModelCatalogCapability);
  return NextResponse.json({
    key: await decorateAiKey(data as SanitizedAiKeyRow, assignedCapabilities),
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const keyId = request.nextUrl.searchParams.get("id")?.trim();
  if (!keyId)
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });

  const service = getServiceClient();
  const { data, error } = await service.rpc("delete_user_ai_key", {
    p_user_id: auth.user.id,
    p_key_id: keyId,
  });
  if (error) {
    console.error("[api/account/ai-keys] delete failed:", error.message);
    return NextResponse.json(
      { error: "Could not remove BYOK credential" },
      { status: 500 },
    );
  }
  if (!data)
    return NextResponse.json(
      { error: "BYOK credential not found" },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}

/**
 * Non-sensitive active BYOK settings. The writing is partial but each
 * provided value replaces its complete set: this is what makes it possible to
 * Uncheck all surfaces or clear all model overrides.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: {
    key_id?: unknown;
    enabled_surfaces?: unknown;
    feature_models?: unknown;
    capability?: unknown;
    assigned_key_id?: unknown;
  };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const service = getServiceClient();
  if ("capability" in body || "assigned_key_id" in body) {
    if (
      typeof body.capability !== "string" ||
      !isModelCatalogCapability(body.capability) ||
      (body.assigned_key_id !== null &&
        typeof body.assigned_key_id !== "string")
    ) {
      return NextResponse.json(
        { error: "Invalid capability assignment" },
        { status: 400 },
      );
    }
    if (typeof body.assigned_key_id === "string") {
      const { data: target } = await service
        .from("user_ai_keys")
        .select("provider")
        .eq("id", body.assigned_key_id)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      const provider = (target as { provider?: string } | null)?.provider;
      if (
        !provider ||
        !isKnownAgentProvider(provider) ||
        !providerSupportsModelCapability(provider, body.capability)
      ) {
        return NextResponse.json(
          { error: "Provider does not support model capability" },
          { status: 400 },
        );
      }
    }
    const { error } = await service.rpc("set_user_ai_capability_assignment", {
      p_user_id: auth.user.id,
      p_capability: body.capability,
      p_key_id: body.assigned_key_id ?? null,
    });
    if (error) {
      console.error(
        "[api/account/ai-keys] assignment update failed:",
        error.message,
      );
      return NextResponse.json(
        { error: "Could not save BYOK assignment" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof body.key_id !== "string" || !body.key_id.trim()) {
    return NextResponse.json({ error: "Missing key id" }, { status: 400 });
  }
  const { data: active } = await service
    .from("user_ai_keys")
    .select("provider")
    .eq("id", body.key_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const activeProviderValue = (active as { provider?: string } | null)
    ?.provider;
  if (!activeProviderValue || !isKnownAgentProvider(activeProviderValue)) {
    return NextResponse.json(
      { error: "No BYOK key configured" },
      { status: 404 },
    );
  }
  const activeProvider = activeProviderValue;
  const localProvider = isLocalAgentProvider(activeProvider);
  const update: {
    enabled_surfaces?: string[];
    feature_models?: Record<string, string>;
  } = {};
  if ("enabled_surfaces" in body) {
    const surfaces = parseAiSurfaces(body.enabled_surfaces);
    if (!surfaces)
      return NextResponse.json(
        { error: "Invalid AI surfaces" },
        { status: 400 },
      );
    if (localProvider && surfaces.some((surface) => surface !== "agent")) {
      return NextResponse.json(
        { error: "Local endpoints are available only for local agent runs" },
        { status: 400 },
      );
    }
    update.enabled_surfaces = surfaces;
  }
  if ("feature_models" in body) {
    const models = parseByokFeatureModels(body.feature_models);
    if (!models)
      return NextResponse.json(
        { error: "Invalid feature models" },
        { status: 400 },
      );
    if (
      Object.keys(models).some(
        (modelKey) => !providerSupportsModelKey(activeProvider, modelKey),
      )
    ) {
      return NextResponse.json(
        { error: "Model type is not supported by the active BYOK provider" },
        { status: 400 },
      );
    }
    update.feature_models = models;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No preference supplied" },
      { status: 400 },
    );
  }

  const { data, error } = await service
    .rpc("update_user_ai_key_preferences", {
      p_user_id: auth.user.id,
      p_key_id: body.key_id,
      p_enabled_surfaces: update.enabled_surfaces ?? null,
      p_feature_models: update.feature_models ?? null,
    })
    .select(SANITIZED)
    .maybeSingle();
  if (error) {
    console.error(
      "[api/account/ai-keys] preferences update failed:",
      error.message,
    );
    return NextResponse.json(
      { error: "Could not save BYOK preferences" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "BYOK configuration changed; retry" },
      { status: 409 },
    );
  }
  const { data: assignments } = await service
    .from("user_ai_capability_assignments")
    .select("capability")
    .eq("user_id", auth.user.id)
    .eq("ai_key_id", body.key_id);
  return NextResponse.json({
    key: await decorateAiKey(
      data as SanitizedAiKeyRow,
      (Array.isArray(assignments) ? assignments : [])
        .map((assignment) => (assignment as { capability: string }).capability)
        .filter(isModelCatalogCapability),
    ),
  });
}
