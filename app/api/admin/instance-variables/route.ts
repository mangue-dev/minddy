import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { hasFreshAal2Verification, REAUTH_REQUIRED_CODE } from "@/lib/server/reauth";
import {
  clearInstanceVariable,
  instanceOverridesStatus,
  listInstanceVariables,
  rollbackInstanceVariable,
  setInstanceVariable,
  type InstanceVariableActor,
  type InstanceVariableWrite,
} from "@/lib/server/instance-variables";
import { notifyInstanceConfigChange } from "@/lib/server/instance-variable-notify";
import { afterOrNow } from "@/lib/server/after-safe";
import { getInstanceVariable } from "@/lib/instance-variables";

/**
 * Instance variables overridden from the admin dashboard (MIN-847).
 *
 * GET                    every allowlisted variable: where its value comes
 *                        from, the value (a secret as its last characters
 *                        only) and its history.
 * PATCH  { key, value }  sets an override.
 * DELETE ?key=           removes it: the file value applies again.
 * POST   { key, index }  restores a version of the history.
 *
 * Every call re-runs the live admin check; a secret or `ADMIN_EMAILS` also
 * needs a second factor presented in the last minutes. Each change reaches
 * every administrator's inbox. On Minddy Cloud, or without
 * `MINDDY_CONFIG_OVERRIDES=1` in the environment file, nothing can be written.
 */

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

type Gate =
  | { ok: true; actor: InstanceVariableActor; claims: Record<string, unknown> }
  | { ok: false; response: NextResponse };

async function requireAdmin(request: NextRequest): Promise<Gate> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return {
    ok: true,
    actor: { id: auth.user.id, email: auth.user.email ?? null, appMetadata: auth.user.app_metadata },
    claims: auth.claims,
  };
}

async function requireFreshFactor(key: string, claims: Record<string, unknown>): Promise<NextResponse | null> {
  if (!getInstanceVariable(key)?.sensitive || hasFreshAal2Verification(claims)) return null;
  const t = await getTranslations("ApiErrors");
  return NextResponse.json({ error: t("mfaReauthTooOld"), code: REAUTH_REQUIRED_CODE }, { status: 403 });
}

function respond(result: InstanceVariableWrite, actorId: string): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, code: result.reason }, { status: result.status, headers: PRIVATE_HEADERS });
  }
  // An unchanged value changed nothing to tell.
  if (result.unchanged) return NextResponse.json({ key: result.key, unchanged: true }, { headers: PRIVATE_HEADERS });
  // The inbox fan-out is not part of the write: it must not fail it.
  afterOrNow(async () => {
    await notifyInstanceConfigChange(actorId, result.previousAdminEmails);
  });
  return NextResponse.json({ key: result.key }, { headers: PRIVATE_HEADERS });
}

async function readObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const status = instanceOverridesStatus();
  if (status !== "enabled") return NextResponse.json({ status, variables: [] }, { headers: PRIVATE_HEADERS });
  try {
    return NextResponse.json({ status, variables: await listInstanceVariables() }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("[admin/instance-variables] read failed:", (error as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const body = await readObject(request);
  const key = typeof body?.key === "string" ? body.key : "";
  if (!body || !key) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const fresh = await requireFreshFactor(key, gate.claims);
  if (fresh) return fresh;
  return respond(await setInstanceVariable(key, body.value, gate.actor), gate.actor.id);
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const fresh = await requireFreshFactor(key, gate.claims);
  if (fresh) return fresh;
  return respond(await clearInstanceVariable(key, gate.actor), gate.actor.id);
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const body = await readObject(request);
  const key = typeof body?.key === "string" ? body.key : "";
  if (!body || !key) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const fresh = await requireFreshFactor(key, gate.claims);
  if (fresh) return fresh;
  return respond(await rollbackInstanceVariable(key, body.index, gate.actor), gate.actor.id);
}
