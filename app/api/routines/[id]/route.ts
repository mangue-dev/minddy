import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { deleteRoutine, getRoutineForUser, updateRoutine } from "@/lib/server/routines";
import { routineErrorResponse } from "../route";

/**
 * Une ROUTINE (MIN-185) : la lire, la modifier, la supprimer.
 *
 * `GET` est ouvert aux membres du projet — voir ce qui tourne sur le dépôt
 * qu'on partage. `PATCH` et `DELETE` sont au propriétaire seul, et c'est la
 * fabrique qui le dit : cette route ne relaie que son refus.
 */

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_TITLE_LENGTH = 120;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_SHORT_FIELD = 255;

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const found = await getRoutineForUser(id, auth.user.id);
  if (!found) return NextResponse.json({ error: "routineNotFound" }, { status: 404 });
  return NextResponse.json({ routine: found.routine, isOwner: found.isOwner });
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await updateRoutine({
    routineId: id,
    actorId: auth.user.id,
    // Seuls les champs PRÉSENTS partent : la fabrique distingue « absent » de
    // « vidé », et un `undefined` qui traverse effacerait un modèle choisi.
    ...(body.title !== undefined ? { title: str(body.title, MAX_TITLE_LENGTH) } : {}),
    ...(body.prompt !== undefined ? { prompt: str(body.prompt, MAX_PROMPT_LENGTH) } : {}),
    ...(body.model !== undefined ? { model: str(body.model, MAX_SHORT_FIELD) || null } : {}),
    ...(body.reasoningLevel !== undefined
      ? { reasoningLevel: str(body.reasoningLevel, 32) }
      : {}),
    ...(body.baseBranch !== undefined
      ? { baseBranch: str(body.baseBranch, MAX_SHORT_FIELD) || null }
      : {}),
    ...(body.frequency !== undefined ? { frequency: str(body.frequency, 32) } : {}),
    ...(body.hour !== undefined ? { hour: num(body.hour) } : {}),
    ...(body.minute !== undefined ? { minute: num(body.minute) } : {}),
    ...(body.weekday !== undefined ? { weekday: num(body.weekday) ?? null } : {}),
    ...(body.dayOfMonth !== undefined ? { dayOfMonth: num(body.dayOfMonth) ?? null } : {}),
    ...(body.timezone !== undefined ? { timezone: str(body.timezone, 64) } : {}),
    ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
  });
  if (!result.ok) return routineErrorResponse(result);
  return NextResponse.json({ routine: result.routine });
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const result = await deleteRoutine({ routineId: id, actorId: auth.user.id });
  if (!result.ok) return routineErrorResponse(result);
  return NextResponse.json({ ok: true });
}
