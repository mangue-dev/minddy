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
import { displayName } from "@/lib/display-name";
import { MAX_PLAN_LENGTH, PLAN_TASK_STATES, parsePlan, setTaskState } from "@/lib/plan";
import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
} from "@/lib/issue-validation";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { addCommentToIssue } from "@/lib/server/add-comment";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import { issueIdentifier } from "@/lib/issue-constants";
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
    "Implementation plan — FULL markdown document. Checkbox lines are tasks: " +
      "'- [ ]' pending, '- [~]' in progress, '- [x]' completed, '- [-]' cancelled. " +
      "Prose between task blocks is allowed. To flip ONE task's state, prefer " +
      "minddy_update_plan_task instead of resending the whole plan."
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
): Promise<{ userId: string; access: ProjectAccess } | { error: ToolResult }> {
  const auth = requireUser(extra);
  if ("error" in auth) return auth;
  const project = await resolveProject(auth.userId, projectId);
  if ("error" in project) return project;
  return { userId: auth.userId, access: project.access };
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
        "and sub-issues.",
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

      const plan = r.issue.plan;
      const parsed = typeof plan === "string" && plan ? parsePlan(plan) : null;
      return ok({
        ...r,
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
        "status (planned/in_progress/done/canceled), lead, target date.",
      inputSchema: { project_id: PROJECT_ID },
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;
      const service = getServiceClient();
      const { data, error } = await service
        .from("objectives")
        .select("id, name, status, lead_user_id, target_date, color")
        .eq("project_id", scope.access.project.id)
        .order("created_at", { ascending: true });
      if (error) return fail("database_error", error.message);

      const leads = await fetchAuthUsersById(
        service,
        (data ?? [])
          .map((o) => o.lead_user_id)
          .filter((v): v is string => typeof v === "string")
      );
      return ok({
        objectives: (data ?? []).map((o) => ({
          ...o,
          lead_name: o.lead_user_id
            ? displayName(toNamed(leads.get(o.lead_user_id)), "User")
            : null,
        })),
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
        "parent's objective unless objective_id is set). Returns the created issue " +
        "with its identifier.",
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
      },
      annotations: WRITE,
    },
    async (args, extra) => {
      const scope = await requireProject(extra, args.project_id);
      if ("error" in scope) return scope.error;

      let parentId: string | undefined;
      if (args.parent) {
        const parent = await resolveIssueRef(scope.access, args.parent);
        if ("error" in parent) return parent.error;
        parentId = parent.issue.id;
      }

      const result = await createIssueForProject({
        projectId: scope.access.project.id,
        actorId: scope.userId,
        input: { ...args, ...(parentId ? { parent_id: parentId } : {}) },
        viaMcp: true,
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
            viaMcp: true,
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
            viaMcp: true,
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
      title: "Update plan task",
      description:
        "Flip ONE task of an issue's implementation plan to a new state without " +
        "resending the plan markdown. task_index comes from minddy_get_issue's " +
        "plan_tasks (0-based, in document order). States: pending ('- [ ]'), " +
        "in_progress ('- [~]'), completed ('- [x]'), cancelled ('- [-]'). Returns " +
        "the refreshed plan_tasks and plan_progress.",
      inputSchema: {
        project_id: PROJECT_ID,
        issue: ISSUE_REF,
        task_index: z.number().int().min(0),
        state: z.enum(PLAN_TASK_STATES),
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
      const task = parsed.tasks[args.task_index];
      if (!task) {
        return fail(
          "plan_task_not_found",
          `No plan task at index ${args.task_index} — ${ref.issue.identifier} has ` +
            `${parsed.tasks.length} task(s). Fetch minddy_get_issue for plan_tasks.`
        );
      }

      const result = await updateIssueFields({
        issueId: ref.issue.id,
        actorId: scope.userId,
        input: { plan: setTaskState(plan, task.line, args.state) },
        viaMcp: true,
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
        "note for the team. The comment is attributed to the key's owner with a " +
        "'via agent' marker in the timeline.",
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
        viaMcp: true,
      });
      if (!result.ok) return coreFail(result);
      return ok({ comment: result.comment });
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
      });
      if (!result.ok) return coreFail(result);
      return ok({ objective: result.objective });
    }
  );
}
