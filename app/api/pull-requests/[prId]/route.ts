import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  prAiReviewResponse,
  prDetailResponse,
  prLinkIssueResponse,
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
 *       | { action: 'reopen' }                               → fermée → rouverte (MIN-164)
 *       | { action: 'ready_for_review' }                     → brouillon → prête
 *       | { action: 'review', verdict, message, relaunch?, model?, reasoningLevel?, localExec?, localWorktree? }
 *       | { action: 'ai_review', model?, reasoningLevel? }    → Numo relit (MIN-141)
 *       | { action: 'link_issue', issueId }                  → rattache un ticket (MIN-163)
 *
 * `ai_review` rend un 202 avec la SESSION d'agent ancrée à cette PR (MIN-168) :
 * l'agent clone la branche, lit le code et commente, et la session se regarde
 * dans `/agents` — `./ai-review` en donne l'état pour le fil de la PR.
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
    action !== "reopen" &&
    action !== "review" &&
    action !== "ai_review" &&
    action !== "ready_for_review" &&
    action !== "link_issue"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;

  if (action === "review") {
    return prReviewResponse(auth.scope, body, auth.userId);
  }
  if (action === "link_issue") {
    return prLinkIssueResponse(auth.scope, auth.supabase, body, auth.userId);
  }
  if (action === "ai_review") {
    // La langue n'est plus un paramètre : une session d'agent écrit dans celle de
    // son lanceur, résolue au premier chunk comme pour toutes les autres.
    return prAiReviewResponse(auth.scope, auth.userId, body.model, body.reasoningLevel);
  }
  return prStateActionResponse(auth.scope, action, body, auth.userId);
}
