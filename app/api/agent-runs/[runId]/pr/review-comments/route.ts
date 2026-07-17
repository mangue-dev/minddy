import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";

/**
 * Commentaires de review d'une PR d'agent — ceux ancrés à une ligne du diff, par
 * opposition au fil plat de la conversation (route `/comments`). Ce sont de VRAIS
 * commentaires GitHub : ils apparaissent sur la PR, et le code agent les relit.
 *  GET  → commentaires de review (accès projet requis).
 *  POST → { body, path, line, side }  poste sur une ligne
 *       | { body, in_reply_to }       répond dans un fil
 *         (membre du projet requis ; auteur = la GitHub App minddy).
 *
 * Un commentaire part IMMÉDIATEMENT (équivalent « Add single comment ») : pas de
 * review groupée, pas de brouillon.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.pr_number == null) return NextResponse.json({ comments: [] });

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const comments = await forgeFor(target.provider).listPullRequestReviewComments({
      token: target.token,
      repoFullName: target.repoFullName,
      number: run.pr_number,
    });
    return NextResponse.json({ comments });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let payload: {
    body?: string;
    path?: string;
    line?: number;
    side?: string;
    in_reply_to?: number;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Comment required" }, { status: 400 });

  const isReply = payload.in_reply_to != null;
  if (isReply) {
    // Validé comme les autres champs, et pas seulement typé : `in_reply_to` finit
    // interpolé dans l'URL GitHub. Une chaîne y glisserait des `..` (que `fetch`
    // normalise) et sortirait de `/repos/{owner}/{repo}/…` — or le token
    // d'installation porte TOUT le périmètre de l'installation, pas ce seul dépôt.
    if (
      typeof payload.in_reply_to !== "number" ||
      !Number.isInteger(payload.in_reply_to) ||
      payload.in_reply_to < 1
    ) {
      return NextResponse.json({ error: "Invalid in_reply_to" }, { status: 400 });
    }
  } else {
    if (typeof payload.path !== "string" || !payload.path) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }
    if (typeof payload.line !== "number" || !Number.isInteger(payload.line) || payload.line < 1) {
      return NextResponse.json({ error: "Line required" }, { status: 400 });
    }
    if (payload.side !== "LEFT" && payload.side !== "RIGHT") {
      return NextResponse.json({ error: "Invalid side" }, { status: 400 });
    }
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const number = run.pr_number;
  if (number == null) {
    return NextResponse.json({ error: "This run has no pull request" }, { status: 400 });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const forge = forgeFor(target.provider);

    if (isReply) {
      const comment = await forge.replyToPullRequestReviewComment({
        token: target.token,
        repoFullName: target.repoFullName,
        number,
        commentId: payload.in_reply_to as number,
        body,
      });
      return NextResponse.json({ comment });
    }

    // L'ancre du commentaire est résolue PAR le provider (tête de PR relue à
    // chaud sur GitHub, diff_refs sur GitLab) — la route n'a rien à pré-lire.
    const comment = await forge.createPullRequestReviewComment({
      token: target.token,
      repoFullName: target.repoFullName,
      number,
      body,
      path: payload.path as string,
      line: payload.line as number,
      side: payload.side as "LEFT" | "RIGHT",
    });
    return NextResponse.json({ comment });
  } catch (err) {
    if (isForgeApiError(err)) {
      // 422 = GitHub refuse d'ancrer la ligne. Le cas normal est une ligne hors
      // diff, mais il survient aussi quand la tête a bougé sous l'utilisateur (la
      // ligne visée n'existe plus à ce commit). Code dédié : l'UI l'explique et
      // GARDE le texte saisi, là où un 502 générique ressemblerait à une panne.
      if (err.status === 422) {
        return NextResponse.json(
          { error: err.message, code: "lineNotInDiff" },
          { status: 422 },
        );
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
