import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { parseAgentMentions } from "@/lib/agent-mentions";
import { deleteRoutine, getRoutineForUser, updateRoutine } from "@/lib/server/routines";
import { routineErrorResponse } from "../route";

/**
 * A ROUTINE (MIN-185): read it, modify it, delete it.
 *
 * `GET` is open to project members — see what's running on the repository
 * that we share. `PATCH` and `DELETE` are the sole owner, and this is the
 * factory that says it: this road only relays its refusal.
 */

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_PROMPT_LENGTH = 20_000;
const MAX_SHORT_FIELD = 255;

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function days(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === "number").slice(0, 31)
    : [];
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
    // Only the PRESENT fields leave: the factory distinguishes “absent” from
    // "emptied", and a `undefined` passing through would erase a chosen model.
    ...(body.prompt !== undefined ? { prompt: str(body.prompt, MAX_PROMPT_LENGTH) } : {}),
    ...(body.promptMentions !== undefined
      ? { promptMentions: parseAgentMentions(body.promptMentions) }
      : {}),
    ...(body.model !== undefined ? { model: str(body.model, MAX_SHORT_FIELD) || null } : {}),
    ...(body.reasoningLevel !== undefined
      ? { reasoningLevel: str(body.reasoningLevel, 32) }
      : {}),
    ...(body.baseBranch !== undefined
      ? { baseBranch: str(body.baseBranch, MAX_SHORT_FIELD) || null }
      : {}),
    ...(body.maxSpendPercent !== undefined
      ? { maxSpendPercent: num(body.maxSpendPercent) }
      : {}),
    ...(body.frequency !== undefined ? { frequency: str(body.frequency, 32) } : {}),
    ...(body.hour !== undefined ? { hour: num(body.hour) } : {}),
    ...(body.minute !== undefined ? { minute: num(body.minute) } : {}),
    ...(body.weekdays !== undefined ? { weekdays: days(body.weekdays) } : {}),
    ...(body.daysOfMonth !== undefined ? { daysOfMonth: days(body.daysOfMonth) } : {}),
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
