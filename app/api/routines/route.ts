import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { parseAgentMentions } from "@/lib/agent-mentions";
import {
  createRoutine,
  listRoutinesForUser,
  type RoutineErrorKey,
} from "@/lib/server/routines";

/**
 * User ROUTINES (MIN-185) — the HTTP gate to the factory.
 *
 * `GET` lists those of ALL its accessible, owned or joined projects: a
 * member sees what is running on the repository they share. `POST` creates, and returns the
 * `403 ownerOnly` of the factory as is — it is the owner's budget that
 * leaves every Monday, and the UI only offers the “+” to him.
 *
 * No validation here: it is in `lib/server/routines.ts`, the same for
 * the four doors. This route only reads a body and translates a status.
 */

export const runtime = "nodejs";

/** Body terminals, such as the notebook launch route (MIN-118). */
const MAX_PROMPT_LENGTH = 20_000;
const MAX_SHORT_FIELD = 255;

export const ROUTINE_ERROR_STATUS: Record<RoutineErrorKey, number> = {
  projectNotFound: 404,
  ownerOnly: 403,
  routineNotFound: 404,
  promptRequired: 400,
  noRepo: 409,
  invalidSchedule: 400,
  unknownTimezone: 400,
  modelAbovePlan: 403,
  noFieldsToUpdate: 400,
  databaseError: 500,
};

export function routineErrorResponse(result: {
  status: number;
  errorKey: RoutineErrorKey;
  modelLimit?: unknown;
  scheduleCode?: string;
}) {
  return NextResponse.json(
    {
      error: result.errorKey,
      // `code` duplicate: this is the key that the UI translates, and the other routes
      // of the depot serve it under this name.
      code: result.errorKey,
      modelLimit: result.modelLimit,
      scheduleCode: result.scheduleCode,
    },
    { status: result.status },
  );
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const routines = await listRoutinesForUser(auth.user.id);
  return NextResponse.json({ routines });
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The days of a cadence — limited in number, never in value (the factory
 validates the interval and consistency with frequency). */
function days(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === "number").slice(0, 31)
    : [];
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = str(body.projectId, 64);
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const result = await createRoutine({
    projectId,
    actorId: auth.user.id,
    prompt: str(body.prompt, MAX_PROMPT_LENGTH),
    promptMentions: parseAgentMentions(body.promptMentions),
    model: str(body.model, MAX_SHORT_FIELD) || null,
    reasoningLevel: str(body.reasoningLevel, 32) || null,
    baseBranch: str(body.baseBranch, MAX_SHORT_FIELD) || null,
    // Absent = factory defect (90%). Terminal 1–100 is his
    // also: only one rule for the four doors.
    maxSpendPercent: num(body.maxSpendPercent),
    frequency: str(body.frequency, 32),
    hour: num(body.hour) ?? 9,
    minute: num(body.minute) ?? 0,
    weekdays: days(body.weekdays),
    daysOfMonth: days(body.daysOfMonth),
    timezone: str(body.timezone, 64),
    ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
  });
  if (!result.ok) return routineErrorResponse(result);
  return NextResponse.json({ routine: result.routine });
}
