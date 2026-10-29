import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import {
  importAiConfigFile,
  readAiConfigValues,
  writeAiConfigValue,
} from "@/lib/server/admin-model-config";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

/**
 * Admin gate for the app-config endpoints: authenticate the request (JWT via
 * getClaims), then require the caller to be a minddy admin. Returns the error
 * response to short-circuit with, or null when the caller is cleared.
 */
async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

async function readObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): reject here instead of crashing below.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** GET /api/admin/app-config — current value of every AI knob in the registry. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  // Routing suffixes (MIN-263) are keys in their own right: the dashboard
  // reads them in the same object as the model they accompany.
  return NextResponse.json({ values: await readAiConfigValues() }, { headers: PRIVATE_HEADERS });
}

/**
 * PATCH /api/admin/app-config { key, value } — set one AI knob. Only registry
 * keys are writable, through the checks of `lib/server/admin-model-config.ts`.
 * An EMPTY value clears the row so the default applies again — the picker's
 * "default model" option (MIN-90). `released` lists the seeded task rows a
 * new category default took over (MIN-829).
 */
export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await readObject(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const key = typeof body.key === "string" ? body.key : "";
  try {
    const result = await writeAiConfigValue(key, body.value);
    if (!result.ok) {
      const { status, ok: _ok, ...refusal } = result;
      return NextResponse.json(refusal, { status });
    }
    return NextResponse.json({ key: result.key, value: result.value, released: result.released });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    console.error("[admin/app-config PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/app-config { file, apply } — import a configuration file
 * (`lib/ai-model-config-file.ts`). `apply: false` only returns the changes it
 * would make; `apply: true` checks every changed value, then writes them all
 * or none.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const body = await readObject(request);
  if (!body || !("file" in body)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await importAiConfigFile(body.file, body.apply === true);
    if (!result.ok) {
      const { status, ok: _ok, ...refusal } = result;
      return NextResponse.json(refusal, { status, headers: PRIVATE_HEADERS });
    }
    const { ok: _ok, ...summary } = result;
    return NextResponse.json(summary, { headers: PRIVATE_HEADERS });
  } catch (e) {
    console.error("[admin/app-config POST]", e instanceof Error ? e.message : "import failed");
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
