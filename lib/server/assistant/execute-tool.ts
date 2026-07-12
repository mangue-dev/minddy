import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import { addCommentToIssue } from "@/lib/server/add-comment";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { createView, updateView } from "@/lib/server/views";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import { createCategory, updateCategory } from "@/lib/server/categories";
import { updateProjectSettings } from "@/lib/server/update-project";
import {
  cancelInvitation,
  inviteMember,
  listPendingInvitations,
  removeMember,
} from "@/lib/server/members";
import {
  createIntegration,
  revokeIntegration,
  updateIntegrationWebhook,
} from "@/lib/server/integrations";
import {
  getAccountSettings,
  updateAccountSettings,
} from "@/lib/server/account-settings";
import {
  ensureCycles,
  fillCycleForUser,
  getCycleOverview,
  getCyclePrefsForUser,
  toCycleInfo,
} from "@/lib/server/cycles";
import { todayISO, type FillWeights } from "@/lib/cycle";
import {
  assertIssueInProject,
  getIssue,
  listIssues,
  listMembers,
  searchIssues,
  type ReadContext,
} from "@/lib/server/issue-reads";
import { issueIdentifier } from "@/lib/issue-constants";
import { isStatus, type IssueStatusValue } from "@/lib/issue-validation";

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
  /** Landing status for issues Numo creates without an explicit status —
      the user's Account → Preferences choice. Defaults to 'triage'. */
  numoDefaultStatus?: IssueStatusValue;
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

/** Readable messages for the settings cores' errorKeys — the assistant does not
    run these through i18n, so it needs plain sentences to relay to the user. */
const SETTINGS_ERROR_MESSAGES: Record<string, string> = {
  ownerOnly: "Only the project owner can change this.",
  ownerOnlyInvite: "Only the project owner can invite members.",
  projectNotFound: "Project not found or not accessible.",
  nameRequired: "A name is required.",
  invalidProjectKey: "The project key must be 2 to 5 letters (A–Z).",
  projectKeyAlreadyUsed: "That project key is already used by another of your projects.",
  noFieldsToUpdate: "No fields to update.",
  invalidEmail: "That email address is invalid.",
  noAccountForEmail: "No minddy account exists for that email address.",
  alreadyOwner: "That person is the project owner.",
  alreadyMember: "That person is already a member of the project.",
  invitationAlreadyPending: "There is already a pending invitation for that email.",
  cannotRemoveOwner: "The project owner cannot be removed.",
  invalidColor: "That color is invalid (use a hex color like #7c5cff).",
  categoryNotFound: "Category not found in this project.",
  integrationNameRequired: "An integration name is required.",
  integrationNotFound: "Integration not found.",
  webhookInvalidUrl: "The webhook URL is invalid (must be http/https).",
  webhookInvalidConfig: "The webhook events or scope are invalid.",
  databaseError: "A database error occurred.",
};

function settingsError(errorKey: string): ToolExecution {
  return toolError(SETTINGS_ERROR_MESSAGES[errorKey] ?? errorKey);
}

/** Read context for the shared lib/server/issue-reads.ts helpers — Numo reads
    through the user's RLS client (tenant isolation for free). */
