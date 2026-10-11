import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getNumoPreferences } from "@/lib/server/assistant/model-preferences";
import { resolveNumoTurnConfiguration, isNumoConversationConfigError } from "@/lib/server/assistant/conversation-config";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getNumoPreferences(auth.user.id));
  } catch {
    return NextResponse.json({ error: "Could not load Numo preferences" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  let body: { provider: unknown; default_model: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      !(body.default_model === null || typeof body.default_model === "string" && /^[\w./:@-]{1,200}$/.test(body.default_model))) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid Numo model preference" }, { status: 400 });
  }
  try {
    const preferences = await getNumoPreferences(auth.user.id);
    if (body.provider !== preferences.provider) return NextResponse.json({ error: "The Numo provider changed. Reload settings before saving." }, { status: 409 });
    if (body.default_model !== null) {
      const validated = await resolveNumoTurnConfiguration({ userId: auth.user.id, model: body.default_model });
      if (validated.runtime.provider !== preferences.provider) return NextResponse.json({ error: "The Numo provider changed. Reload settings before saving." }, { status: 409 });
    }
    const { error } = await auth.supabase.from("user_numo_preferences").upsert({
      user_id: auth.user.id, provider: preferences.provider, model: body.default_model, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (error) throw new Error("Could not save Numo preferences");
    return NextResponse.json({ provider: preferences.provider, default_model: body.default_model, application_model: preferences.application_model });
  } catch (error) {
    if (isPlanLimitError(error)) return planLimitResponse(error);
    if (isNumoConversationConfigError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Could not save Numo preferences" }, { status: 503 });
  }
}
