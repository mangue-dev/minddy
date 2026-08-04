import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { buildMembersByProject } from "@/lib/server/project-members";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { ISSUE_STATUSES, isStatus, type IssueStatusValue } from "@/lib/issue-validation";
import {
  buildIssuesCsv,
  exportFileName,
  MAX_EXPORT_ISSUES,
  type ExportIssueRow,
} from "@/lib/export/issues-csv";

/**
 * `GET /api/me/issues/export` — mes tickets, en CSV.
 *
 * Deux paramètres, tous deux facultatifs et par défaut « tout » :
 *   • `project` : l'id d'un de mes projets, ou `all` ;
 *   • `statuses` : une liste séparée par des virgules (`todo,in_progress`).
 *
 * La portée vient de la SESSION, pas des paramètres : les tickets, objectifs et
 * catégories sont lus par le client de l'utilisateur, donc RLS
 * (`can_access_project`) décide de ce qui sort. Un id de projet qu'on ne peut
 * pas voir ne rend rien plutôt qu'une erreur qui renseignerait sur son
 * existence. Seuls les noms de personnes passent par le client de service —
 * `project_members` n'est pas lisible pour autrui sous RLS (même partage que
 * `GET /api/me/search-index`).
 *
 * Le format du fichier lui-même vit dans `lib/export/issues-csv.ts`, qui le
 * publie aussi sur `/llms.txt` et `/llms-full.txt` : cette route ne fait que
 * résoudre les noms et l'ordre.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const params = request.nextUrl.searchParams;
  const projectParam = params.get("project");
  const projectId = projectParam && projectParam !== "all" ? projectParam : null;
  const statuses = parseStatuses(params.get("statuses"));

  const [projectsRes, objectivesRes, categoriesRes] = await Promise.all([
    auth.supabase.from("projects").select("id, key, name, owner_id").is("deleted_at", null),
    auth.supabase.from("objectives").select("id, name"),
    auth.supabase.from("categories").select("id, name"),
  ]);

  const loadError = projectsRes.error || objectivesRes.error || categoriesRes.error;
  if (loadError) {
    console.error("[api/me/issues/export] load failed:", loadError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const projects = (projectsRes.data ?? []) as {
    id: string;
    key: string;
    name: string;
    owner_id: string;
  }[];
  const scoped = projectId ? projects.filter((p) => p.id === projectId) : projects;
  const projectById = new Map(scoped.map((p) => [p.id, p]));

  // Rien d'accessible sous cette portée : un fichier vide (en-tête seul) plutôt
  // qu'une erreur — l'utilisateur a demandé un export, il en reçoit un.
  let issues: IssueRow[] = [];
  if (scoped.length > 0) {
    let query = auth.supabase
      .from("issues")
      .select(ISSUE_COLUMNS)
      .in("status", statuses)
      // Tri STABLE côté base, pour que le plafond coupe toujours au même
      // endroit ; la mise en ordre lisible (par nom de projet) se fait ensuite.
      .order("project_id", { ascending: true })
      .order("number", { ascending: true })
      .limit(MAX_EXPORT_ISSUES);
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) {
      console.error("[api/me/issues/export] issues failed:", error.message);
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
    issues = (data ?? []) as unknown as IssueRow[];
  }

  // Le parent d'un ticket exporté peut être resté dehors (son statut n'était pas
  // demandé) : son identifiant se lit quand même, pour que la colonne `Parent`
  // dise la vérité. À la relecture, un parent absent du fichier ramène
  // simplement l'enfant au premier niveau (avertissement `parentNotFound`).
  const known = new Map(issues.map((i) => [i.id, i]));
  const orphanParents = [
    ...new Set(
      issues
        .map((i) => i.parent_id)
        .filter((id): id is string => !!id && !known.has(id))
    ),
  ];
  const parentIdentifier = new Map<string, string>();
  if (orphanParents.length > 0) {
    const { data } = await auth.supabase
      .from("issues")
      .select("id, project_id, number")
      .in("id", orphanParents);
    for (const row of (data ?? []) as { id: string; project_id: string; number: number }[]) {
      const project = projectById.get(row.project_id);
      if (project) parentIdentifier.set(row.id, issueIdentifier(project.key, row.number));
    }
  }
  for (const issue of issues) {
    const project = projectById.get(issue.project_id);
    if (project) {
      parentIdentifier.set(issue.id, issueIdentifier(project.key, issue.number));
    }
  }

  const objectiveName = new Map(
    ((objectivesRes.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name])
  );
  const categoryName = new Map(
    ((categoriesRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );

  // Les noms de personnes : ceux des membres des projets EXPORTÉS seulement.
  const { members } = await buildMembersByProject(getServiceClient(), scoped);
  const memberName = new Map<string, string>();
  for (const list of Object.values(members)) {
    for (const m of list) memberName.set(m.user_id, displayName(m));
  }

  const rows: ExportIssueRow[] = [];
  for (const issue of issues) {
    const project = projectById.get(issue.project_id);
    if (!project) continue; // projet quitté entre deux requêtes
    rows.push({
      identifier: issueIdentifier(project.key, issue.number),
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      effort: issue.effort,
      labels: (issue.issue_categories ?? [])
        .map((c) => categoryName.get(c.category_id))
        .filter((name): name is string => !!name),
      assignee: (issue.assignee_id && memberName.get(issue.assignee_id)) || null,
      objective: (issue.objective_id && objectiveName.get(issue.objective_id)) || null,
      project: project.name,
      dueDate: issue.due_date,
      createdAt: issue.created_at,
      completedAt: issue.completed_at,
      parent: (issue.parent_id && parentIdentifier.get(issue.parent_id)) || null,
    });
  }

  // Ordre du fichier : par projet (par NOM, celui qu'on lit), puis par numéro.
  rows.sort(
    (a, b) =>
      a.project.localeCompare(b.project) ||
      a.identifier.localeCompare(b.identifier, undefined, { numeric: true })
  );

  const fileName = exportFileName(
    projectId ? (projectById.get(projectId)?.key ?? null) : null,
    new Date().toISOString().slice(0, 10)
  );

  return new NextResponse(buildIssuesCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      // Ce que le dialogue annonce en retour — et l'aveu quand le plafond a
      // coupé, plutôt qu'un fichier tronqué en silence.
      "X-Minddy-Issue-Count": String(rows.length),
      ...(issues.length >= MAX_EXPORT_ISSUES ? { "X-Minddy-Truncated": "true" } : {}),
      "Cache-Control": "no-store",
    },
  });
}

const ISSUE_COLUMNS =
  "id, project_id, number, title, description, status, priority, effort, assignee_id, objective_id, parent_id, due_date, created_at, completed_at, issue_categories(category_id)";

interface IssueRow {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  status: ExportIssueRow["status"];
  priority: ExportIssueRow["priority"];
  effort: ExportIssueRow["effort"];
  assignee_id: string | null;
  objective_id: string | null;
  parent_id: string | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  issue_categories?: { category_id: string }[];
}

/** Les statuts demandés, réduits à ceux qui existent. Vide ou illisible = tous :
 *  un paramètre mal formé ne doit pas rendre un fichier vide sans le dire. */
function parseStatuses(raw: string | null): IssueStatusValue[] {
  if (!raw) return [...ISSUE_STATUSES];
  const asked = raw.split(",").map((s) => s.trim()).filter(isStatus);
  return asked.length > 0 ? [...new Set(asked)] : [...ISSUE_STATUSES];
}
