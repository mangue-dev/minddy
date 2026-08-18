import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getProjectAccess } from "@/lib/server/project-access";
import { createObjective } from "@/lib/server/objectives";
import { importIssuesIntoProject } from "@/lib/server/import-issues";
import {
  sanitizeSeedProposal,
  seedProposalToImportedIssues,
} from "@/lib/server/seed-issues";

type RouteContext = { params: Promise<{ id: string }> };

// Around ten objectives created one by one, then an import in batches: far from the
// 120 s from the CSV import, but above an ordinary call.
export const maxDuration = 60;

/**
 * POST /api/projects/[id]/brief/apply — writes the committed primer (MIN-172).
 * Body: `{ proposal }`, the proposition AS THE PREVIEW SHOWS IT, after
 * unchecks and rewritten titles.
 *
 * This body is made by the browser: it passes entirely through
 * `sanitizeSeedProposal` before any writing — it is the same door as the
 * proposal of the model has passed, so nothing new can enter here.
 *
 * The objectives first (you need their identifiers), then ONE import: the
 * writing path is that of the CSV (`importIssuesIntoProject`), who knows
 * already reserve the numbers in batches, create the missing categories and
 * attach the sub-tickets. No second path to maintain.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "project-brief-apply", { limit: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("importOwnerOnly") }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const proposal = sanitizeSeedProposal((body as { proposal?: unknown } | null)?.proposal);
  if (proposal.issues.length === 0) {
    return NextResponse.json({ error: t("importNoIssues") }, { status: 400 });
  }

  // Objectives first: a ticket needs the identifier of its own BEFORE
  // to be inserted. A failed objective only costs its attachment — the
  // Tickets still go out, without any objective, which can be caught by hand.
  const objectiveIdByKey = new Map<string, string>();
  let objectivesCreated = 0;
  for (const objective of proposal.objectives) {
    const result = await createObjective({
      projectId: id,
      actorId: auth.user.id,
      input: { name: objective.name, description: objective.summary || null },
    });
    if (result.ok) {
      objectiveIdByKey.set(objective.key, result.objective.id as string);
      objectivesCreated += 1;
    } else {
      console.error(`[brief-apply] objective "${objective.name}" failed`, result.errorKey);
    }
  }

  const commit = await importIssuesIntoProject({
    projectId: id,
    actorId: auth.user.id,
    issues: seedProposalToImportedIssues(proposal, objectiveIdByKey),
    source: "brief",
  });
  if (!commit.ok) {
    return NextResponse.json({ error: t(commit.errorKey) }, { status: commit.status });
  }

  return NextResponse.json(
    {
      created: commit.result.created,
      objectives_created: objectivesCreated,
      categories_created: commit.result.categoriesCreated,
      sub_issues_linked: commit.result.subIssuesLinked,
    },
    { status: 201 }
  );
}
