import "server-only";

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getServiceClient } from "@/lib/supabase-service";
import {
  getIssue,
  listIssues,
  listMembers,
  searchIssues,
  type ReadContext,
} from "@/lib/server/issue-reads";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { displayName } from "@/lib/display-name";
import { MAX_PLAN_LENGTH, PLAN_TASK_STATES, parsePlan, setTaskState } from "@/lib/plan";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
} from "@/lib/issue-validation";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import {
  addIssueRelation,
  findIssueRelation,
  removeIssueRelation,
} from "@/lib/server/issue-relations";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { addCommentToIssue, addCommentToFeedbackPost } from "@/lib/server/add-comment";
import { getProjectFeedbackPost } from "@/lib/server/feedback/team-guard";
import {
  listTeamFeedback,
  getTeamFeedbackDetail,
} from "@/lib/server/feedback/team-queries";
import { updateFeedbackPostFields } from "@/lib/server/feedback/posts";
import {
  linkFeedbackIssue,
  promoteFeedbackPost,
  unlinkFeedbackIssue,
} from "@/lib/server/feedback/promote";
import { FEEDBACK_POST_STATUSES } from "@/lib/feedback/types";
import {
  downloadAttachment,
  signedAttachmentUrl,
  uploadAttachment,
} from "@/lib/server/attachments";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import { getPullRequest, listPullRequestFiles } from "@/lib/server/agent/pr";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import {
  ensureCycles,
  fillCycleForUser,
  getCycleOverview,
  getCyclePrefsForUser,
} from "@/lib/server/cycles";
import { effortToPoints, statusCompletionCredit, todayISO } from "@/lib/cycle";
import { issueIdentifier, type IssueEffort, type IssueStatus } from "@/lib/issue-constants";
import type { ProjectAccess } from "@/lib/server/project-access";
import {
  ok,
  fail,
  requireUser,
  resolveProject,
  resolveIssueRef,
  type ToolExtra,
  type ToolResult,
} from "@/lib/server/mcp/tool-helpers";

/**
 * Tools MCP de minddy — nommage minddy_<verbe>_<nom>, surface volontairement
 * réduite : projets (lecture), tickets (+ plan), objectifs, commentaires.
 * Pas de Vues, pas de suppressions, pas de gestion membres/catégories.
 * Chaque tool ré-authentifie (requireUser) et re-vérifie l'accès projet —
 * il n'y a aucun état de session entre deux appels (transport stateless).
 */

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;

/** Above this, minddy_get_attachment never embeds bytes inline (base64 would
    swamp the model's context) — the signed download_url is the way in. */
const MAX_INLINE_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Plafond par fichier du diff renvoyé par minddy_get_pull_request — aligné sur
    le tool read_pull_request de Numo. */
const MAX_PATCH_CHARS = 4000;

/** Text-ish MIME → return the file as readable text rather than a base64 blob. */
function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-yaml" ||
    mime === "application/yaml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** Map a lib/server/* core failure to a stable MCP error. */
function coreFail(r: {
  status: number;
  errorKey?: string;
  rawMessage?: string;
}): ToolResult {
  const code =
    r.status === 404
      ? "not_found"
      : r.status === 400
        ? "invalid_params"
        : "database_error";
  return fail(code, r.rawMessage ?? r.errorKey ?? "Request failed");
}

const PLAN_FIELD = z
  .string()
  .max(MAX_PLAN_LENGTH)
  .describe(
    "Implementation plan — FULL markdown document, and a REAL engineering plan " +
      "(the kind a coding agent's plan mode produces), not a vague todo list. " +
      "Structure: a short context section (goal, approach, constraints), then " +
      "ordered checkbox tasks where EACH task names the actual code to touch — " +
      "exact file paths, components, functions, migrations, routes — and a final " +
      "verification step (how to test end-to-end). 'Add POST handler in " +
      "app/api/foo/route.ts with zod validation' is a good task; 'do the backend' " +
      "is not. Checkbox states: '- [ ]' pending, '- [~]' in progress, '- [x]' " +
      "completed, '- [-]' cancelled. Prose between task blocks is allowed. To " +
      "flip ONE task's state while executing, prefer minddy_update_plan_task " +
      "instead of resending the whole plan."
  );

const PROJECT_ID = z
  .string()
  .uuid()
  .describe("Project UUID — use minddy_list_projects to discover ids.");

const ISSUE_REF = z
  .string()
  .describe(
    "Issue reference: UUID, identifier like 'MIND-42', or bare issue number."
  );

/** Garde combinée auth + rate limit + accès projet des tools scopés projet. */
async function requireProject(
  extra: ToolExtra,
  projectId: unknown
): Promise<
  | { userId: string; keyId: string | null; access: ProjectAccess }
  | { error: ToolResult }
> {
  const auth = requireUser(extra);
  if ("error" in auth) return auth;
  const project = await resolveProject(auth.userId, projectId);
  if ("error" in project) return project;
  return { userId: auth.userId, keyId: auth.keyId, access: project.access };
}

function mcpReadCtx(access: ProjectAccess): ReadContext {
  const service = getServiceClient();
  return {
    db: service,
    service,
    projectId: access.project.id,
    projectKey: access.project.key,
  };
}

/** Résout un post de feedback par UUID, épinglé au projet — l'équivalent de
    resolveIssueRef pour le feedback (pas d'identifiant KEY-N, seulement l'id). */
async function resolveFeedbackPost(
  access: ProjectAccess,
  postId: unknown
): Promise<{ post: { id: string; title: string; issue_id: string | null } } | { error: ToolResult }> {
  if (typeof postId !== "string" || !postId) {
    return {
      error: fail(
        "invalid_params",
        "feedback_post_id is required — a feedback post UUID (from minddy_list_feedback)."
      ),
    };
  }
  const post = await getProjectFeedbackPost(access.project.id, postId);
  if (!post) {
    return { error: fail("feedback_not_found", "Feedback post not found in this project.") };
  }
  return { post: { id: post.id, title: post.title, issue_id: post.issue_id } };
}

/** Les 20 derniers événements d'activité d'un ticket, acteurs résolus en
    libellés lisibles (membre, « Numo », « clé (mcp) », intégration) — ordre
    chronologique, pour répondre à « qu'est-ce qui s'est passé ici ? ». */
async function recentActivity(issueId: string): Promise<Array<Record<string, unknown>>> {
  const service = getServiceClient();
  const { data } = await service
    .from("issue_events")
    .select(
      "type, field, from_value, to_value, actor_id, via_assistant, via_mcp, api_key_id, integration_id, created_at"
    )
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })
    .limit(20);
  const events = (data ?? []).reverse();
  if (events.length === 0) return [];

  const [users, keyActors, { data: integrations }] = await Promise.all([
    fetchAuthUsersById(
      service,
      events.map((e) => e.actor_id).filter((v): v is string => typeof v === "string")
    ),
    resolveApiKeyActors(events.map((e) => e.api_key_id as string | null)),
    service
      .from("integrations")
      .select("id, name")
      .in("id", [
        ...new Set(
          events
            .map((e) => e.integration_id)
            .filter((v): v is string => typeof v === "string")
        ),
      ]),
  ]);
  const integrationNames = new Map((integrations ?? []).map((i) => [i.id, i.name]));

  return events.map((e) => ({
    actor: e.via_assistant
      ? "Numo"
      : e.via_mcp
        ? `${keyActors.get(e.api_key_id as string)?.name ?? "Agent"} (mcp)`
        : e.integration_id
          ? `${integrationNames.get(e.integration_id) ?? "Integration"} (integration)`
          : displayName(toNamed(users.get(e.actor_id as string)), "User"),
    type: e.type,
    field: e.field,
    from_value: e.from_value,
    to_value: e.to_value,
    created_at: e.created_at,
  }));
}

