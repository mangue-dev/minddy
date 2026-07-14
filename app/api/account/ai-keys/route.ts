import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { encryptUserAiKey, keyPrefix } from "@/lib/server/agent/byok-credentials";

/**
 * Clés « BYOK » OpenRouter du compte (MIN-46 / MIN-10). La clé en clair n'est
 * JAMAIS renvoyée — seulement provider + key_prefix. Écritures via service client
 * (RLS user_ai_keys = lecture-propriétaire, écritures service-only) ; la clé est
 * chiffrée au repos (AES-256-GCM).
 */

const PROVIDER = "openrouter";
const SANITIZED = "id, provider, key_prefix, created_at, last_used_at";

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

  let body: { key?: string; provider?: string };
  try {
    body = (await request.json()) as { key?: string; provider?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const key = (body.key ?? "").trim();
  const provider = (body.provider ?? PROVIDER).trim();
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (provider !== PROVIDER) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  let encrypted: string;
  try {
    encrypted = encryptUserAiKey(key);
  } catch {
    // AI_KEY_ENCRYPTION_SECRET manquant → fail-closed (on ne stocke jamais en clair).
    return NextResponse.json({ error: "BYOK is not configured on the server" }, { status: 503 });
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("user_ai_keys")
    .upsert(
      {
        user_id: auth.user.id,
        provider,
        key_encrypted: encrypted,
        key_prefix: keyPrefix(key),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )
    .select(SANITIZED)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to save key" }, { status: 500 });
  }
  return NextResponse.json({ key: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const provider = request.nextUrl.searchParams.get("provider") ?? PROVIDER;
  const service = getServiceClient();
  await service.from("user_ai_keys").delete().eq("user_id", auth.user.id).eq("provider", provider);
  return NextResponse.json({ ok: true });
}
