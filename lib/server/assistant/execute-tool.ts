import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import { addCommentToIssue } from "@/lib/server/add-comment";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { createView, updateView } from "@/lib/server/views";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import { createCategory } from "@/lib/server/categories";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { isStatus } from "@/lib/issue-validation";

// ── Tool execution ─────────────────────────────────────────────────────
// Reads go through the user's RLS client (tenant isolation for free); writes
// go through the Phase-1 lib/server/* mutation cores (service client) with
// actorId = the requesting user, AFTER an explicit getProjectAccess check —
// every event/notification stays attributed to the human who asked.

export interface ToolContext {
  /** Project scope of the conversation; null = global mode. */
  projectId: string | null;
  userId: string;
  /** RLS client bound to the user's session (reads). */
  supabase: SupabaseClient;
  /** Service client (auth admin lookups). */
  service: SupabaseClient;
  locale: string;
}

export interface ToolExecution {
  result: unknown;
  success: boolean;
}

function toolError(message: string): ToolExecution {
  return { result: { error: message }, success: false };
}

/** Map a lib/server/* failure into a readable tool error. */
function libError(r: { errorKey?: string; rawMessage?: string }): ToolExecution {
  return toolError(r.rawMessage ?? r.errorKey ?? "Request failed");
}

/** Compact issue row sent to the model — small enough to list dozens. */
function compactIssue(
  row: Record<string, unknown>,
  projectKey: string
): Record<string, unknown> {
  const categories = row.issue_categories as
    | Array<{ category_id: string }>
    | undefined;
  return {
    id: row.id,
    identifier: issueIdentifier(projectKey, row.number as number),
    title: row.title,
    status: row.status,
    priority: row.priority,
    effort: row.effort,
    assignee_id: row.assignee_id,
    objective_id: row.objective_id,
    due_date: row.due_date,
    parent_id: row.parent_id,
    category_ids: categories?.map((c) => c.category_id) ?? [],
  };
}

/** Escape a user-supplied fragment for a PostgREST or()/ilike pattern. */
function ilikePattern(query: string): string {
  return `%${query.replace(/[,()%_\\]/g, " ").trim()}%`;
}

const COMPACT_ISSUE_COLUMNS =
  "id, number, title, status, priority, effort, assignee_id, objective_id, due_date, parent_id, issue_categories(category_id)";