function readCtx(
  ctx: ToolContext,
  projectId: string,
  access: ProjectAccess
): ReadContext {
  return {
    db: ctx.supabase,
    service: ctx.service,
    projectId,
    projectKey: access.project.key,
  };
}

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

    // ── Account tools (the requesting user's own account — no project) ──
    if (toolName === "get_account_settings") {
      const r = await getAccountSettings({ userId: ctx.userId });
      return r.ok
        ? { result: { settings: r.settings }, success: true }
        : toolError(r.error);
    }
    if (toolName === "update_account_settings") {
      const r = await updateAccountSettings({ userId: ctx.userId, input: args });
      return r.ok
        ? { result: { settings: r.settings }, success: true }
        : toolError(r.error);
    }

    // ── Cycle tools (the user's personal cross-project cycle — MIN-32) ──
    if (
      toolName === "get_cycle" ||
      toolName === "fill_cycle" ||
      toolName === "add_issues_to_cycle" ||
      toolName === "remove_issues_from_cycle"
    ) {
      return executeCycleTool(toolName, args, ctx);
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
      // ── Read tools (shared with the MCP server — issue-reads.ts) ──────
      case "list_issues": {
        const r = await listIssues(readCtx(ctx, projectId, access), args);
        return "error" in r ? toolError(r.error) : { result: r, success: true };
      }
      case "search_issues": {
        const r = await searchIssues(readCtx(ctx, projectId, access), args);
        return "error" in r ? toolError(r.error) : { result: r, success: true };
      }
      case "get_issue": {
        const r = await getIssue(readCtx(ctx, projectId, access), args);
        return "error" in r ? toolError(r.error) : { result: r, success: true };
      }
      case "list_members": {
        const r = await listMembers(
          readCtx(ctx, projectId, access),
          access.project.owner_id
        );
        if ("error" in r) return toolError(r.error);
        // Owners also see pending invitations (for cancel_invitation).
        const pending_invitations = access.isOwner
          ? await listPendingInvitations(projectId)
          : [];
        return {
          result: { ...r, pending_invitations },
          success: true,
        };
      }
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
      case "list_integrations": {
        const { data, error } = await ctx.supabase
          .from("integrations")
          .select("id, name, revoked_at")
          .eq("project_id", projectId)
          .order("name", { ascending: true });
        if (error) return toolError(error.message);
        return { result: { integrations: data ?? [] }, success: true };
      }
      case "list_views": {
        const { data, error } = await ctx.supabase
          .from("views")
          .select("id, name, kind, user_id, filters, sort, display")
          .eq("project_id", projectId)
          .order("position", { ascending: true });
        if (error) return toolError(error.message);
        const views = (data ?? []).map((v) => ({
          id: v.id,
          name: v.name,
          kind: v.kind,
          shared: v.user_id === null,
          filters: v.filters,
          sort: v.sort,
          display: v.display,
        }));
        return { result: { views }, success: true };
      }

      // ── Write tools ───────────────────────────────────────────────────
      case "create_issue": {
        // Without an explicit status the issue lands in the user's configured
        // Numo default (triage unless changed in Account → Preferences) — the
        // human validation gate for assistant-created issues (plan.md §10).
        const status = isStatus(args.status)
          ? args.status
          : (ctx.numoDefaultStatus ?? "triage");
        const result = await createIssueForProject({
          projectId,
          projectName: access.project.name,
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
          const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
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
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
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
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
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
              kind: result.view.kind,
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
              kind: result.view.kind,
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
          viaAssistant: true,
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
          viaAssistant: true,
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

      // ── Project settings (owner-gated inside the cores) ───────────────
      case "update_project": {
        const result = await updateProjectSettings({
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            project: {
              id: result.project.id,
              name: result.project.name,
              key: result.project.key,
              color: result.project.color,
            },
          },
          success: true,
        };
      }

      case "invite_member": {
        const result = await inviteMember({
          projectId,
          actorId: ctx.userId,
          email: args.email,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            invitation: {
              id: result.invitation.id,
              email: result.invitation.invited_email,
            },
          },
          success: true,
        };
      }

      case "remove_member": {
        const userId = typeof args.user_id === "string" ? args.user_id : "";
        if (!userId) return toolError("user_id is required.");
        const result = await removeMember({
          projectId,
          actorId: ctx.userId,
          userId,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return { result: { removed: userId }, success: true };
      }

      case "cancel_invitation": {
        const invitationId =
          typeof args.invitation_id === "string" ? args.invitation_id : "";
        if (!invitationId) return toolError("invitation_id is required.");
        const result = await cancelInvitation({
          projectId,
          actorId: ctx.userId,
          invitationId,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return { result: { cancelled: invitationId }, success: true };
      }

      case "update_category": {
        const categoryId =
          typeof args.category_id === "string" ? args.category_id : "";
        if (!categoryId) return toolError("category_id is required.");
        const result = await updateCategory({
          categoryId,
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return settingsError(result.errorKey ?? "databaseError");
        return { result: { category: result.category }, success: true };
      }

      // ── Integrations (owner-gated) ────────────────────────────────────
      case "create_integration": {
        if (!access.isOwner) return settingsError("ownerOnly");
        const result = await createIntegration({
          projectId,
          actorId: ctx.userId,
          name: args.name,
          // 'issues' | 'feedback' — validé côté core, défaut 'issues'.
          kind: args.kind,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            integration: {
              id: result.integration.id,
              name: result.integration.name,
            },
            // The plaintext key is returned ONCE — Numo must surface it now.
            key: result.key,
          },
          success: true,
        };
      }

      case "update_integration_webhook": {
        if (!access.isOwner) return settingsError("ownerOnly");
        const integrationId =
          typeof args.integration_id === "string" ? args.integration_id : "";
        if (!integrationId) return toolError("integration_id is required.");
        const result = await updateIntegrationWebhook({
          projectId,
          integrationId,
          input: args,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            integration: {
              id: result.integration.id,
              name: result.integration.name,
              webhook_url: result.integration.webhook_url,
              webhook_events: result.integration.webhook_events,
              webhook_scope: result.integration.webhook_scope,
            },
          },
          success: true,
        };
      }

      case "revoke_integration": {
        if (!access.isOwner) return settingsError("ownerOnly");
        const integrationId =
          typeof args.integration_id === "string" ? args.integration_id : "";
        if (!integrationId) return toolError("integration_id is required.");
        const result = await revokeIntegration({ projectId, integrationId });
        if (!result.ok) return settingsError(result.errorKey);
        return { result: { revoked: integrationId }, success: true };
      }

      default:
        return toolError(`Unknown tool: ${toolName}`);
    }
  } catch (err) {
    console.error(`[assistant] tool ${toolName} threw:`, err);
    return toolError(err instanceof Error ? err.message : "Tool execution failed");
  }
}

// ── Cycles (MIN-32) ─────────────────────────────────────────────────────
// The cycle is the requesting user's own, cross-project — no project scope.
// Reads/writes go through the lib/server/cycles.ts cores (service client);
// add/remove reuse updateIssueFields so the assignment side-effect, activity
// events and the SQL invariant apply exactly like the UI path.

function parseFillWeights(args: Record<string, unknown>): FillWeights {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const boostMap = (v: unknown, idKey: string): Record<string, number> | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out: Record<string, number> = {};
    for (const item of v) {
      const row = item as Record<string, unknown>;
      const id = row?.[idKey];
      const weight = num(row?.weight);
      if (typeof id === "string" && id && weight !== undefined) out[id] = weight;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const keywordBoost = Array.isArray(args.keyword_boosts)
    ? (args.keyword_boosts as Record<string, unknown>[])
        .map((row) => ({
          keyword: typeof row?.keyword === "string" ? row.keyword : "",
          weight: num(row?.weight) ?? 0,
        }))
        .filter((k) => k.keyword && k.weight)
    : undefined;
  return {
    priority: num(args.priority_weight),
    unblocked: num(args.unblocked_weight),
    small: num(args.small_first_weight),
    projectBoost: boostMap(args.project_boosts, "project_id"),
    categoryBoost: boostMap(args.category_boosts, "category_id"),
    keywordBoost: keywordBoost?.length ? keywordBoost : undefined,
  };
}

function parseIssueIds(args: Record<string, unknown>): string[] | null {
  const raw = args.issue_ids;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
  return ids.length === raw.length ? ids : null;
}

async function executeCycleTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const prefs = await getCyclePrefsForUser(ctx.service, ctx.userId);
  if (!prefs.enabled) {
    return toolError(
      "Cycles are not enabled for this account. The user can enable them in Account → Cycles (or via update_account_settings with cycles_enabled: true)."
    );
  }
  const ensured = await ensureCycles({
    service: ctx.service,
    userId: ctx.userId,
    prefs,
    today: todayISO(),
  });
  const current = ensured.current;

  if (toolName === "get_cycle") {
    const which =
      args.which === "next" || args.which === "previous" ? args.which : "current";
    const r = await getCycleOverview({
      service: ctx.service,
      userId: ctx.userId,
      prefs,
      which,
    });
    if (!r.ok) return toolError(r.error);
    return {
      result: {
        ...r.overview,
        intensity_note:
          "Points are internal — talk to the user in effort sizes or % of capacity.",
      },
      success: true,
    };
  }

  if (!current) return toolError("No current cycle exists yet.");

  if (toolName === "fill_cycle") {
    const { pickedIds, points } = await fillCycleForUser({
      service: ctx.service,
      userId: ctx.userId,
      actorId: ctx.userId,
      cycle: current,
      weights: parseFillWeights(args),
      viaAssistant: true,
    });
    return {
      result: {
        added: pickedIds.length,
        added_ids: pickedIds,
        added_points: points,
        cycle: toCycleInfo(current),
      },
      success: true,
    };
  }

  if (toolName === "add_issues_to_cycle" || toolName === "remove_issues_from_cycle") {
    const ids = parseIssueIds(args);
    if (!ids) return toolError("issue_ids must be 1–50 issue ids.");
    const removing = toolName === "remove_issues_from_cycle";
    const done: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const issueId of ids) {
      if (removing) {
        // Only pull issues out of the user's OWN current cycle — never someone
        // else's (project access alone would otherwise allow it).
        const { data: row } = await ctx.service
          .from("issues")
          .select("cycle_id")
          .eq("id", issueId)
          .maybeSingle();
        if (!row || row.cycle_id !== current.id) {
          failed.push({ id: issueId, error: "Not in the user's current cycle." });
          continue;
        }
      }
      const r = await updateIssueFields({
        issueId,
        actorId: ctx.userId,
        input: { cycle_id: removing ? null : current.id },
        viaAssistant: true,
      });
      if (r.ok) done.push(issueId);
      else failed.push({ id: issueId, error: r.rawMessage ?? r.errorKey ?? "failed" });
    }
    return {
      result: removing
        ? { removed: done.length, removed_ids: done, failed }
        : { added: done.length, added_ids: done, failed },
      success: failed.length < ids.length,
    };
  }

  return toolError(`Unknown cycle tool: ${toolName}`);
}
