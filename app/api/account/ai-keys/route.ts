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

/**
 * Account “BYOK” key (MIN-46 / MIN-10). ONE active provider: OpenRouter,
 * OpenAI, Anthropic, Google, a generic OpenAI-compatible endpoint or a
 * local endpoint (OpenAI-compatible / Ollama). Reconfiguring replaces the
 * other providers. The plaintext key is NEVER returned — only provider,
 * key_prefix, and base_url. Writes use the service client (RLS is read-owner);
 * the key is encrypted at rest
 * (AES-256-GCM). Changing/removing the provider resets the default model
 * because it belonged to the previous provider's namespace.
 */

const SANITIZED =
  "id, provider, key_prefix, base_url, created_at, last_used_at, validated_at, enabled_surfaces, feature_models";

// Wide bounds: an actual API key and base URL fit well below.
const MAX_KEY_LENGTH = 1024;
const MAX_BASE_URL_LENGTH = 2048;

/**
 * Local endpoints are never reached from this route: check their
 * host by `assertPublicHttpUrl` would be both false (localhost is intended) and
 * dangerous (a future server probe would become an SSRF). We only validate
 * the form that the local harness will use.
 */
function isHttpEndpointUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

/** Clears the personal model default (obsolete when the provider changes). */
async function clearDefaultModel(service: ReturnType<typeof getServiceClient>, userId: string) {
  await service
    .from("user_agent_preferences")
    .update({ default_model: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
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
  const keys = await Promise.all(
    (data ?? []).map(async (row) => {
      const resolvedEntries = await Promise.all(
        BYOK_MODEL_KEYS.map(async (modelKey) => [
          modelKey,
          await resolveByokFeatureDefaultModel(row.provider as AgentProviderId, modelKey),
        ] as const),
      );
      return {
        ...row,
        resolved_feature_models: Object.fromEntries(
          resolvedEntries.filter((entry) => entry[1] !== null),
        ),
      };
    }),
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
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  if (!isKnownAgentProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }
  const localProvider = isLocalAgentProvider(provider);
  // An Ollama installation or a local OpenAI-compatible server has most
  // often no authentication. An empty key is therefore ONLY valid
  // for these providers: all cloud endpoints remain fail-closed.
  if (!key && !localProvider) return NextResponse.json({ error: "Missing key" }, { status: 400 });
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
        return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
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
      return NextResponse.json({ error: "BYOK is not configured on the server" }, { status: 503 });
    }
  }

  const service = getServiceClient();

  const { data, error } = await service
    .rpc("replace_user_ai_key", {
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

  return NextResponse.json({ key: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const service = getServiceClient();
  // Single-active: we remove the BYOK (whatever the provider) and we put it back
  // model default to zero (it could target a model outside the platform provider).
  await service.from("user_ai_keys").delete().eq("user_id", auth.user.id);
  await clearDefaultModel(service, auth.user.id);
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

  let body: { enabled_surfaces?: unknown; feature_models?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const service = getServiceClient();
  const { data: active } = await service
    .from("user_ai_keys")
    .select("provider")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const activeProvider = (active as { provider?: string } | null)?.provider;
  if (!activeProvider) {
    return NextResponse.json({ error: "No BYOK key configured" }, { status: 404 });
  }
  const localProvider = isLocalAgentProvider(activeProvider);
  const update: { enabled_surfaces?: string[]; feature_models?: Record<string, string> } = {};
  if ("enabled_surfaces" in body) {
    const surfaces = parseAiSurfaces(body.enabled_surfaces);
    if (!surfaces) return NextResponse.json({ error: "Invalid AI surfaces" }, { status: 400 });
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
    if (!models) return NextResponse.json({ error: "Invalid feature models" }, { status: 400 });
    update.feature_models = models;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No preference supplied" }, { status: 400 });
  }

  const { data, error } = await service
    .rpc("update_user_ai_key_preferences", {
      p_user_id: auth.user.id,
      p_expected_provider: activeProvider,
      p_enabled_surfaces: update.enabled_surfaces ?? null,
      p_feature_models: update.feature_models ?? null,
    })
    .select(SANITIZED)
    .maybeSingle();
  if (error) {
    console.error("[api/account/ai-keys] preferences update failed:", error.message);
    return NextResponse.json({ error: "Could not save BYOK preferences" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "BYOK configuration changed; retry" }, { status: 409 });
  }
  return NextResponse.json({ key: data });
}
