import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import {
  clearAppConfigValue,
  getAppConfigValues,
  setAppConfigValue,
} from "@/lib/server/app-config";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_KEYS,
  AI_MODEL_SUFFIX_KEYS,
  getAiConfigField,
  isFlagKey,
  isModelSuffix,
  isModelSuffixKey,
  MODEL_SUFFIXES,
} from "@/lib/ai-model-config";
import { parseSubagentFavorites } from "@/lib/subagent-favorites";
import { parseRecommendedModels } from "@/lib/recommended-models";

/**
 * Admin gate for the app-config endpoints: authenticate the request (JWT via
 * getClaims), then require the caller to be a minddy admin. Returns the error
 * response to short-circuit with, or null when the caller is cleared.
 */
/** Roomy bound — the longest legitimate value is the favorites JSON list. */
const MAX_VALUE_LENGTH = 10_000;

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** GET /api/admin/app-config — current value of every AI knob in the registry. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  // Les suffixes de routage (MIN-263) sont des clés à part entière : le
  // dashboard les lit dans le même objet que le modèle qu'ils accompagnent.
  const values = await getAppConfigValues([
    ...AI_MODEL_CONFIG_FIELDS.map((f) => f.key),
    ...AI_MODEL_SUFFIX_KEYS,
  ]);
  return NextResponse.json({ values });
}

/**
 * PATCH /api/admin/app-config — set one AI knob. Only registry keys are
 * writable; flags must be "true"/"false", and a favorites list must survive the
 * runtime parser (`parseSubagentFavorites`) — otherwise we would store a value
 * the run silently ignores, replacing it with the built-in defaults. Any other
 * key accepts an EMPTY value, which clears the row so the registry fallback
 * applies again — that's the picker's "default model" option (MIN-90).
 */
export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  let body: { key?: unknown; value?: unknown };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): reject here instead of crashing below.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { key?: unknown; value?: unknown };
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
  if (value.length > MAX_VALUE_LENGTH) {
    return NextResponse.json({ error: "Value too long" }, { status: 400 });
  }

  const trimmed = value.trim();
  const kind = getAiConfigField(key)?.kind;
  if (kind === "flag") {
    if (trimmed !== "true" && trimmed !== "false") {
      return NextResponse.json(
        { error: "Flag must be 'true' or 'false'" },
        { status: 400 }
      );
    }
  }
  // Un suffixe de routage n'a que trois valeurs légales, plus le vide qui
  // efface la ligne (« aucun paramètre »). Refuser ici plutôt que de laisser
  // partir un `…:nirto` qu'OpenRouter renverrait en 404 à chaque appel.
  if (isModelSuffixKey(key) && trimmed && !isModelSuffix(trimmed)) {
    return NextResponse.json(
      { error: `Suffix must be one of: ${MODEL_SUFFIXES.join(", ")}` },
      { status: 400 }
    );
  }
  if (kind === "favorites" && trimmed && parseSubagentFavorites(trimmed) === null) {
    return NextResponse.json(
      { error: "Favorites must be a JSON array with at least one entry carrying an id" },
      { status: 400 }
    );
  }
  // Même règle, même raison : ce que le runtime ignorerait à la lecture, on le
  // refuse à l'écriture, plutôt que d'enregistrer un réglage sans effet.
  if (kind === "recommended" && trimmed && parseRecommendedModels(trimmed) === null) {
    return NextResponse.json(
      { error: "Recommended models must be a JSON array with at least one model id" },
      { status: 400 }
    );
  }

  try {
    // Modèle vidé = retour au défaut du registre : on supprime la ligne plutôt
    // que d'y écrire l'id du défaut, pour que le réglage suive ses évolutions.
    if (!isFlagKey(key) && !trimmed) await clearAppConfigValue(key);
    else await setAppConfigValue(key, trimmed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    console.error("[admin/app-config PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ key, value: trimmed });
}
