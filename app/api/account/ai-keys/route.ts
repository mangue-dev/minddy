import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { encryptUserAiKey, keyPrefix } from "@/lib/server/agent/byok-credentials";
import {
  getAgentProvider,
  isKnownAgentProvider,
  normalizeBaseUrl,
} from "@/lib/agent-providers";

/**
 * Clé « BYOK » du compte (MIN-46 / MIN-10). UN seul provider actif : OpenRouter,
 * OpenAI, Anthropic, Google ou un endpoint OpenAI-compatible générique (avec sa
 * base URL). Reconfigurer = remplacer (on efface les autres). La clé en clair
 * n'est JAMAIS renvoyée — seulement provider + key_prefix + base_url. Écritures
 * via service client (RLS = lecture-propriétaire) ; clé chiffrée au repos
 * (AES-256-GCM). Changer/retirer le provider réinitialise le modèle par défaut
 * perso (il appartenait au namespace de l'ancien provider).
 */

const SANITIZED = "id, provider, key_prefix, base_url, created_at, last_used_at";

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
  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { key?: string; provider?: string; base_url?: string };
  try {
    body = (await request.json()) as { key?: string; provider?: string; base_url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = (body.key ?? "").trim();
  const provider = (body.provider ?? "").trim();
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (!isKnownAgentProvider(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  // Base URL requise (et validée http(s)) pour le provider générique.
  const def = getAgentProvider(provider)!;
  let baseUrl: string | null = null;
  if (def.requiresBaseUrl) {
    const raw = (body.base_url ?? "").trim();
    if (!/^https?:\/\/.+/i.test(raw)) {
      return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });
    }
    baseUrl = normalizeBaseUrl(raw);
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )
    .select(SANITIZED)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to save key" }, { status: 500 });
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