/** Statuses hidden from list_issues unless include_done (or an explicit filter). */
const CLOSED_STATUSES = ["done", "canceled", "duplicate"];

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  try {
    // ── Global-only tool ────────────────────────────────────────────────
    if (toolName === "list_projects") {
      const { data, error } = await ctx.supabase
        .from("projects")
        .select("id, name, key")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) return toolError(error.message);
      return { result: { projects: data ?? [] }, success: true };
    }

    // ── Project scope resolution (all remaining tools) ──────────────────
    const projectId =
      ctx.projectId ??
      (typeof args.project_id === "string" ? args.project_id : null);
    if (!projectId) {
      return toolError(
        "No project in scope. Pass project_id (use list_projects to discover projects)."
      );
    }
    const access = await getProjectAccess(ctx.userId, projectId);
    if (!access) {
      return toolError("Project not found or not accessible.");
    }

    switch (toolName) {
      // ── Read tools ────────────────────────────────────────────────────
      case "list_issues":
        return await listIssues(args, ctx, projectId, access);
      case "search_issues":
        return await searchIssues(args, ctx, projectId, access);
      case "get_issue":
        return await getIssue(args, ctx, projectId, access);
      case "list_members":
        return await listMembers(ctx, projectId, access);
      case "list_objectives": {
        const { data, error } = await ctx.supabase
          .from("objectives")
          .select("id, name, status, lead_user_id, target_date")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true });
        if (error) return toolError(error.message);
        return { result: { objectives: data ?? [] }, success: true };
      }
      case "list_categories": {
        const { data, error } = await ctx.supabase
          .from("categories")
          .select("id, name, color")
          .eq("project_id", projectId)
          .order("name", { ascending: true });
        if (error) return toolError(error.message);
        return { result: { categories: data ?? [] }, success: true };
      }
      case "list_views": {
        let query = ctx.supabase
          .from("views")
          .select("id, name, onglet, user_id, filters, sort, display")
          .eq("project_id", projectId)
          .order("position", { ascending: true });
        if (args.onglet === "my" || args.onglet === "all") {
          query = query.eq("onglet", args.onglet);
        }
        const { data, error } = await query;
        if (error) return toolError(error.message);
        const views = (data ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          onglet: v.onglet,
          shared: v.user_id === null,
          filters: v.filters,
          sort: v.sort,
          display: v.display,
        }));
        return { result: { views }, success: true };
      }

      // ── Write tools ───────────────────────────────────────────────────
      case "create_issue": {
        // Without an explicit status the issue lands in triage — the human
        // validation gate for assistant-created issues (plan.md §10).
        const status = isStatus(args.status) ? args.status : "triage";
        const result = await createIssueForProject({
          projectId,
          actorId: ctx.userId,
          input: { ...args, status },
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return {
          result: {
            issue: {
              ...result.issue,
              identifier: issueIdentifier(
                access.project.key,
                result.issue.number as number
              ),
            },
          },
          success: true,
        };
      }

      case "update_issues": {
        const issueIds = Array.isArray(args.issue_ids)
          ? args.issue_ids.filter((v): v is string => typeof v === "string")
          : [];
        if (issueIds.length === 0 || issueIds.length > 50) {
          return toolError("issue_ids must contain between 1 and 50 issue ids.");
        }
        const fields =
          args.fields && typeof args.fields === "object"
            ? (args.fields as Record<string, unknown>)
            : {};
        if (Object.keys(fields).length === 0) {
          return toolError("fields must contain at least one field to change.");
        }

        const failed: Array<{ id: string; error: string }> = [];
        let updated = 0;
        for (const issueId of issueIds) {
          const scoped = await assertIssueInProject(ctx, issueId, projectId);
          if (!scoped.ok) {
            failed.push({ id: issueId, error: scoped.error });
            continue;
          }
          const result = await updateIssueFields({
            issueId,
            actorId: ctx.userId,
            input: fields,
            viaAssistant: true,
          });
          if (result.ok) updated++;
          else
            failed.push({
              id: issueId,
              error: result.rawMessage ?? result.errorKey ?? "update failed",
            });
        }
        return {
          result: { updated, failed },
          success: failed.length === 0,
        };
      }

      case "set_issue_categories": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const categoryIds = Array.isArray(args.category_ids)
          ? args.category_ids.filter((v): v is string => typeof v === "string")
          : [];
        const result = await setIssueCategories({
          issueId,
          actorId: ctx.userId,
          categoryIds,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return { result: { category_ids: result.categoryIds }, success: true };
      }

      case "add_comment": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const body = typeof args.body === "string" ? args.body : "";
        const result = await addCommentToIssue({
          issueId,
          actorId: ctx.userId,
          body,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return { result: { comment: result.comment }, success: true };
      }

      case "create_view": {
        const result = await createView({
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return libError(result);
        return {
          result: {
            view: {
              id: result.view.id,
              name: result.view.name,
              onglet: result.view.onglet,
            },
            // Anything sanitizeViewConfig dropped — lets the model self-correct.
            ...(result.invalid.length > 0 ? { invalid: result.invalid } : {}),
          },
          success: true,
        };
      }

      case "update_view": {
        const viewId = typeof args.view_id === "string" ? args.view_id : "";
        if (!viewId) return toolError("view_id is required.");
        const result = await updateView({
          viewId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return libError(result);
        return {
          result: {
            view: {
              id: result.view.id,
              name: result.view.name,
              onglet: result.view.onglet,
            },
            ...(result.invalid.length > 0 ? { invalid: result.invalid } : {}),
          },
          success: true,
        };
      }

      case "create_objective": {
        const result = await createObjective({
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return libError(result);
        return { result: { objective: result.objective }, success: true };
      }

      case "update_objective": {
        const objectiveId =
          typeof args.objective_id === "string" ? args.objective_id : "";
        if (!objectiveId) return toolError("objective_id is required.");
        // Scope check: the objective must belong to the project in scope.
        const { data: obj } = await ctx.supabase
          .from("objectives")
          .select("id")
          .eq("id", objectiveId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (!obj) return toolError("Objective not found in this project.");
        const result = await updateObjective({
          objectiveId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return libError(result);
        return { result: { objective: result.objective }, success: true };
      }

      case "create_category": {
        const result = await createCategory({
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return libError(result);
        return { result: { category: result.category }, success: true };
      }

      case "triage_decision": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const decision = args.decision;
        if (
          decision !== "accept" &&
          decision !== "decline" &&
          decision !== "duplicate"
        ) {
          return toolError("decision must be accept, decline, or duplicate.");
        }
        const { data: issue } = await ctx.supabase
          .from("issues")
          .select("id, status")
          .eq("id", issueId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (!issue) return toolError("Issue not found in this project.");
        if (issue.status !== "triage") {
          return toolError(
            `This issue is not in triage (current status: ${issue.status}).`
          );
        }
        if (decision === "duplicate" && typeof args.duplicate_of_id !== "string") {
          return toolError("duplicate_of_id is required for decision='duplicate'.");
        }

        // Mirror the triage page: optional comment first, then the status change.
        if (typeof args.comment === "string" && args.comment.trim()) {
          const commented = await addCommentToIssue({
            issueId,
            actorId: ctx.userId,
            body: args.comment,
            viaAssistant: true,
          });
          if (!commented.ok) return libError(commented);
        }

        const input: Record<string, unknown> =
          decision === "accept"
            ? { status: "backlog" }
            : decision === "decline"
              ? { status: "canceled" }
              : { status: "duplicate", duplicate_of_id: args.duplicate_of_id };
        const result = await updateIssueFields({
          issueId,
          actorId: ctx.userId,
          input,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return {
          result: { decision, issue_id: issueId, status: input.status },
          success: true,
        };
      }

      default:
        return toolError(`Unknown tool: ${toolName}`);
    }
  } catch (err) {
    console.error(`[assistant] tool ${toolName} threw:`, err);
    return toolError(err instanceof Error ? err.message : "Tool execution failed");
  }
}

// ── Read-tool bodies ────────────────────────────────────────────────────

/**
 * The write cores scope by issue id only (they resolve project access from the
 * issue itself) — fine for the HTTP routes, but Numo's conversation is scoped
 * to ONE project, so a hallucinated/foreign issue id must not leak writes into
 * another project the user happens to access. This pins the issue to the
 * project in scope via the RLS client.
 */
async function assertIssueInProject(
  ctx: ToolContext,
  issueId: string,
  projectId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!issueId) return { ok: false, error: "issue_id is required." };
  const { data } = await ctx.supabase
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Issue not found in this project." };
  return { ok: true };
}

async function listIssues(
  args: Record<string, unknown>,
  ctx: ToolContext,
  projectId: string,
  access: ProjectAccess
): Promise<ToolExecution> {
  const limit = Math.min(
    Math.max(typeof args.limit === "number" ? Math.floor(args.limit) : 50, 1),
    200
  );

  let query = ctx.supabase
    .from("issues")
    .select(COMPACT_ISSUE_COLUMNS)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  const statusFilter = Array.isArray(args.status)
    ? args.status.filter(isStatus)
    : [];
  if (statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  } else if (args.include_done !== true) {
    query = query.not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
  }

  if ("assignee_id" in args) {
    if (args.assignee_id === null) query = query.is("assignee_id", null);
    else if (typeof args.assignee_id === "string")
      query = query.eq("assignee_id", args.assignee_id);
  }
  if (typeof args.objective_id === "string") {
    query = query.eq("objective_id", args.objective_id);
  }

  const { data, error } = await query;
  if (error) return toolError(error.message);

  let rows = (data ?? []) as Array<Record<string, unknown>>;
  // Category filter applies post-query (the N–N join can't be filtered inline
  // without dropping the other categories from the payload).
  if (typeof args.category_id === "string") {
    rows = rows.filter((row) =>
      (row.issue_categories as Array<{ category_id: string }> | undefined)?.some(
        (c) => c.category_id === args.category_id
      )
    );
  }

  return {
    result: {
      issues: rows.map((row) => compactIssue(row, access.project.key)),
    },
    success: true,
  };
}

async function searchIssues(
  args: Record<string, unknown>,
  ctx: ToolContext,
  projectId: string,
  access: ProjectAccess
): Promise<ToolExecution> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return toolError("query is required.");
  const limit = Math.min(
    Math.max(typeof args.limit === "number" ? Math.floor(args.limit) : 20, 1),
    100
  );

  // Exact identifier ("KEY-42") or bare number lookup first.
  const identifierMatch = query.match(/^([a-zA-Z]{2,10})-(\d+)$/);
  const bareNumber = /^\d+$/.test(query) ? Number(query) : null;
  const number = identifierMatch ? Number(identifierMatch[2]) : bareNumber;
  if (number !== null && Number.isFinite(number)) {
    const { data } = await ctx.supabase
      .from("issues")
      .select(COMPACT_ISSUE_COLUMNS)
      .eq("project_id", projectId)
      .eq("number", number)
      .maybeSingle();
    if (data) {
      return {
        result: {
          issues: [
            compactIssue(data as Record<string, unknown>, access.project.key),
          ],
        },
        success: true,
      };
    }
  }

  const pattern = ilikePattern(query);
  const { data, error } = await ctx.supabase
    .from("issues")
    .select(COMPACT_ISSUE_COLUMNS)
    .eq("project_id", projectId)
    .or(`title.ilike.${pattern},description.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return toolError(error.message);

  return {
    result: {
      issues: ((data ?? []) as Array<Record<string, unknown>>).map((row) =>
        compactIssue(row, access.project.key)
      ),
    },
    success: true,
  };
}

async function getIssue(
  args: Record<string, unknown>,
  ctx: ToolContext,
  projectId: string,
  access: ProjectAccess
): Promise<ToolExecution> {
  let issueQuery = ctx.supabase
    .from("issues")
    .select("*, issue_categories(category_id)")
    .eq("project_id", projectId);
  if (typeof args.issue_id === "string") {
    issueQuery = issueQuery.eq("id", args.issue_id);
  } else if (typeof args.number === "number") {
    issueQuery = issueQuery.eq("number", args.number);
  } else {
    return toolError("Pass issue_id or number.");
  }
  const { data: issue, error } = await issueQuery.maybeSingle();
  if (error) return toolError(error.message);
  if (!issue) return toolError("Issue not found in this project.");

  const [{ data: comments }, { data: subIssues }] = await Promise.all([
    ctx.supabase
      .from("comments")
      .select("id, author_id, body, parent_id, via_assistant, created_at")
      .eq("issue_id", issue.id)
      .order("created_at", { ascending: true }),
    ctx.supabase
      .from("issues")
      .select("id, number, title, status")
      .eq("parent_id", issue.id)
      .order("number", { ascending: true }),
  ]);

  // Resolve author display names (auth admin — best effort).
  const authorIds = (comments ?? []).map((c) => c.author_id as string);
  const users = await fetchAuthUsersById(ctx.service, authorIds);
  const commentRows = (comments ?? []).map((c) => {
    const named = toNamed(users.get(c.author_id as string));
    return {
      id: c.id,
      author: c.via_assistant ? "Numo" : displayName(named, "User"),
      body: c.body,
      parent_id: c.parent_id,
      created_at: c.created_at,
    };
  });

  let duplicateOf: Record<string, unknown> | null = null;
  if (issue.duplicate_of_id) {
    const { data } = await ctx.supabase
      .from("issues")
      .select("id, number, title")
      .eq("id", issue.duplicate_of_id)
      .maybeSingle();
    if (data) {
      duplicateOf = {
        ...data,
        identifier: issueIdentifier(access.project.key, data.number as number),
      };
    }
  }

  const categories = (issue.issue_categories ?? []) as Array<{
    category_id: string;
  }>;
  const { issue_categories: _junction, ...issueFields } = issue as Record<
    string,
    unknown
  >;

  return {
    result: {
      issue: {
        ...issueFields,
        identifier: issueIdentifier(access.project.key, issue.number as number),
        category_ids: categories.map((c) => c.category_id),
      },
      comments: commentRows,
      sub_issues: ((subIssues ?? []) as Array<Record<string, unknown>>).map(
        (s) => ({
          ...s,
          identifier: issueIdentifier(access.project.key, s.number as number),
        })
      ),
      ...(duplicateOf ? { duplicate_of: duplicateOf } : {}),
    },
    success: true,
  };
}

async function listMembers(
  ctx: ToolContext,
  projectId: string,
  access: ProjectAccess
): Promise<ToolExecution> {
  const { data: memberRows, error } = await ctx.service
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);
  if (error) return toolError(error.message);

  const ownerId = access.project.owner_id;
  const ids = [ownerId, ...(memberRows ?? []).map((m) => m.user_id as string)];
  const users = await fetchAuthUsersById(ctx.service, ids);

  const members = ids.map((id) => {
    const named = toNamed(users.get(id));
    return {
      user_id: id,
      name: displayName(named, "User"),
      role: id === ownerId ? "owner" : "member",
    };
  });

  return { result: { members }, success: true };
}
