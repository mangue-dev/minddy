import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "next-intl/server";

import {
  authorizePrRequest,
  prAiReviewResponse,
  prDetailResponse,
  prReviewResponse,
  prStateActionResponse,
  type PrActionBody,
} from "@/lib/server/agent/pr-actions";

/**
 * Review in-app d'une pull request, indexée PAR LA PR (MIN-143).
 *  GET  → metadata PR + fichiers/patches + checks CI + approbations + méthodes
 *         de merge offertes par la forge.
 *  POST → { action: 'merge', method? }
 *       | { action: 'close' }
 *       | { action: 'ready_for_review' }                     → brouillon → prête
 *       | { action: 'review', verdict, message, relaunch?, model? }
 *       | { action: 'ai_review', model? }                    → Numo relit (MIN-141)
 *
 * `ai_review` rend un 202 avec la SESSION de review (`pr_review_runs`) : la
 * passe se joue en tâche de fond et se regarde en direct sur `./ai-review`.
 *
 * Les anciennes routes `agent-runs/[runId]/pr/*` sont devenues des façades de
 * celles-ci : le corps de chaque geste vit dans `lib/server/agent/pr-actions`,
 * les routes ne font que l'auth.
 */

type RouteContext = { params: Promise<{ prId: string }> };

// `review` + relaunch lance une run froide et kicke le drain dans after() : il
// lui faut la fenêtre complète du drain (270 s de budget), sinon le premier
// chunk est tué en plein round — même raison que /api/issues/[id]/agent.
export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prDetailResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

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
    action !== "review" &&
    action !== "ai_review" &&
    action !== "ready_for_review"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;

  if (action === "review") {
    return prReviewResponse(auth.scope, body, auth.userId);
  }
  if (action === "ai_review") {
    // La review est écrite dans la langue du demandeur — celle du cookie de
    // locale, comme tout le reste de ce que minddy lui rend.
    return prAiReviewResponse(auth.scope, auth.userId, await getLocale(), body.model);
  }
  return prStateActionResponse(auth.scope, action, body, auth.userId);
}
