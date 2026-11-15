import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { routeUnservedUsages, routedUsagesByKey } from "@/lib/server/ai-routes";
import { surfaceForModelKey } from "@/lib/ai-surfaces";
import { randomUUID } from "node:crypto";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import { encryptUserAiKey, keyPrefix } from "@/lib/server/agent/byok-credentials";
import { decodeUserAiKeyRow, encodeUserAiKeyRow,
  shouldProtectUserAiKeys, type UserAiKeyRow } from
  "@/lib/server/user-ai-key-content";
import {
  BYOK_PROBE_RETRY_AFTER_SECONDS,
  probeByokKey,
} from "@/lib/server/agent/byok-validate";
import {
  getAgentProvider,
  isKnownAgentProvider,
  isRetiredLocalProvider,
  normalizeBaseUrl,
  resolveProviderBaseUrl,
} from "@/lib/agent-providers";
import { parseByokFeatureModels } from "@/lib/ai-surfaces";
import { BYOK_MODEL_KEYS } from "@/lib/ai-surfaces";
import { resolveByokFeatureDefaultModel } from "@/lib/server/ai-runtime";
import type { AgentProviderId } from "@/lib/agent-providers";
import type { ByokFeatureModels } from "@/lib/ai-surfaces";
import type { ModelCatalogCapability } from "@/lib/model-catalog-capability";
import {
  byokCapabilitiesForProvider,
  isModelCatalogCapability,
  modelCatalogCapabilityForKey,
  providerSupportsModelKey,
  providerSupportsModelCapability,
} from "@/lib/model-catalog-capability";
import { stripModelSuffix } from "@/lib/ai-model-config";
import { getActiveByokModelCatalog } from "@/lib/server/agent/models-catalog";

/**
 * Account BYOK credentials (MIN-46 / MIN-10 / MIN-573). An account may keep
 * several providers and assigns each model capability to at most one of them.
 * The plaintext key is NEVER returned — only provider,
 * key_prefix, and base_url. Writes use the service client (RLS is read-owner);
 * the key is encrypted at rest
 * (AES-256-GCM). Changing or removing the provider leaves the account worker
 * preference untouched; the provider-bound resolver fails closed until the
 * user deliberately chooses a compatible model in Account settings.
 *
 * The local providers retired in MIN-996 are refused on creation. A row saved
 * before keeps being listed (its provider outside the registry, so it serves
 * nothing) until its owner removes it.
 */

const STORED =
  "id, user_id, provider, key_encrypted, key_prefix, base_url, created_at, updated_at, last_used_at, validated_at, feature_models, encrypted_content, encryption_version, content_revision";

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
  feature_models: ByokFeatureModels;
}

