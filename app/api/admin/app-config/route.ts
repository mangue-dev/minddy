import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getAppConfigValues, setAppConfigValue } from "@/lib/server/app-config";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_KEYS,
  isFlagKey,
} from "@/lib/ai-model-config";

/**
 * Admin gate for the app-config endpoints: authenticate the request (JWT via
 * getClaims), then require the caller to be a minddy admin. Returns the error
 * response to short-circuit with, or null when the caller is cleared.
 */
async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!isAdminUser(auth.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** GET /api/admin/app-config — current value of every AI knob in the registry. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const values = await getAppConfigValues(
    AI_MODEL_CONFIG_FIELDS.map((f) => f.key)
  );
  return NextResponse.json({ values });
}

/**
 * PATCH /api/admin/app-config — set one AI knob. Only registry keys are
 * writable; flags must be "true"/"false"; model ids must be non-empty.
 */
export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: { key?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key, value } = body;
  if (typeof key !== "string" || !AI_MODEL_CONFIG_KEYS.has(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  if (typeof value !== "string") {
    return NextResponse.json(
      { error: "Value must be a string" },
      { status: 400 }
    );
  }

  const trimmed = value.trim();
  if (isFlagKey(key)) {
    if (trimmed !== "true" && trimmed !== "false") {
      return NextResponse.json(
        { error: "Flag must be 'true' or 'false'" },
        { status: 400 }
      );
    }
  } else if (!trimmed) {
    return NextResponse.json({ error: "Value is required" }, { status: 400 });
  }

  try {
    await setAppConfigValue(key, trimmed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    console.error("[admin/app-config PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ key, value: trimmed });
}
