import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { ensureModelInPlan } from "@/lib/server/agent/model-plan";
import { userHasByokKey } from "@/lib/server/agent/model";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";

/**
 * Préférences agent de l'utilisateur (MIN-46) : son modèle par défaut, et son
 * niveau de raisonnement par défaut (MIN-122). RLS self-manage
 * (user_agent_preferences) → on utilise le cookie client. `default_model` null =
 * suit le défaut racine (app_config.agent_model) ; `default_reasoning_level`
 * null = `off`. Un modèle explicite est un id libre (comme au lancement) — pas
 * d'allowlist ; la clé effective (BYOK ou plateforme) est résolue à l'exécution
 * du run.
 *
 * Le PUT est PARTIEL : seuls les champs PRÉSENTS dans le corps sont écrits — les
 * deux réglages vivent sur la même ligne et sont édités par deux contrôles
 * distincts, l'un ne doit pas effacer l'autre.
 */

/**
 * Garde-fou léger sur l'id modèle. Accepte les deux formes rencontrées :
 * `provider/model` (OpenRouter, ex. deepseek/deepseek-v4-flash:free) ET les ids
 * natifs sans slash (OpenAI `gpt-4o`, Anthropic `claude-opus-4-1`, Gemini…).
 */
const MODEL_ID_RE = /^[\w./:@-]{1,200}$/;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from("user_agent_preferences")
    .select("default_model, default_reasoning_level")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const row = data as {
    default_model: string | null;
    default_reasoning_level: string | null;
  } | null;
  return NextResponse.json({
    default_model: row?.default_model ?? null,
    default_reasoning_level: isReasoningLevel(row?.default_reasoning_level)
      ? row.default_reasoning_level
      : null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  type PrefsBody = { default_model?: string | null; default_reasoning_level?: string | null };
  let body: PrefsBody;
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : le `in` plus bas lèverait au lieu de refuser.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as PrefsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    user_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  if ("default_model" in body) {
    const model = body.default_model ?? null;
    if (model !== null && (typeof model !== "string" || !MODEL_ID_RE.test(model.trim()))) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    // On stocke la forme que la regex a validée — pas les blancs autour.
    patch.default_model = model === null ? null : model.trim();
    // Plafond de modèle du plan : on refuse d'ENREGISTRER ce qui serait refusé
    // au lancement. Le picker grise déjà ces modèles ; ici on ferme la saisie
    // libre, et on évite surtout d'écrire une préférence qui bloquerait ensuite
    // tous les runs du compte. Rien à vérifier en BYOK : ce sont ses tokens.
    if (patch.default_model) {
      try {
        await ensureModelInPlan({
          userId: auth.user.id,
          model: patch.default_model as string,
          mode: (await userHasByokKey(auth.user.id)) ? "byok" : "platform",
        });
      } catch (err) {
        if (isPlanLimitError(err)) return planLimitResponse(err);
        throw err;
      }
    }
  }

  if ("default_reasoning_level" in body) {
    const level = body.default_reasoning_level ?? null;
    if (level !== null && !isReasoningLevel(level)) {
      return NextResponse.json({ error: "Invalid reasoning level" }, { status: 400 });
    }
    patch.default_reasoning_level = level;
  }

  const { data, error } = await auth.supabase
    .from("user_agent_preferences")
    .upsert(patch, { onConflict: "user_id" })
    .select("default_model, default_reasoning_level")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { default_model: string | null; default_reasoning_level: string | null };
  return NextResponse.json({
    default_model: row.default_model ?? null,
    default_reasoning_level: isReasoningLevel(row.default_reasoning_level)
      ? row.default_reasoning_level
      : null,
  });
}