async function sanitizedAiKey(row: UserAiKeyRow, actorId: string):
  Promise<SanitizedAiKeyRow> {
  const plain = await decodeUserAiKeyRow(row, actorId);
  return { id: plain.id, provider: plain.provider,
    key_prefix: plain.key_prefix as string | null,
    base_url: plain.base_url,
    created_at: plain.created_at as string,
    updated_at: plain.updated_at as string,
    last_used_at: plain.last_used_at as string | null,
    validated_at: plain.validated_at as string | null,
    feature_models: plain.feature_models as ByokFeatureModels };
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
  // A call type's credential is its route (MIN-826); `enabled_surfaces`
  // reports the surfaces with at least one call type routed to each credential.
  const [{ data }, { data: assignments }, routed] = await Promise.all([
    service
      .from("user_ai_keys")
      .select(STORED)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }),
    service
      .from("user_ai_capability_assignments")
      .select("ai_key_id, capability")
      .eq("user_id", auth.user.id),
    routedUsagesByKey(auth.user.id),
  ]);
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
    (data ?? []).map(async (row) => ({
      ...await decorateAiKey(
        await sanitizedAiKey(row as UserAiKeyRow, auth.user.id),
        assignedByKey.get(row.id),
      ),
      enabled_surfaces: [...new Set((routed.get(row.id) ?? []).map(surfaceForModelKey))],
    })),
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
  if (isRetiredLocalProvider(provider)) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json(
      { error: t("aiLocalProviderRetired"), code: "local_provider_retired" },
      { status: 400 },
    );
  }
  if (!isKnownAgentProvider(provider)) {
    return NextResponse.json(
      { error: "Unsupported provider" },
      { status: 400 },
    );
  }
  if (!key)
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (key.length > MAX_KEY_LENGTH) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  // The generic provider needs a base URL, held to the anti-SSRF guard.
  const def = getAgentProvider(provider)!;
  let baseUrl: string | null = null;
  if (def.requiresBaseUrl) {
    const raw = typeof body.base_url === "string" ? body.base_url.trim() : "";
    if (raw.length > MAX_BASE_URL_LENGTH || !isHttpEndpointUrl(raw)) {
      return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
    }
    try {
      await assertPublicHttpUrl(raw);
    } catch {
      return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
    }
    baseUrl = normalizeBaseUrl(raw);
  }

  // The key is presented to the provider before being stored (MIN-344): its
  // mere presence lifts the usage ceiling. A clear refusal (401/403) goes back
  // to the user at once, since a dead key helps nobody. An `unknown` verdict
  // (provider unreachable) stores the key without a validation date: it lifts
  // nothing, and `getUserByok` tries again on first use.
  const effectiveBaseUrl = resolveProviderBaseUrl(provider, baseUrl);
  const verdict = effectiveBaseUrl
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

  const service = getServiceClient();
  let data: UserAiKeyRow | null = null;
  let error: { code?: string; message: string } | null = null;
  const validatedAt = verdict === "valid" ? new Date().toISOString() : null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await service.from("user_ai_keys").select(STORED)
      .eq("user_id", auth.user.id).eq("provider", provider)
      .maybeSingle();
    if (existing.error) { error = existing.error; break; }
    const previous = existing.data as UserAiKeyRow | null;
    const protect = Number(previous?.encryption_version ?? 0) > 0 ||
      await shouldProtectUserAiKeys(service);
    if (protect) {
      try {
        const plain = previous
          ? await decodeUserAiKeyRow(previous, auth.user.id) : null;
        const encoded = await encodeUserAiKeyRow({
          ...plain, id: previous?.id ?? randomUUID(),
          user_id: auth.user.id, provider,
          key_encrypted: key,
          base_url: baseUrl,
          feature_models: plain?.feature_models ?? {},
        } as UserAiKeyRow, { service, force: true });
        const result = await service.rpc("upsert_user_ai_key_protected", {
          p_user_id: auth.user.id, p_provider: provider,
          p_id: encoded.id,
          p_revision: previous?.content_revision ?? 0,
          p_encrypted_content: encoded.encrypted_content,
          p_encryption_version: encoded.encryption_version,
          p_key_prefix: keyPrefix(key),
          p_validated_at: validatedAt,
        }).select(STORED).single();
        if (result.error?.code === "40001" && attempt === 0) continue;
        data = result.data as UserAiKeyRow | null;
        error = result.error;
      } catch {
        error = { message: "Protected BYOK write failed" };
      }
    } else {
      let encrypted: string;
      try {
        encrypted = encryptUserAiKey(key);
      } catch {
        error = { message: "Legacy BYOK encryption is unavailable" };
        break;
      }
      const result = await service.rpc("upsert_user_ai_key", {
        p_user_id: auth.user.id, p_provider: provider,
        p_key_encrypted: encrypted,
        p_key_prefix: keyPrefix(key),
        p_base_url: baseUrl, p_validated_at: validatedAt,
      }).select(STORED).single();
      data = result.data as UserAiKeyRow | null;
      error = result.error;
    }
    break;
  }
  if (error || !data) {
    if (error?.code === "40001") {
      return NextResponse.json(
        { error: "BYOK configuration changed; retry" },
        { status: 409 },
      );
    }
    console.error("[api/account/ai-keys] upsert failed:", error?.message);
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("aiKeySaveFailed") }, { status: 500 });
  }

  if (data.validated_at && isKnownAgentProvider(data.provider)) {
    await routeUnservedUsages(auth.user.id, data.provider as AgentProviderId);
  }
  const { data: assignments } = await service
    .from("user_ai_capability_assignments")
    .select("capability")
    .eq("user_id", auth.user.id)
    .eq("ai_key_id", data.id);
  const assignedCapabilities = (Array.isArray(assignments) ? assignments : [])
    .map((assignment) => (assignment as { capability: string }).capability)
    .filter(isModelCatalogCapability);
  return NextResponse.json({
    key: await decorateAiKey(await sanitizedAiKey(data, auth.user.id),
      assignedCapabilities),
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
 * Non-sensitive BYOK settings: the capability assignment, or a credential's
 * model overrides. A supplied `feature_models` replaces the whole set, which
 * is what lets the account clear every override.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: {
    key_id?: unknown;
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
    .select(STORED)
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
  if (!("feature_models" in body)) {
    return NextResponse.json(
      { error: "No preference supplied" },
      { status: 400 },
    );
  }
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
  // An embedding or transcription field must name a model of that kind:
  // a chat id there is refused by the provider on every call, and indexing
  // or dictation degrade silently. The key's own catalog is the evidence;
  // when it cannot be listed, the choice is kept unverified.
  for (const [modelKey, model] of Object.entries(models)) {
    const capability = modelCatalogCapabilityForKey(modelKey);
    if (capability === "text") continue;
    const catalog = await getActiveByokModelCatalog(auth.user.id, capability, activeProvider);
    if (catalog.models.length > 0 &&
      !catalog.models.some((entry) => entry.id === stripModelSuffix(model))) {
      return NextResponse.json(
        { error: "Model type does not match this setting", code: "capability_mismatch" },
        { status: 400 },
      );
    }
  }

  let data: UserAiKeyRow | null = null;
  let error: { code?: string; message: string } | null = null;
  const protect = Number((active as UserAiKeyRow).encryption_version ?? 0) > 0 ||
    await shouldProtectUserAiKeys(service);
  if (protect) {
    try {
      const plain = await decodeUserAiKeyRow(active as UserAiKeyRow,
        auth.user.id);
      const encoded = await encodeUserAiKeyRow({ ...plain,
        feature_models: Object.fromEntries(Object.entries(models)
          .filter(([name]) => !["agent_model", "automation_agent_model",
            "pr_review_model"].includes(name))) }, { service, force: true });
      const result = await service.rpc(
        "update_user_ai_key_preferences_protected", {
          p_user_id: auth.user.id, p_key_id: body.key_id,
          p_revision: (active as UserAiKeyRow).content_revision ?? 0,
          p_encrypted_content: encoded.encrypted_content,
          p_encryption_version: encoded.encryption_version,
        }).select(STORED).maybeSingle();
      data = result.data as UserAiKeyRow | null;
      error = result.error;
    } catch {
      error = { message: "Protected BYOK preference update failed" };
    }
  } else {
    const result = await service.rpc("update_user_ai_key_preferences", {
      p_user_id: auth.user.id,
      p_key_id: body.key_id,
      p_feature_models: models,
    }).select(STORED).maybeSingle();
    data = result.data as UserAiKeyRow | null;
    error = result.error;
  }
  if (error) {
    if (error.code === "40001") {
      return NextResponse.json(
        { error: "BYOK configuration changed; retry" },
        { status: 409 },
      );
    }
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
      await sanitizedAiKey(data, auth.user.id),
      (Array.isArray(assignments) ? assignments : [])
        .map((assignment) => (assignment as { capability: string }).capability)
        .filter(isModelCatalogCapability),
    ),
  });
}
