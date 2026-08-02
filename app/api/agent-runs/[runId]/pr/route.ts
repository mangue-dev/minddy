import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  prDetailResponse,
  prReviewResponse,
  prStateActionResponse,
  type PrActionBody,
} from "@/lib/server/agent/pr-actions";

/**
 * FAÇADE (MIN-143) : la review d'une PR est indexée par la PR
 * (`/api/pull-requests/[prId]`) depuis qu'une PR humaine — qui n'a aucun run —
 * doit pouvoir être relue elle aussi. Cette route résout le run → sa PR et
 * délègue.
 *
 * Elle reste parce que les deep-links `?run=` déjà en circulation en dépendent,
 * et parce que la conversation d'agent (`/agents`) parle en `runId` : la casser
 * reviendrait à casser cette page.
 *
 *  GET  → metadata PR + fichiers + checks + approbations + méthodes de merge,
 *         ou `{ pr: null, files: [] }` si le run n'a pas (encore) de PR.
 *  POST → merge | close | reopen | ready_for_review | review (cf. la route par prId).
 */

type RouteContext = { params: Promise<{ runId: string }> };

// `review` + relaunch lance une run froide et kicke le drain dans after() : il
// lui faut la fenêtre complète du drain (270 s de budget).
export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) {
    // Run sans PR : réponse vide, pas une erreur — la vue PR d'une session qui
    // n'en a pas encore ouvert doit pouvoir s'afficher.
    if ("noPr" in auth) return NextResponse.json({ pr: null, files: [] });
    return auth.response;
  }
  return prDetailResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let body: PrActionBody;
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : refusé ici plutôt que de crasher plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as PrActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (
    action !== "merge" &&
    action !== "close" &&
    action !== "reopen" &&
    action !== "review" &&
    action !== "ready_for_review"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;

  if (action === "review") {
    return prReviewResponse(auth.scope, body, auth.userId);
  }
  return prStateActionResponse(auth.scope, action, body, auth.userId);
}
