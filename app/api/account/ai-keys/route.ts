import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import { encryptUserAiKey, keyPrefix } from "@/lib/server/agent/byok-credentials";
import { probeByokKey } from "@/lib/server/agent/byok-validate";
import {
  getAgentProvider,
  isKnownAgentProvider,
  normalizeBaseUrl,
  resolveProviderBaseUrl,
} from "@/lib/agent-providers";
import { parseAiSurfaces, parseByokFeatureModels } from "@/lib/ai-surfaces";
import { BYOK_MODEL_KEYS } from "@/lib/ai-surfaces";
import { resolveByokFeatureDefaultModel } from "@/lib/server/ai-runtime";
import type { AgentProviderId } from "@/lib/agent-providers";

/**
 * Clé « BYOK » du compte (MIN-46 / MIN-10). UN seul provider actif : OpenRouter,
 * OpenAI, Anthropic, Google ou un endpoint OpenAI-compatible générique (avec sa
 * base URL). Reconfigurer = remplacer (on efface les autres). La clé en clair
 * n'est JAMAIS renvoyée — seulement provider + key_prefix + base_url. Écritures
 * via service client (RLS = lecture-propriétaire) ; clé chiffrée au repos
 * (AES-256-GCM). Changer/retirer le provider réinitialise le modèle par défaut
 * perso (il appartenait au namespace de l'ancien provider).
 */

const SANITIZED =
  "id, provider, key_prefix, base_url, created_at, last_used_at, validated_at, enabled_surfaces, feature_models";

// Bornes larges : une clé d'API réelle et une base URL tiennent très en dessous.
const MAX_KEY_LENGTH = 1024;
const MAX_BASE_URL_LENGTH = 2048;

/** Efface le défaut modèle perso (obsolète quand le provider change). */
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
    // Corps non-objet (null, chaîne…) : refusé ici plutôt que de crasher plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { key?: string; provider?: string; base_url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (key.length > MAX_KEY_LENGTH) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  if (!isKnownAgentProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  // Base URL requise pour le provider générique. Le serveur ira appeler cette
  // adresse : elle passe donc le garde anti-SSRF (MIN-341), pas une regex —
  // `http://169.254.169.254/` satisfait `^https?://.+` et vise le service de
  // métadonnées du cloud.
  const def = getAgentProvider(provider)!;
  let baseUrl: string | null = null;
  if (def.requiresBaseUrl) {
    const raw = typeof body.base_url === "string" ? body.base_url.trim() : "";
    if (raw.length > MAX_BASE_URL_LENGTH || !/^https?:\/\/.+/i.test(raw)) {
      return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
    }
    try {
      await assertPublicHttpUrl(raw);
    } catch {
      return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
    }
    baseUrl = normalizeBaseUrl(raw);
  }

  // La clé est PRÉSENTÉE au fournisseur avant d'être enregistrée (MIN-344) : sa
  // seule présence en base levait tout plafond d'usage, y compris celui du
  // compute de la microVM, que minddy paye. Un refus franc (401/403) est un fait
  // qu'on rend à l'utilisateur tout de suite — enregistrer une clé morte ne lui
  // rendrait service ni maintenant ni au premier run. Un verdict `unknown`
  // (fournisseur injoignable) enregistre la clé SANS date de validation : elle ne
  // lève rien, et `getUserByok` retentera au premier usage.
  const effectiveBaseUrl = resolveProviderBaseUrl(provider, baseUrl);
  const verdict = effectiveBaseUrl
    ? await probeByokKey({ provider, apiKey: key, baseUrl: effectiveBaseUrl })
    : "unknown";
  if (verdict === "invalid") {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("aiKeyRejected") }, { status: 400 });
  }

  let encrypted: string;
  try {
    encrypted = encryptUserAiKey(key);
  } catch {
    // AI_KEY_ENCRYPTION_SECRET manquant → fail-closed (on ne stocke jamais en clair).
    return NextResponse.json({ error: "BYOK is not configured on the server" }, { status: 503 });
  }

  const service = getServiceClient();

  // Provider actif courant (pour savoir s'il faut réinitialiser le défaut modèle).
  const { data: existing } = await service
    .from("user_ai_keys")
    .select("provider")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const previousProvider = (existing as { provider: string } | null)?.provider ?? null;

  // Un seul BYOK actif : on efface les autres providers avant l'upsert.
  await service
    .from("user_ai_keys")
    .delete()
    .eq("user_id", auth.user.id)
    .neq("provider", provider);

  const { data, error } = await service
    .from("user_ai_keys")
    .upsert(
      {
        user_id: auth.user.id,
        provider,
        key_encrypted: encrypted,
        key_prefix: keyPrefix(key),
        base_url: baseUrl,
        validated_at: verdict === "valid" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )
    .select(SANITIZED)
    .single();
  if (error || !data) {
    console.error("[api/account/ai-keys] upsert failed:", error?.message);
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("aiKeySaveFailed") }, { status: 500 });
  }

  if (previousProvider !== provider) await clearDefaultModel(service, auth.user.id);

  return NextResponse.json({ key: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const service = getServiceClient();
  // Single-active : on retire le BYOK (quel que soit le provider) et on remet le
  // défaut modèle à zéro (il pouvait viser un modèle hors du provider plateforme).
  await service.from("user_ai_keys").delete().eq("user_id", auth.user.id);
  await clearDefaultModel(service, auth.user.id);
  return NextResponse.json({ ok: true });
}

/**
 * Réglages non sensibles du BYOK actif. L'écriture est partielle mais chaque
 * valeur fournie remplace son ensemble complet : c'est ce qui rend possible de
 * décocher toutes les surfaces ou d'effacer tous les overrides modèle.
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

  const update: { enabled_surfaces?: string[]; feature_models?: Record<string, string> } = {};
  if ("enabled_surfaces" in body) {
    const surfaces = parseAiSurfaces(body.enabled_surfaces);
    if (!surfaces) return NextResponse.json({ error: "Invalid AI surfaces" }, { status: 400 });
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

  const service = getServiceClient();
  const { data, error } = await service
    .from("user_ai_keys")
    .update(update)
    .eq("user_id", auth.user.id)
    .select(SANITIZED)
    .maybeSingle();
  if (error) {
    console.error("[api/account/ai-keys] preferences update failed:", error.message);
    return NextResponse.json({ error: "Could not save BYOK preferences" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "No BYOK key configured" }, { status: 404 });
  return NextResponse.json({ key: data });
}
