import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getProjectAccess } from "@/lib/server/project-access";
import { hasUsageBudget } from "@/lib/server/usage";
import { sanitizeDigest, type CsvDigestMember } from "@/lib/import/digest";
import { loadImportContext } from "@/lib/server/import-context";
import { proposeImportMapping } from "@/lib/server/import-mapping-ai";
import type { ImportMember } from "@/lib/import/types";

type RouteContext = { params: Promise<{ id: string }> };

/** Members as the prompt numbers them — same order as `context.members`,
 * because it is this rank that the model returns. */
const digestMembers = (members: ImportMember[]): CsvDigestMember[] =>
  members.map((m, i) => ({
    ref: i + 1,
    name: [m.name, m.email].filter(Boolean).join(" ") || `member ${i + 1}`,
  }));

// A single model call, on a summary of a few thousand tokens.
export const maxDuration = 60;

/**
 * POST /api/projects/[id]/import/plan — provides column matching
 * for a CSV being submitted. Body: `{ digest }`, the file summary
 * built in the browser (`lib/import/digest.ts`), never the file.
 *
 * Returns `{ mapping }`, a PROPOSAL that the preview merges with what the
 * detection by headers had already found, displayed, and left to correct. Nothing
 * is written here: the route just reads a summary and calls a model.
 * `mapping: null` when the pass is not available (flag cut, key
 * absent, budget exhausted, call missed) — the import is then done as before.
 *
 * Reserved for the owner, like the import itself: it is he who pays for the call.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  // Around ten files uploaded per minute are more than enough, and the gesture
  // is not repeatable: one file submitted = one call.
  const rl = checkSessionRateLimit(auth.user.id, "project-import-plan", { limit: 10 });
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

  const digest = sanitizeDigest((body as { digest?: unknown } | null)?.digest);
  if (!digest) {
    return NextResponse.json({ error: t("importInvalidCsv") }, { status: 400 });
  }

  // Budget exhausted: no error, no proposal. The user keeps his
  // import and its correspondence table, he fills it in by hand.
  if (!(await hasUsageBudget(auth.user.id, "automations"))) {
    return NextResponse.json({ mapping: null });
  }

  // The members and categories come from the SERVER, never from the digest: this
  // they are the ones who close the loop — the model responds to the ranks of members,
  // and it is this list which transforms them back into identifiers.
  const context = await loadImportContext(id, auth.user.id);

  const mapping = await proposeImportMapping({
    digest: { ...digest, members: digestMembers(context.members) },
    members: context.members,
    categories: context.categories,
    userId: auth.user.id,
    projectId: id,
  });

  return NextResponse.json({ mapping });
}
