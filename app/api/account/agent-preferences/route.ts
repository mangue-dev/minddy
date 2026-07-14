import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAllowedAgentModel } from "@/lib/agent-models";

/**
 * Préférences agent de l'utilisateur (MIN-46) : son modèle par défaut. RLS
 * self-manage (user_agent_preferences) → on utilise le cookie client. null =
 * suit le défaut racine (app_config.agent_model). Un modèle explicite doit
 * appartenir à l'allowlist du picker.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from("user_agent_preferences")
    .select("default_model")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return NextResponse.json({
    default_model: (data as { default_model: string | null } | null)?.default_model ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { default_model?: string | null };
  try {
    body = (await request.json()) as { default_model?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const model = body.default_model ?? null;
  if (model !== null && (typeof model !== "string" || !isAllowedAgentModel(model))) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }

  const { error } = await auth.supabase.from("user_agent_preferences").upsert(
    {
      user_id: auth.user.id,
      default_model: model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ default_model: model });
}