/** Mode detailed de minddy_list_issues : noms (assigné, objectif, catégories)
    à côté des UUID — principe « human-readable identifiers ». */
async function withNames(
  rows: Array<Record<string, unknown>>,
  access: ProjectAccess
): Promise<Array<Record<string, unknown>>> {
  const service = getServiceClient();
  const [users, { data: objectives }, { data: categories }] = await Promise.all([
    fetchAuthUsersById(
      service,
      rows.map((r) => r.assignee_id).filter((v): v is string => typeof v === "string")
    ),
    service.from("objectives").select("id, name").eq("project_id", access.project.id),
    service.from("categories").select("id, name").eq("project_id", access.project.id),
  ]);
  const objectiveNames = new Map((objectives ?? []).map((o) => [o.id, o.name]));
  const categoryNames = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return rows.map((row) => ({
    ...row,
    assignee_name:
      typeof row.assignee_id === "string"
        ? displayName(toNamed(users.get(row.assignee_id)), "User")
        : null,
    objective_name:
      typeof row.objective_id === "string"
        ? (objectiveNames.get(row.objective_id) ?? null)
        : null,
    category_names: Array.isArray(row.category_ids)
      ? row.category_ids.map((id) => categoryNames.get(id as string) ?? id)
      : [],
  }));
}

