import { type NextRequest, NextResponse } from "next/server";
import { verifyGithubSignature } from "@/lib/server/git/github-app";
import { syncPrState } from "@/lib/server/agent/runs";
import type { AgentRun } from "@/lib/server/agent/runs";

/**
 * POST /api/webhooks/github — récepteur webhook de la GitHub App (MIN-47/MIN-46).
 *
 * On vérifie la signature HMAC (`X-Hub-Signature-256`) puis on synchronise l'état
 * des Pull Requests ouvertes par l'agent de code : un event `pull_request`
 * (closed/merged/reopened/ready_for_review/converted_to_draft) met à jour
 * `agent_runs.pr_state` → la review in-app reflète le vrai état côté GitHub.
 * Tout autre event (ping, push…) est simplement acquitté.
 *
 * Fail-closed : secret présent + signature invalide → 401. Secret non déployé →
 * on acquitte sans vérifier (aucun risque, traitement idempotent best-effort).
 */

/** action GitHub → pr_state minddy (null = event ignoré). */
function mapPrState(action: string, merged: boolean): AgentRun["pr_state"] | null {
  switch (action) {
    case "closed":
      return merged ? "merged" : "closed";
    case "reopened":
    case "ready_for_review":
      return "open";
    case "converted_to_draft":
      return "draft";
    default:
      return null;
  }
}

interface PullRequestEvent {
  action?: string;
  number?: number;
  pull_request?: { merged?: boolean; html_url?: string };
  repository?: { full_name?: string };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (secret) {
    const ok = verifyGithubSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      secret,
    );
    if (!ok) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const event = request.headers.get("x-github-event");
  if (event === "pull_request") {
    try {
      const payload = JSON.parse(rawBody) as PullRequestEvent;
      const action = payload.action ?? "";
      const number = payload.number;
      const repoFullName = payload.repository?.full_name;
      const prState = mapPrState(action, !!payload.pull_request?.merged);
      if (prState && number != null && repoFullName) {
        await syncPrState({
          repoFullName,
          prNumber: number,
          prState,
          prUrl: payload.pull_request?.html_url ?? null,
        });
      }
    } catch (err) {
      // Best-effort : on acquitte quand même pour que GitHub ne re-livre pas.
      console.error("[webhooks/github] pull_request sync failed:", (err as Error).message);
    }
  }

  return NextResponse.json({ ok: true });
}
