import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  createRoutine,
  listRoutinesForUser,
  type RoutineErrorKey,
} from "@/lib/server/routines";

/**
 * Les ROUTINES (MIN-185) de l'utilisateur — la porte HTTP de la fabrique.
 *
 * `GET` liste celles de TOUS ses projets accessibles, possédés ou rejoints : un
 * membre voit ce qui tourne sur le dépôt qu'il partage. `POST` crée, et rend le
 * `403 ownerOnly` de la fabrique tel quel — c'est le budget du propriétaire qui
 * part tous les lundis, et l'UI n'offre le « + » qu'à lui.
 *
 * Aucune validation ici : elle est dans `lib/server/routines.ts`, la même pour
 * les quatre portes. Cette route ne fait que lire un corps et traduire un statut.
 */

export const runtime = "nodejs";

/** Bornes du corps, comme la route de lancement carnet (MIN-118). */
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
      // `code` en double : c'est la clé que l'UI traduit, et les autres routes
      // du dépôt la servent sous ce nom.
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

/** Les jours d'une cadence — bornés en nombre, jamais en valeur (la fabrique
    valide l'intervalle et la cohérence avec la fréquence). */
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
    model: str(body.model, MAX_SHORT_FIELD) || null,
    reasoningLevel: str(body.reasoningLevel, 32) || null,
    baseBranch: str(body.baseBranch, MAX_SHORT_FIELD) || null,
    // Absent = le défaut de la fabrique (90 %). La borne 1–100 est la sienne
    // aussi : une seule règle pour les quatre portes.
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