export function registerMinddyTools(server: McpServer): void {
  // ── Lectures ──────────────────────────────────────────────────────────

  server.registerTool(
    "minddy_list_projects",
    {
      title: "List projects",
      description:
        "List every minddy project the API key's owner can access (owned or member). " +
        "Returns each project's id (UUID to pass as project_id elsewhere), name, key " +
        "(the issue-identifier prefix, e.g. 'MIND' in 'MIND-42') and your role.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async (_args, extra) => {
      const auth = requireUser(extra);
      if ("error" in auth) return auth.error;

      const service = getServiceClient();
      const { data: memberships, error: memberError } = await service
        .from("project_members")
        .select("project_id")
        .eq("user_id", auth.userId);
      if (memberError) return fail("database_error", memberError.message);

      const memberIds = (memberships ?? []).map((m) => m.project_id as string);
      let query = service
        .from("projects")
        .select("id, name, key, owner_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      query = memberIds.length
        ? query.or(`owner_id.eq.${auth.userId},id.in.(${memberIds.join(",")})`)
        : query.eq("owner_id", auth.userId);

      const { data, error } = await query;
      if (error) return fail("database_error", error.message);

      return ok({
        projects: (data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          key: p.key,
          role: p.owner_id === auth.userId ? "owner" : "member",
        })),
      });
    }
  );

  server.registerTool(
    "minddy_get_project",
    {
      title: "Get project",
      description:
        "Fetch one project's details: name, key, your role, and the count of open " +
        "issues (statuses other than done/canceled/duplicate).",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const { project } = scope.access;

      const service = getServiceClient();
      const { count, error } = await service
        .from("issues")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .not("status", "in", "(done,canceled,duplicate)");
      if (error) return fail("database_error", error.message);

      return ok({
        project: {
          id: project.id,
          name: project.name,
          key: project.key,
          role: scope.access.isOwner ? "owner" : "member",
          open_issues: count ?? 0,
          created_at: project.created_at,
        },
      });
    }
  );

  server.registerTool(
    "minddy_list_issues",
    {
      title: "List issues",
      description:
        "List or search a project's issues, newest-updated first. Pass `query` to " +
        "search by text, identifier ('MIND-42') or number; otherwise filters apply. " +
        "Closed issues (done/canceled/duplicate) are hidden unless include_done is " +
        "true or an explicit status filter names them. response_format 'detailed' " +
        "adds assignee/objective/category names and a truncated description; " +
        "'concise' (default) keeps rows compact. has_more tells you to paginate " +
        "with offset.",
      inputSchema: {
        project_id: PROJECT_ID,
        query: z
          .string()
          .optional()
          .describe("Text search (title/description) or exact identifier/number."),
        status: z
          .array(z.enum(ISSUE_STATUSES))
          .optional()
          .describe("Only these statuses (overrides the closed-issues default)."),
        assignee_id: z
          .string()
          .nullable()
          .optional()
          .describe("Member user_id, or null for unassigned issues."),
        objective_id: z.string().uuid().optional(),
        category_id: z.string().uuid().optional(),
        include_done: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
        offset: z.number().int().min(0).optional(),
        response_format: z.enum(["concise", "detailed"]).optional(),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ctx = mcpReadCtx(scope.access);
      const detailed = args.response_format === "detailed";

      if (typeof args.query === "string" && args.query.trim()) {
        const r = await searchIssues(ctx, { query: args.query, limit: args.limit });
        if ("error" in r) return fail("invalid_params", r.error);
        const issues = detailed ? await withNames(r.issues, scope.access) : r.issues;
        return ok({ issues, has_more: false });
      }

      const r = await listIssues(ctx, { ...args, include_description: detailed });
      if ("error" in r) return fail("database_error", r.error);
      const issues = detailed ? await withNames(r.issues, scope.access) : r.issues;
      return ok({ issues, has_more: r.has_more });
    }
  );

  server.registerTool(
    "minddy_get_issue",
    {
      title: "Get issue",
      description:
        "Fetch one issue in full: every field (title, description, status, priority, " +
        "effort, assignee, objective, due date, parent), its implementation plan " +
        "(raw markdown plus parsed plan_tasks with stable task_index for " +
        "minddy_update_plan_task, and plan_progress), comments with author names, " +
        "attachment metadata (id + file name/type/size, on the issue and on each " +
        "comment — add files with minddy_add_attachment, download them with " +
        "minddy_get_attachment), sub-issues, and the last " +
        "activity events (status changes, reassignments…) with resolved actors — " +
        "'what happened on this issue?'.",
      inputSchema: { project_id: PROJECT_ID, issue: ISSUE_REF },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const r = await getIssue(mcpReadCtx(scope.access), { issue_id: ref.issue.id });
      if ("error" in r) return fail("issue_not_found", r.error);

      const activity = await recentActivity(ref.issue.id);

      const plan = r.issue.plan;
      const parsed = typeof plan === "string" && plan ? parsePlan(plan) : null;
      return ok({
        ...r,
        activity,
        ...(parsed
          ? {
              plan_tasks: parsed.tasks.map((t) => ({
                task_index: t.index,
                state: t.state,
                text: t.text,
              })),
              plan_progress: parsed.progress,
            }
          : {}),
      });
    }
  );

  server.registerTool(
    "minddy_get_pull_request",
    {
      title: "Get pull request",
      description:
        "Read the pull request the code agent opened for an issue: its number, url, " +
        "state (open/merged/closed), title, description, head/base branches, and the " +
        "per-file diffs (patches, truncated past ~4000 chars). Use it to review a PR, " +
        "explain what it changes, or answer questions about its content. Fails if the " +
        "issue has no agent-opened PR, or if the project has no linked GitHub repo.",
      inputSchema: { project_id: PROJECT_ID, issue: ISSUE_REF },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      // La PR d'une issue est portée par sa run CANONIQUE — la plus ancienne à
      // l'avoir ouverte ; les runs suivants (demandes de changements) la partagent.
      const { data: run, error } = await getServiceClient()
        .from("agent_runs")
        .select("pr_number")
        .eq("issue_id", ref.issue.id)
        .not("pr_number", "is", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) return fail("database_error", error.message);
      const prNumber = (run as { pr_number?: number } | null)?.pr_number;
      if (prNumber == null) {
        return fail(
          "pull_request_not_found",
          `Issue '${ref.issue.identifier}' has no pull request opened by the code agent yet.`
        );
      }

      let target;
      try {
        target = await resolveRepoCloneTarget(scope.access.project.id);
      } catch (e) {
        return fail("git_link_invalid", (e as Error).message);
      }
      if (!target) {
        return fail("no_repository", "This project has no linked GitHub repository.");
      }

      try {
        const [pr, files] = await Promise.all([
          getPullRequest({
            token: target.token,
            repoFullName: target.repoFullName,
            number: prNumber,
          }),
          listPullRequestFiles({
            token: target.token,
            repoFullName: target.repoFullName,
            number: prNumber,
          }),
        ]);
        return ok({
          pull_request: {
            number: pr.number,
            url: pr.url,
            state: pr.merged ? "merged" : pr.state,
            title: pr.title,
            body: pr.body,
            head: pr.head,
            base: pr.base,
            repository: target.repoFullName,
            issue: { id: ref.issue.id, identifier: ref.issue.identifier },
            files: files.map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              // Plafonne le patch : un gros diff noierait le contexte du modèle.
              patch:
                f.patch && f.patch.length > MAX_PATCH_CHARS
                  ? f.patch.slice(0, MAX_PATCH_CHARS) + "\n… (diff truncated)"
                  : f.patch ?? null,
            })),
          },
        });
      } catch (e) {
        return fail("github_error", (e as Error).message);
      }
    }
  );

  server.registerTool(
    "minddy_list_members",
    {
      title: "List members",
      description:
        "List a project's members (owner included) with their user_id, display name " +
        "and role — use user_id for assignee_id in create/update tools.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const r = await listMembers(
        mcpReadCtx(scope.access),
        scope.access.project.owner_id
      );
      if ("error" in r) return fail("database_error", r.error);
      return ok(r);
    }
  );

  server.registerTool(
    "minddy_list_categories",
    {
      title: "List categories",
      description:
        "List a project's categories (labels). Read-only — assign them to issues " +
        "via category_ids in minddy_create_issue / minddy_update_issues.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const { data, error } = await getServiceClient()
        .from("categories")
        .select("id, name, color")
        .eq("project_id", scope.access.project.id)
        .order("name", { ascending: true });
      if (error) return fail("database_error", error.message);
      return ok({ categories: data ?? [] });
    }
  );

  server.registerTool(
    "minddy_list_objectives",
    {
      title: "List objectives",
      description:
        "List a project's objectives (issue groups with a shared goal): id, name, " +
        "status (planned/in_progress/done/canceled), lead, target date, " +
        "progress — { done, total, percent } computed from linked issues " +
        "(status 'done' / all linked), same as the UI's progress bar — and, when " +
        "present, the objective's own attachments (file name/type/size + id; " +
        "download the bytes with minddy_get_attachment).",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const service = getServiceClient();
      const [
        { data, error },
        { data: linkedIssues, error: issuesError },
        { data: attachmentRows },
      ] = await Promise.all([
        service
          .from("objectives")
          .select("id, name, status, lead_user_id, target_date, color")
          .eq("project_id", scope.access.project.id)
          .order("created_at", { ascending: true }),
        service
          .from("issues")
          .select("objective_id, status, effort")
          .eq("project_id", scope.access.project.id)
          .not("objective_id", "is", null),
        // Objective-level attachments (comment_id null) — metadata only; the
        // bytes come from minddy_get_attachment by id.
        service
          .from("attachments")
          .select("id, objective_id, file_name, mime_type, size_bytes")
          .eq("project_id", scope.access.project.id)
          .not("objective_id", "is", null)
          .is("comment_id", null)
          .order("created_at", { ascending: true }),
      ]);
      if (error) return fail("database_error", error.message);
      if (issuesError) return fail("database_error", issuesError.message);

      const attachmentsByObjective = new Map<string, Record<string, unknown>[]>();
      for (const row of attachmentRows ?? []) {
        const id = row.objective_id as string;
        const list = attachmentsByObjective.get(id) ?? [];
        list.push({
          id: row.id,
          file_name: row.file_name,
          mime_type: row.mime_type,
          size_bytes: row.size_bytes,
        });
        attachmentsByObjective.set(id, list);
      }

      // Progression : done/total restent des comptes bruts de tickets pour le
      // label, mais percent est pondéré par l'effort en points Fibonacci
      // (effortToPoints) avec crédit partiel par statut — même calcul que
      // objectiveProgress dans lib/use-objectives-query.ts (MIN-56).
      const progress = new Map<
        string,
        { done: number; total: number; totalPoints: number; earnedPoints: number }
      >();
      for (const issue of linkedIssues ?? []) {
        const id = issue.objective_id as string;
        const entry =
          progress.get(id) ?? { done: 0, total: 0, totalPoints: 0, earnedPoints: 0 };
        entry.total += 1;
        if (issue.status === "done") entry.done += 1;
        const points = effortToPoints(issue.effort as IssueEffort | null);
        entry.totalPoints += points;
        entry.earnedPoints += points * statusCompletionCredit(issue.status as IssueStatus);
        progress.set(id, entry);
      }

      const leads = await fetchAuthUsersById(
        service,
        (data ?? [])
          .map((o) => o.lead_user_id)
          .filter((v): v is string => typeof v === "string")
      );
      return ok({
        objectives: (data ?? []).map((o) => {
          const p =
            progress.get(o.id as string) ??
            { done: 0, total: 0, totalPoints: 0, earnedPoints: 0 };
          const atts = attachmentsByObjective.get(o.id as string);
          return {
            ...o,
            lead_name: o.lead_user_id
              ? displayName(toNamed(leads.get(o.lead_user_id)), "User")
              : null,
            progress: {
              done: p.done,
              total: p.total,
              percent:
                p.totalPoints === 0
                  ? 0
                  : Math.round((p.earnedPoints / p.totalPoints) * 100),
            },
            ...(atts ? { attachments: atts } : {}),
          };
        }),
      });
    }
  );

  // ── Écritures (pas de suppressions) ───────────────────────────────────

  server.registerTool(
    "minddy_create_issue",
    {
      title: "Create issue",
      description:
        "Create an issue in a project. Only title is required; status defaults to " +
        "'backlog' (the issue lands directly on the board — the human is driving " +
        "you). Set parent to make a sub-issue (one level max; it inherits the " +
        "parent's objective unless objective_id is set). description = WHAT/WHY " +
        "(the problem or feature); plan = HOW (the full implementation plan — see " +
        "the plan field spec). Pass sub_issues to split the work into sub-tickets " +
        "in the same call (the 'plan a feature and break it down' workflow). " +
        "Returns the created issue (and sub-issues) with identifiers.",
      inputSchema: {
        project_id: PROJECT_ID,
        title: z.string().min(1),
        description: z.string().optional().describe("Markdown."),
        plan: PLAN_FIELD.optional(),
        status: z.enum(ISSUE_STATUSES).optional().describe("Default: backlog."),
        priority: z.enum(ISSUE_PRIORITIES).optional().describe("Default: none."),
        effort: z.enum(ISSUE_EFFORTS).optional(),
        assignee_id: z
          .string()
          .optional()
          .describe("Member user_id — see minddy_list_members."),
        objective_id: z.string().uuid().optional(),
        parent: ISSUE_REF.optional().describe("Parent issue → creates a sub-issue."),
        due_date: z.string().optional().describe("ISO 8601 date or datetime."),
        category_ids: z.array(z.string().uuid()).optional(),
        sub_issues: z
          .array(
            z.object({
              title: z.string().min(1),
              description: z.string().optional(),
              plan: PLAN_FIELD.optional(),
              status: z.enum(ISSUE_STATUSES).optional(),
              priority: z.enum(ISSUE_PRIORITIES).optional(),
              effort: z.enum(ISSUE_EFFORTS).optional(),
              assignee_id: z.string().optional(),
              due_date: z.string().optional(),
              category_ids: z.array(z.string().uuid()).optional(),
            })
          )
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Sub-issues created under the new issue, in order. They inherit its " +
              "objective. Incompatible with parent (nesting is one level max)."
          ),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      let parentId: string | undefined;
      if (args.parent) {
        if (args.sub_issues?.length) {
          return fail(
            "invalid_params",
            "sub_issues can't be combined with parent — nesting is limited to one level."
          );
        }
        const parent = await resolveIssueRef(scope.access, args.parent);
        if ("error" in parent) return parent.error;
        parentId = parent.issue.id;
      }

      const { sub_issues: subInputs, ...issueArgs } = args;
      const result = await createIssueForProject({
        projectId: scope.access.project.id,
        projectName: scope.access.project.name,
        actorId: scope.userId,
        input: { ...issueArgs, ...(parentId ? { parent_id: parentId } : {}) },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      const identifier = issueIdentifier(
        scope.access.project.key,
        result.issue.number as number
      );

      // Sous-tickets : créés dans l'ordre, échecs remontés individuellement —
      // le parent existe déjà, on ne le rollback pas.
      const subIssues: Array<Record<string, unknown>> = [];
      const subIssuesFailed: Array<{ title: string; error: string }> = [];
      for (const sub of subInputs ?? []) {
        const subResult = await createIssueForProject({
          projectId: scope.access.project.id,
          projectName: scope.access.project.name,
          actorId: scope.userId,
          input: { ...sub, parent_id: result.issue.id },
          mcpKeyId: scope.keyId,
        });
        if (subResult.ok) {
          subIssues.push({
            id: subResult.issue.id,
            identifier: issueIdentifier(
              scope.access.project.key,
              subResult.issue.number as number
            ),
            title: subResult.issue.title,
          });
        } else {
          subIssuesFailed.push({
            title: sub.title,
            error: subResult.rawMessage ?? subResult.errorKey ?? "create failed",
          });
        }
      }

      return ok({
        issue: { ...result.issue, identifier },
        ...(subInputs?.length
          ? { sub_issues: subIssues, sub_issues_failed: subIssuesFailed }
          : {}),
      });
    }
  );

  server.registerTool(
    "minddy_update_issues",
    {
      title: "Update issues",
      description:
        "Apply the same field changes to 1–50 issues of a project (single edits: " +
        "pass one issue). Only the fields you send change; null clears a nullable " +
        "field. category_ids REPLACES the issue's full category set. plan replaces " +
        "the whole plan markdown — for one checkbox, use minddy_update_plan_task. " +
        "Returns per-issue failures, so check `failed` in the result.",
      inputSchema: {
        project_id: PROJECT_ID,
        issues: z.array(ISSUE_REF).min(1).max(50),
        fields: z
          .object({
            title: z.string().min(1).optional(),
            description: z.string().nullable().optional(),
            plan: PLAN_FIELD.nullable().optional(),
            status: z.enum(ISSUE_STATUSES).optional(),
            priority: z.enum(ISSUE_PRIORITIES).optional(),
            effort: z.enum(ISSUE_EFFORTS).nullable().optional(),
            assignee_id: z.string().nullable().optional(),
            objective_id: z.string().uuid().nullable().optional(),
            parent: ISSUE_REF.nullable().optional(),
            duplicate_of: ISSUE_REF.nullable().optional()
              .describe("With status 'duplicate': the issue this one duplicates."),
            due_date: z.string().nullable().optional(),
            category_ids: z.array(z.string().uuid()).optional(),
          })
          .describe("At least one field."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      // Résoudre les références d'issues des champs AVANT la boucle.
      const { category_ids, parent, duplicate_of, ...fields } = args.fields as Record<
        string,
        unknown
      > & { category_ids?: string[]; parent?: string | null; duplicate_of?: string | null };
      if ("parent" in args.fields) {
        if (parent) {
          const r = await resolveIssueRef(scope.access, parent);
          if ("error" in r) return r.error;
          fields.parent_id = r.issue.id;
        } else fields.parent_id = null;
      }
      if ("duplicate_of" in args.fields) {
        if (duplicate_of) {
          const r = await resolveIssueRef(scope.access, duplicate_of);
          if ("error" in r) return r.error;
          fields.duplicate_of_id = r.issue.id;
        } else fields.duplicate_of_id = null;
      }
      if (Object.keys(fields).length === 0 && !category_ids) {
        return fail("invalid_params", "fields must contain at least one field.");
      }

      const updated: string[] = [];
      const failed: Array<{ issue: string; error: string }> = [];
      for (const ref of args.issues) {
        const resolved = await resolveIssueRef(scope.access, ref);
        if ("error" in resolved) {
          failed.push({ issue: ref, error: `Issue '${ref}' not found in this project.` });
          continue;
        }
        if (Object.keys(fields).length > 0) {
          const result = await updateIssueFields({
            issueId: resolved.issue.id,
            actorId: scope.userId,
            input: fields,
            mcpKeyId: scope.keyId,
          });
          if (!result.ok) {
            failed.push({
              issue: resolved.issue.identifier,
              error: result.rawMessage ?? result.errorKey ?? "update failed",
            });
            continue;
          }
        }
        if (category_ids) {
          const result = await setIssueCategories({
            issueId: resolved.issue.id,
            actorId: scope.userId,
            categoryIds: category_ids,
            mcpKeyId: scope.keyId,
          });
          if (!result.ok) {
            failed.push({
              issue: resolved.issue.identifier,
              error: result.rawMessage ?? result.errorKey ?? "categories update failed",
            });
            continue;
          }
        }
        updated.push(resolved.issue.identifier);
      }

      return ok({ updated, failed });
    }
  );

  server.registerTool(
    "minddy_update_plan_task",
    {
      title: "Update plan tasks",
      description:
        "Flip one or several tasks of an issue's implementation plan to new states " +
        "without resending the plan markdown — e.g. mark the finished tasks '- [x]' " +
        "and the next one '- [~]' in a single call at the end of a work session. " +
        "task_index comes from minddy_get_issue's plan_tasks (0-based, in document " +
        "order; indexes are stable — state flips don't renumber). States: pending " +
        "('- [ ]'), in_progress ('- [~]'), completed ('- [x]'), cancelled ('- [-]'). " +
        "All-or-nothing: an invalid index rejects the whole batch. Returns the " +
        "refreshed plan_tasks and plan_progress.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        tasks: z
          .array(
            z.object({
              task_index: z.number().int().min(0),
              state: z.enum(PLAN_TASK_STATES),
            })
          )
          .min(1)
          .max(50),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const { data: row, error } = await getServiceClient()
        .from("issues")
        .select("plan")
        .eq("id", ref.issue.id)
        .maybeSingle();
      if (error) return fail("database_error", error.message);
      const plan = typeof row?.plan === "string" ? row.plan : "";
      const parsed = parsePlan(plan);

      // Tout-ou-rien : valider chaque index avant de toucher au markdown.
      const invalid = args.tasks
        .map((t) => t.task_index)
        .filter((i) => !parsed.tasks[i]);
      if (invalid.length > 0) {
        return fail(
          "plan_task_not_found",
          `No plan task at index(es) ${[...new Set(invalid)].join(", ")} — ` +
            `${ref.issue.identifier} has ${parsed.tasks.length} task(s). ` +
            "Fetch minddy_get_issue for plan_tasks."
        );
      }

      // Les numéros de ligne restent stables : setTaskState ne réécrit que le
      // marqueur d'état, jamais la structure du document.
      let nextPlan = plan;
      for (const t of args.tasks) {
        nextPlan = setTaskState(nextPlan, parsed.tasks[t.task_index].line, t.state);
      }

      const result = await updateIssueFields({
        issueId: ref.issue.id,
        actorId: scope.userId,
        input: { plan: nextPlan },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);

      const refreshed = parsePlan((result.issue.plan as string) ?? "");
      return ok({
        issue: ref.issue.identifier,
        plan_tasks: refreshed.tasks.map((t) => ({
          task_index: t.index,
          state: t.state,
          text: t.text,
        })),
        plan_progress: refreshed.progress,
      });
    }
  );

  server.registerTool(
    "minddy_add_comment",
    {
      title: "Add comment",
      description:
        "Post a markdown comment on an issue — e.g. to report progress or leave a " +
        "note for the team. The timeline shows the agent as the author (this API " +
        "key's name with an '(mcp)' marker), not the key's owner. To attach a file " +
        "to the comment, call minddy_add_attachment with the returned comment id.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        body: z.string().min(1).describe("Markdown."),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const result = await addCommentToIssue({
        issueId: ref.issue.id,
        actorId: scope.userId,
        body: args.body,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ comment: result.comment });
    }
  );

  server.registerTool(
    "minddy_add_attachment",
    {
      title: "Add attachment",
      description:
        "Attach a file to an issue, or to one of its comments (pass comment_id — " +
        "e.g. the id minddy_add_comment returned). Content is sent inline as " +
        "base64, 10 MB max after decoding. The file lands in minddy's private " +
        "storage and shows as a pill in the app; minddy_get_issue lists the " +
        "attachment metadata.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        comment_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Attach to this comment of the issue instead of the issue itself."
          ),
        file_name: z
          .string()
          .min(1)
          .max(200)
          .describe("Display name, extension included (e.g. 'screenshot.png')."),
        mime_type: z
          .string()
          .max(120)
          .optional()
          .describe("MIME type; defaults to application/octet-stream."),
        content_base64: z
          .string()
          .min(1)
          .max(14_000_000)
          .describe("File content, base64-encoded (no 'data:' prefix)."),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveIssueRef(scope.access, args.issue);
      if ("error" in ref) return ref.error;

      const normalized = args.content_base64.replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
        return fail("invalid_params", "content_base64 is not valid base64.");
      }
      const data = Buffer.from(normalized, "base64");
      if (data.byteLength === 0) {
        return fail("invalid_params", "Empty file.");
      }
      if (data.byteLength > 10 * 1024 * 1024) {
        return fail("invalid_params", "File exceeds the 10 MB cap.");
      }

      if (args.comment_id) {
        const { data: comment } = await getServiceClient()
          .from("comments")
          .select("id, issue_id")
          .eq("id", args.comment_id)
          .maybeSingle();
        if (!comment || comment.issue_id !== ref.issue.id) {
          return fail("not_found", "Comment not found on this issue.");
        }
      }

      try {
        const attachment = await uploadAttachment(getServiceClient(), {
          projectId: scope.access.project.id,
          issueId: ref.issue.id,
          commentId: args.comment_id ?? null,
          createdBy: scope.userId,
          fileName: args.file_name,
          mimeType: args.mime_type,
          data,
        });
        return ok({
          attachment: {
            id: attachment.id,
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
            comment_id: attachment.comment_id,
          },
        });
      } catch (e) {
        return fail("database_error", (e as Error).message);
      }
    }
  );

  server.registerTool(
    "minddy_get_attachment",
    {
      title: "Get attachment",
      description:
        "Download one attachment — of an issue, an objective, or a comment. Pass the " +
        "attachment_id you got from minddy_get_issue (issue and comment attachments) " +
        "or minddy_list_objectives (objective attachments). By default returns the " +
        "file metadata and a short-lived signed download_url (~10 min) — fetch that " +
        "URL to grab the bytes without loading them into context, whatever the size. " +
        "Set include_content=true to also embed the file inline (base64): images come " +
        "back viewable, text-ish files as readable text, anything else as a resource " +
        "blob. Inline content is capped at 10 MB — larger files stay URL-only.",
      inputSchema: {
        project_id: PROJECT_ID,
        attachment_id: z
          .string()
          .uuid()
          .describe("Attachment id from minddy_get_issue / minddy_list_objectives."),
        include_content: z
          .boolean()
          .optional()
          .describe(
            "Embed the file bytes in the result (base64), not just the URL. " +
              "Default false. Skipped for files over 10 MB."
          ),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      const service = getServiceClient();
      // Scope by project_id (attachments carry it directly) — one door for
      // issue, objective and comment attachments alike.
      const { data: row, error } = await service
        .from("attachments")
        .select(
          "id, storage_path, file_name, mime_type, size_bytes, issue_id, objective_id, comment_id"
        )
        .eq("id", args.attachment_id)
        .eq("project_id", scope.access.project.id)
        .maybeSingle();
      if (error) return fail("database_error", error.message);
      if (!row) return fail("not_found", "Attachment not found in this project.");

      const fileName = (row.file_name as string) || "attachment";
      const mime = (row.mime_type as string) || "application/octet-stream";
      const size = typeof row.size_bytes === "number" ? row.size_bytes : 0;

      const url = await signedAttachmentUrl(service, row.storage_path as string, {
        download: fileName,
        expiresIn: 600,
      });

      const meta: Record<string, unknown> = {
        id: row.id,
        file_name: row.file_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        issue_id: row.issue_id,
        objective_id: row.objective_id,
        comment_id: row.comment_id,
        download_url: url,
        download_url_expires_in_seconds: 600,
      };

      if (!args.include_content) return ok(meta);
      if (size > MAX_INLINE_ATTACHMENT_BYTES) {
        return ok({
          ...meta,
          content_omitted: `File is larger than the ${
            MAX_INLINE_ATTACHMENT_BYTES / (1024 * 1024)
          } MB inline cap — fetch download_url instead.`,
        });
      }

      const data = await downloadAttachment(service, row.storage_path as string);
      if (!data) {
        return ok({ ...meta, content_omitted: "The stored file could not be read." });
      }

      const content: Array<Record<string, unknown>> = [
        { type: "text", text: JSON.stringify(meta, null, 2) },
      ];
      if (mime.startsWith("image/")) {
        content.push({ type: "image", data: data.toString("base64"), mimeType: mime });
      } else if (isTextMime(mime)) {
        content.push({
          type: "resource",
          resource: {
            uri: `minddy://attachments/${row.id}`,
            mimeType: mime,
            text: data.toString("utf8"),
          },
        });
      } else {
        content.push({
          type: "resource",
          resource: {
            uri: `minddy://attachments/${row.id}`,
            mimeType: mime,
            blob: data.toString("base64"),
          },
        });
      }
      return { content } as unknown as ToolResult;
    }
  );

  server.registerTool(
    "minddy_link_issues",
    {
      title: "Link issues",
      description:
        "Create or remove a relation between two issues (MIN-25). From `issue`'s " +
        "point of view: 'blocks' (issue blocks target), 'blocked_by' (issue is " +
        "blocked by target), or 'related' (a soft link). Pass remove=true to delete " +
        "that relation instead. Idempotent — adding an existing relation, or " +
        "removing an absent one, is a no-op.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        relation: z
          .enum(["blocks", "blocked_by", "related"])
          .describe("Relation type from `issue`'s perspective."),
        target: ISSUE_REF.describe("The other issue in the relation."),
        remove: z
          .boolean()
          .optional()
          .describe("Remove the relation instead of adding it."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const src = await resolveIssueRef(scope.access, args.issue);
      if ("error" in src) return src.error;
      const tgt = await resolveIssueRef(scope.access, args.target);
      if ("error" in tgt) return tgt.error;
      if (src.issue.id === tgt.issue.id) {
        return fail("invalid_params", "An issue can't be related to itself.");
      }

      if (args.remove) {
        const existing = await findIssueRelation(
          scope.access.project.id,
          src.issue.id,
          args.relation,
          tgt.issue.id
        );
        if (!existing) {
          return ok({ removed: false, issue: src.issue.identifier, target: tgt.issue.identifier });
        }
        const result = await removeIssueRelation({
          relationId: existing.id,
          actorId: scope.userId,
          mcpKeyId: scope.keyId,
        });
        if (!result.ok) return coreFail(result);
        return ok({
          removed: true,
          issue: src.issue.identifier,
          relation: args.relation,
          target: tgt.issue.identifier,
        });
      }

      const result = await addIssueRelation({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        sourceId: src.issue.id,
        targetId: tgt.issue.id,
        type: args.relation,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        added: true,
        issue: src.issue.identifier,
        relation: args.relation,
        target: tgt.issue.identifier,
      });
    }
  );

  server.registerTool(
    "minddy_create_objective",
    {
      title: "Create objective",
      description:
        "Create an objective (a named group of issues with a shared goal) in a " +
        "project. Link issues to it afterwards via objective_id in " +
        "minddy_create_issue / minddy_update_issues.",
      inputSchema: {
        project_id: PROJECT_ID,
        name: z.string().min(1),
        description: z.string().optional().describe("Markdown."),
        status: z.enum(["planned", "in_progress", "done", "canceled"]).optional(),
        lead_user_id: z.string().optional().describe("Member user_id."),
        target_date: z.string().optional().describe("ISO 8601 date."),
        color: z.string().optional().describe("Hex color, e.g. '#6b7280'."),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const result = await createObjective({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        input: args,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ objective: result.objective });
    }
  );

  server.registerTool(
    "minddy_update_objective",
    {
      title: "Update objective",
      description:
        "Update an objective's fields. Only the fields you send change; null " +
        "clears lead_user_id / target_date / color.",
      inputSchema: {
        project_id: PROJECT_ID,
        objective_id: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(["planned", "in_progress", "done", "canceled"]).optional(),
        lead_user_id: z.string().nullable().optional(),
        target_date: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      // Scope check : l'objectif doit appartenir au projet en question.
      const { data: obj } = await getServiceClient()
        .from("objectives")
        .select("id")
        .eq("id", args.objective_id)
        .eq("project_id", scope.access.project.id)
        .maybeSingle();
      if (!obj) return fail("not_found", "Objective not found in this project.");

      const result = await updateObjective({
        objectiveId: args.objective_id,
        actorId: scope.userId,
        input: args,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ objective: result.objective });
    }
  );

  // ── Cycles (MIN-32) — le cycle personnel cross-projet du propriétaire de
  // la clé. Pas de project_id sur les lectures/fill (le cycle traverse les
  // projets) ; add/remove résolvent leurs références d'issues dans UN projet,
  // comme tous les autres tools — appeler une fois par projet si besoin.
  // Mêmes cœurs que Numo (lib/server/cycles.ts) : parité par construction.

  /** Garde commune des tools cycle : auth + prefs (cycles activés). */
  async function requireCycle(
    extra: ToolExtra
  ): Promise<
    | { userId: string; keyId: string | null; prefs: Awaited<ReturnType<typeof getCyclePrefsForUser>> }
    | { error: ToolResult }
  > {
    const auth = requireUser(extra);
    if ("error" in auth) return auth;
    const prefs = await getCyclePrefsForUser(getServiceClient(), auth.userId);
    if (!prefs.enabled) {
      return {
        error: fail(
          "cycles_disabled",
          "Cycles are not enabled for this account. The owner can enable them in Account → Cycles."
        ),
      };
    }
    return { userId: auth.userId, keyId: auth.keyId, prefs };
  }

  server.registerTool(
    "minddy_get_cycle",
    {
      title: "Get cycle",
      description:
        "Read the key owner's cycle: their PERSONAL, CROSS-PROJECT week/fortnight " +
        "('what am I working on right now'), identified by its dates. Returns the " +
        "cycle (dates, intensity, capacity target and filled points, completion %), " +
        "the issues in it (with identifiers, across all projects), and the best " +
        "next candidates from their assigned pool (reco-scored, `blocks` relations " +
        "respected). Points are an internal capacity unit — talk to humans in " +
        "effort sizes or percentages, never raw points. Reading also reconciles " +
        "the timeline (cycle creation, rollover, one-shot auto-fill).",
      inputSchema: {
        which: z
          .enum(["current", "next", "previous"])
          .optional()
          .describe("Which cycle to read. Default: current."),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const r = await getCycleOverview({
        service: getServiceClient(),
        userId: scope.userId,
        prefs: scope.prefs,
        which: args.which,
      });
      if (!r.ok) return fail("not_found", r.error);
      return ok(r.overview);
    }
  );

  server.registerTool(
    "minddy_fill_cycle",
    {
      title: "Fill cycle",
      description:
        "Top up the key owner's CURRENT cycle with the deterministic engine: it " +
        "picks from the issues assigned to them (no cycle yet, open status), by " +
        "priority + unblocked (`blocks` relations respected) + smallest first, " +
        "until the capacity target is reached. The optional weights steer the " +
        "scoring ('prioritize UI fixes' → keyword/category boosts) — they bias " +
        "the same deterministic engine, they NEVER force a pick. Weights default " +
        "to 1; boosts are additive score points (10–100 = mild–strong).",
      inputSchema: {
        priority_weight: z
          .number()
          .positive()
          .optional()
          .describe("Multiplier on the issue-priority component (default 1)."),
        unblocked_weight: z
          .number()
          .positive()
          .optional()
          .describe("Multiplier on the not-blocked bonus (default 1)."),
        small_first_weight: z
          .number()
          .positive()
          .optional()
          .describe("Multiplier on the smallest-first component (default 1)."),
        project_boosts: z
          .array(z.object({ project_id: z.string().uuid(), weight: z.number() }))
          .optional()
          .describe("Additive boost per project id."),
        category_boosts: z
          .array(z.object({ category_id: z.string().uuid(), weight: z.number() }))
          .optional()
          .describe("Additive boost per category id."),
        keyword_boosts: z
          .array(z.object({ keyword: z.string().min(1), weight: z.number() }))
          .optional()
          .describe("Additive boost when the issue title contains the keyword."),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const service = getServiceClient();
      const ensured = await ensureCycles({
        service,
        userId: scope.userId,
        prefs: scope.prefs,
        today: todayISO(),
      });
      if (!ensured.current) return fail("not_found", "No current cycle exists yet.");

      const toBoostMap = (
        rows: Array<Record<string, unknown>> | undefined,
        idKey: string
      ): Record<string, number> | undefined => {
        if (!rows?.length) return undefined;
        return Object.fromEntries(rows.map((r) => [r[idKey] as string, r.weight as number]));
      };
      const { pickedIds, points } = await fillCycleForUser({
        service,
        userId: scope.userId,
        actorId: scope.userId,
        cycle: ensured.current,
        weights: {
          priority: args.priority_weight,
          unblocked: args.unblocked_weight,
          small: args.small_first_weight,
          projectBoost: toBoostMap(args.project_boosts, "project_id"),
          categoryBoost: toBoostMap(args.category_boosts, "category_id"),
          keywordBoost: args.keyword_boosts,
        },
      });
      return ok({
        added: pickedIds.length,
        added_ids: pickedIds,
        added_points: points,
        cycle_id: ensured.current.id,
      });
    }
  );

  server.registerTool(
    "minddy_add_to_cycle",
    {
      title: "Add to cycle",
      description:
        "Add issues (1–50) of a project to the key owner's CURRENT cycle. Adding " +
        "ASSIGNS each issue to the owner as a side-effect; it NEVER changes the " +
        "status (the cycle is orthogonal to status). Reassigning an issue to " +
        "someone else later silently drops it from the cycle. The cycle is " +
        "cross-project — call once per project to add issues from several.",
      inputSchema: {
        project_id: PROJECT_ID,
        issues: z.array(ISSUE_REF).min(1).max(50),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const project = await resolveProject(scope.userId, args.project_id);
      if ("error" in project) return project.error;
      const ensured = await ensureCycles({
        service: getServiceClient(),
        userId: scope.userId,
        prefs: scope.prefs,
        today: todayISO(),
      });
      if (!ensured.current) return fail("not_found", "No current cycle exists yet.");

      const added: string[] = [];
      const failed: Array<{ issue: string; error: string }> = [];
      for (const ref of args.issues) {
        const resolved = await resolveIssueRef(project.access, ref);
        if ("error" in resolved) {
          failed.push({ issue: ref, error: `Issue '${ref}' not found in this project.` });
          continue;
        }
        const r = await updateIssueFields({
          issueId: resolved.issue.id,
          actorId: scope.userId,
          input: { cycle_id: ensured.current.id },
          mcpKeyId: scope.keyId,
        });
        if (r.ok) added.push(resolved.issue.identifier);
        else
          failed.push({
            issue: resolved.issue.identifier,
            error: r.rawMessage ?? r.errorKey ?? "update failed",
          });
      }
      return ok({ added, failed, cycle_id: ensured.current.id });
    }
  );

  server.registerTool(
    "minddy_remove_from_cycle",
    {
      title: "Remove from cycle",
      description:
        "Remove issues (1–50) of a project from the key owner's CURRENT cycle. " +
        "Assignment and status are untouched — the issues simply leave the cycle. " +
        "Issues that aren't in the owner's current cycle are reported in `failed`.",
      inputSchema: {
        project_id: PROJECT_ID,
        issues: z.array(ISSUE_REF).min(1).max(50),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireCycle(extra);
      if ("error" in scope) return scope.error;
      const project = await resolveProject(scope.userId, args.project_id);
      if ("error" in project) return project.error;
      const service = getServiceClient();
      const ensured = await ensureCycles({
        service,
        userId: scope.userId,
        prefs: scope.prefs,
        today: todayISO(),
      });
      if (!ensured.current) return fail("not_found", "No current cycle exists yet.");

      const removed: string[] = [];
      const failed: Array<{ issue: string; error: string }> = [];
      for (const ref of args.issues) {
        const resolved = await resolveIssueRef(project.access, ref);
        if ("error" in resolved) {
          failed.push({ issue: ref, error: `Issue '${ref}' not found in this project.` });
          continue;
        }
        // Only pull issues out of the owner's OWN current cycle — project
        // access alone must not allow draining someone else's cycle.
        const { data: row } = await service
          .from("issues")
          .select("cycle_id")
          .eq("id", resolved.issue.id)
          .maybeSingle();
        if (!row || row.cycle_id !== ensured.current.id) {
          failed.push({
            issue: resolved.issue.identifier,
            error: "Not in the owner's current cycle.",
          });
          continue;
        }
        const r = await updateIssueFields({
          issueId: resolved.issue.id,
          actorId: scope.userId,
          input: { cycle_id: null },
          mcpKeyId: scope.keyId,
        });
        if (r.ok) removed.push(resolved.issue.identifier);
        else
          failed.push({
            issue: resolved.issue.identifier,
            error: r.rawMessage ?? r.errorKey ?? "update failed",
          });
      }
      return ok({ removed, failed });
    }
  );

  // ── Feedback (user requests collected on the project's board / API) ──────
  server.registerTool(
    "minddy_list_feedback",
    {
      title: "List feedback",
      description:
        "List a project's feedback posts (user requests from the feedback board, its " +
        "API, or internal entry) — id (the feedback_post_id other feedback tools " +
        "take), title, public status (open/planned/in_progress/shipped/declined), " +
        "vote_count, whether it's public, source, and the linked tracking issue if " +
        "any. Sorted by votes; merged duplicates are excluded.",
      inputSchema: {
        project_id: PROJECT_ID,
        status: z
          .array(z.enum(FEEDBACK_POST_STATUSES))
          .optional()
          .describe("Only these public statuses. Omit for all."),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
      },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const posts = await listTeamFeedback(scope.access.project.id);
      const statuses = args.status ? new Set(args.status) : null;
      const rows = posts
        .filter((p) => !statuses || statuses.has(p.status))
        .slice(0, args.limit ?? 50)
        .map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          vote_count: p.vote_count,
          is_public: p.is_public,
          source: p.source,
          linked_issue_id: p.issue_id,
        }));
      return ok({ feedback: rows });
    }
  );

  server.registerTool(
    "minddy_get_feedback",
    {
      title: "Get feedback",
      description:
        "Fetch one feedback post in full: title, body (the user's request), the raw " +
        "submitted text, public status, vote_count, author (real identity), the " +
        "linked issue if any, and its internal, team-only comment thread.",
      inputSchema: { project_id: PROJECT_ID, feedback_post_id: z.string().uuid() },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const detail = await getTeamFeedbackDetail(
        scope.access.project.id,
        args.feedback_post_id
      );
      if (!detail) return fail("feedback_not_found", "Feedback post not found in this project.");

      const service = getServiceClient();
      const { data: comments } = await service
        .from("comments")
        .select("author_id, via_assistant, body, created_at")
        .eq("feedback_post_id", args.feedback_post_id)
        .order("created_at", { ascending: true });
      const users = await fetchAuthUsersById(
        service,
        (comments ?? [])
          .map((c) => c.author_id as string | null)
          .filter((v): v is string => !!v)
      );

      return ok({
        feedback: {
          id: detail.id,
          title: detail.title,
          body: detail.body,
          submitted_title: detail.submitted_title,
          submitted_body: detail.submitted_body,
          status: detail.status,
          vote_count: detail.vote_count,
          is_public: detail.is_public,
          source: detail.source,
          team_response: detail.team_response,
          author: detail.author
            ? { name: detail.author.name, email: detail.author.email }
            : null,
          linked_issue: detail.issue
            ? {
                id: detail.issue.id,
                identifier: issueIdentifier(scope.access.project.key, detail.issue.number),
                status: detail.issue.status,
              }
            : null,
          comments: (comments ?? []).map((c) => ({
            author: c.via_assistant
              ? "Numo"
              : displayName(toNamed(c.author_id ? users.get(c.author_id as string) : null), "User"),
            body: c.body,
            created_at: c.created_at,
          })),
        },
      });
    }
  );

  server.registerTool(
    "minddy_add_feedback_comment",
    {
      title: "Add feedback comment",
      description:
        "Post an internal, team-only comment on a feedback post (never shown on the " +
        "public board) — e.g. to leave triage notes. The timeline shows the agent as " +
        "the author (this API key's name with an '(mcp)' marker), not the key's owner.",
      inputSchema: {
        project_id: PROJECT_ID,
        feedback_post_id: z.string().uuid(),
        body: z.string().min(1).describe("Markdown."),
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const result = await addCommentToFeedbackPost({
        postId: ref.post.id,
        actorId: scope.userId,
        body: args.body,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({ comment: result.comment });
    }
  );

  server.registerTool(
    "minddy_promote_feedback",
    {
      title: "Promote feedback to issue",
      description:
        "Turn a feedback post into a NEW backlog issue and link them: the issue " +
        "carries the request and its vote count, and the post's public status then " +
        "follows that issue automatically. Fails if the post is already linked or is " +
        "a merged duplicate. Use minddy_link_feedback instead when an issue already " +
        "tracks the request.",
      inputSchema: { project_id: PROJECT_ID, feedback_post_id: z.string().uuid() },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const result = await promoteFeedbackPost({
        postId: ref.post.id,
        actorId: scope.userId,
        projectName: scope.access.project.name,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        issue: {
          ...result.issue,
          identifier: issueIdentifier(
            scope.access.project.key,
            result.issue.number as number
          ),
        },
      });
    }
  );

  server.registerTool(
    "minddy_link_feedback",
    {
      title: "Link feedback to issue",
      description:
        "Link a feedback post to an EXISTING issue (the work is already tracked). The " +
        "post's public status immediately reflects the issue and follows its " +
        "transitions. Fails if the post is already linked or merged.",
      inputSchema: {
        project_id: PROJECT_ID,
        feedback_post_id: z.string().uuid(),
        issue: ISSUE_REF,
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;
      const issueRef = await resolveIssueRef(scope.access, args.issue);
      if ("error" in issueRef) return issueRef.error;

      const result = await linkFeedbackIssue({
        postId: ref.post.id,
        issueId: issueRef.issue.id,
        actorId: scope.userId,
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        linked: true,
        feedback_post_id: ref.post.id,
        issue: issueRef.issue.identifier,
      });
    }
  );

  server.registerTool(
    "minddy_unlink_feedback",
    {
      title: "Unlink feedback",
      description:
        "Detach the issue currently linked to a feedback post (the post keeps its " +
        "last public status).",
      inputSchema: { project_id: PROJECT_ID, feedback_post_id: z.string().uuid() },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const okDone = await unlinkFeedbackIssue(ref.post.id, scope.userId, scope.keyId);
      if (!okDone) return fail("database_error", "Could not unlink the feedback post.");
      return ok({ unlinked: true, feedback_post_id: ref.post.id });
    }
  );

  server.registerTool(
    "minddy_respond_feedback",
    {
      title: "Respond to feedback",
      description:
        "Publish (or update) the official TEAM RESPONSE on a feedback post — the " +
        "single reply shown PUBLICLY to everyone who submitted it, signed on behalf " +
        "of the team. This is PUBLIC-facing. Pass an empty string to remove it.",
      inputSchema: {
        project_id: PROJECT_ID,
        feedback_post_id: z.string().uuid(),
        response: z.string().describe("Public team response; empty string clears it."),
      },
      annotations: WRITE_IDEMPOTENT,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const ref = await resolveFeedbackPost(scope.access, args.feedback_post_id);
      if ("error" in ref) return ref.error;

      const result = await updateFeedbackPostFields({
        postId: ref.post.id,
        actorId: scope.userId,
        input: { team_response: args.response },
        mcpKeyId: scope.keyId,
      });
      if (!result.ok) return coreFail(result);
      return ok({
        feedback_post_id: ref.post.id,
        team_response: result.post.team_response,
      });
    }
  );
}
