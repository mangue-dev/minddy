import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { mapCsvToIssues } from "@/lib/import/parse";
import { MAX_IMPORT_CSV_BYTES } from "@/lib/import/types";
import { importIssuesIntoProject } from "@/lib/server/import-issues";

type RouteContext = { params: Promise<{ id: string }> };

// Bulk import: number reservation is one RPC per issue, so a 1000-issue file
// needs real headroom beyond the default.
export const maxDuration = 120;

/**
 * POST /api/projects/[id]/import — import issues from a CSV export
 * (Linear / Jira / generic). Body: { csv: string }. The client already ran
 * the same mapCsvToIssues for its preview; the server re-runs it on the raw
 * text because the payload can't be trusted. Owner-only: a bad file creates
 * hundreds of issues at once.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
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

  const csv = (body as { csv?: unknown } | null)?.csv;
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: t("importInvalidCsv") }, { status: 400 });
  }
  if (csv.length > MAX_IMPORT_CSV_BYTES) {
    return NextResponse.json({ error: t("importTooLarge") }, { status: 413 });
  }

  const parsed = mapCsvToIssues(csv);
  if (!parsed.ok) {
    const key =
      parsed.error === "tooManyIssues"
        ? "importTooManyIssues"
        : parsed.error === "empty"
          ? "importNoIssues"
          : "importInvalidCsv";
    return NextResponse.json({ error: t(key) }, { status: 400 });
  }
  if (parsed.issues.length === 0) {
    return NextResponse.json({ error: t("importNoIssues") }, { status: 400 });
  }

  const commit = await importIssuesIntoProject({
    projectId: id,
    actorId: auth.user.id,
    issues: parsed.issues,
    source: parsed.source,
  });
  if (!commit.ok) {
    return NextResponse.json({ error: t(commit.errorKey) }, { status: commit.status });
  }

  return NextResponse.json(
    {
      source: parsed.source,
      created: commit.result.created,
      categories_created: commit.result.categoriesCreated,
      sub_issues_linked: commit.result.subIssuesLinked,
      warnings: parsed.warnings,
    },
    { status: 201 }
  );
}
