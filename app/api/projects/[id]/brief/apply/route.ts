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

// Une dizaine d'objectifs créés un par un, puis un import par lots : loin des
// 120 s de l'import CSV, mais au-dessus d'un appel ordinaire.
export const maxDuration = 60;

/**
 * POST /api/projects/[id]/brief/apply — écrit l'amorce validée (MIN-172).
 * Corps : `{ proposal }`, la proposition TELLE QUE L'APERÇU LA MONTRE, après
 * les décochages et les titres réécrits.
 *
 * Ce corps est fabriqué par le navigateur : il repasse en entier par
 * `sanitizeSeedProposal` avant toute écriture — c'est la même porte que la
 * proposition du modèle a franchie, donc rien de neuf ne peut entrer ici.
 *
 * Les objectifs d'abord (il faut leurs identifiants), puis UN import : le
 * chemin d'écriture est celui du CSV (`importIssuesIntoProject`), qui sait
 * déjà réserver les numéros par lot, créer les catégories manquantes et
 * rattacher les sous-tickets. Pas de second chemin à maintenir.
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

  // Les objectifs d'abord : un ticket a besoin de l'identifiant du sien AVANT
  // d'être inséré. Un objectif qui échoue ne coûte que son rattachement — les
  // tickets partent quand même, sans objectif, ce qui se rattrape à la main.
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
