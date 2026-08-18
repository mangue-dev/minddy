import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { isStatus } from "@/lib/issue-validation";
import { resolveRelations } from "@/lib/relation-constants";
import {
  listFeedbackForIssue,
  type IssueLinkedFeedback,
} from "@/lib/server/feedback/team-queries";
import { resourceSummary } from "@/lib/server/resource-select";
import type { IssueRelation } from "@/lib/types";

// ── Numo / MCP shared readings ───────────────────────────────────────
// Extracted from execute-tool.ts to be served to both consumers:
// Numo passes its RLS client (free insulation), the MCP passes it
// customer service (no cookie session). All queries are pinned
// `.eq("project_id")` AFTER a getProjectAccess caller side — they are
// therefore safe on any client.

export interface ReadContext {
  /** Client de lecture — RLS (Numo) ou service (MCP). */
  db: SupabaseClient;
  /** Customer service (name resolution via auth admin). */
  service: SupabaseClient;
  projectId: string;
  projectKey: string;
}

export const COMPACT_ISSUE_COLUMNS =
  "id, number, title, status, priority, effort, assignee_id, objective_id, due_date, recurrence, parent_id, issue_categories(category_id)";

/** Statuses hidden from list_issues unless include_done (or an explicit filter). */
export const CLOSED_STATUSES = ["done", "canceled", "duplicate"];

/** Compact issue row sent to the model — small enough to list dozens. */
export function compactIssue(
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
    // The cadence is read WITH the deadline (“every Monday”): without it in
    // the compact line, an agent cannot distinguish a recurring ticket
    // of a dated ticket, and would rely on a recurrence already in place.
    recurrence: row.recurrence,
    parent_id: row.parent_id,
    category_ids: categories?.map((c) => c.category_id) ?? [],
  };
}

/** Escape a user-supplied fragment for a PostgREST or()/ilike pattern. */
export function ilikePattern(query: string): string {
  return `%${query.replace(/[,()%_\\]/g, " ").trim()}%`;
}

/**
 * The write cores scope by issue id only (they resolve project access from the
 * issue itself) — fine for the HTTP routes, but a tool conversation is scoped
 * to ONE project, so a hallucinated/foreign issue id must not leak writes into
 * another project the user happens to access. This pins the issue to the
 * project in scope.
 */
export async function assertIssueInProject(
  db: SupabaseClient,
  issueId: string,
  projectId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!issueId) return { ok: false, error: "issue_id is required." };
  const { data } = await db
    .from("issues")
    .select("id")
    .is("deleted_at", null)
    .eq("id", issueId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Issue not found in this project." };
  return { ok: true };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_RE = /^([A-Za-z]{2,5})-(\d+)$/;

export interface ResolvedIssueRef {
  id: string;
  number: number;
  identifier: string;
}

/** Why a reference didn't resolve — the caller maps this code to SA
 error convention (MCP stable codes, bare message for an agent tool). */
export type IssueRefErrorCode =
  | "invalid_params"
  | "issue_not_found"
  | "database_error";

/**
 * Resolves a ticket reference — UUID, identifier "MIND-42" or bare number —
 * to its id, pinned to the project. An identifier prefix that does not match
 * the project key is an explicit error (protects against copy-pasting from
 * another project).
 *
 * Shared by the MCP (`lib/server/mcp/tool-helpers.ts`, which wraps it for its
 * codes error) and the code agent's tools ticket, where the model passes
 * indifferently one of the three formats.
 */
export async function resolveIssueRef(
  db: SupabaseClient,
  scope: { projectId: string; projectKey: string },
  ref: unknown
): Promise<
  { issue: ResolvedIssueRef } | { error: string; code: IssueRefErrorCode }
> {
  const raw = typeof ref === "string" ? ref.trim() : "";
  if (!raw) {
    return {
      code: "invalid_params",
      error:
        "issue is required — pass a UUID, an identifier like 'MIND-42', or a bare issue number.",
    };
  }

  let query = db.from("issues").select("id, number").eq("project_id", scope.projectId).is("deleted_at", null);

  const identifierMatch = raw.match(IDENTIFIER_RE);
  if (UUID_RE.test(raw)) {
    query = query.eq("id", raw);
  } else if (identifierMatch) {
    if (identifierMatch[1].toUpperCase() !== scope.projectKey.toUpperCase()) {
      return {
        code: "issue_not_found",
        error: `Identifier prefix '${identifierMatch[1]}' doesn't match this project's key '${scope.projectKey}'.`,
      };
    }
    query = query.eq("number", Number(identifierMatch[2]));
  } else if (/^\d+$/.test(raw)) {
    query = query.eq("number", Number(raw));
  } else {
    return {
      code: "invalid_params",
      error: `'${raw}' is not a valid issue reference — pass a UUID, '${scope.projectKey}-<number>', or a bare number.`,
    };
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { code: "database_error", error: error.message };
  if (!data) {
    return {
      code: "issue_not_found",
      error: `Issue '${raw}' not found in this project.`,
    };
  }
  return {
    issue: {
      id: data.id as string,
      number: data.number as number,
      identifier: issueIdentifier(scope.projectKey, data.number as number),
    },
  };
}

export async function listIssues(
  ctx: ReadContext,
  args: Record<string, unknown>
): Promise<
  | { issues: Array<Record<string, unknown>>; has_more: boolean }
  | { error: string }
> {
  const limit = Math.min(
    Math.max(typeof args.limit === "number" ? Math.floor(args.limit) : 50, 1),
    200
  );
  const offset =
    typeof args.offset === "number" && args.offset > 0 ? Math.floor(args.offset) : 0;
  const withDescription = args.include_description === true;

  // Typed `string` to bypass the supabase-js type parser,
  // which does not know how to resolve a conditional select.
  const columns: string = withDescription
    ? `${COMPACT_ISSUE_COLUMNS}, description`
    : COMPACT_ISSUE_COLUMNS;
  let query = ctx.db
    .from("issues")
    .select(columns)
    .is("deleted_at", null)
    .eq("project_id", ctx.projectId)
    .order("updated_at", { ascending: false })
    // One more line than requested to know if there are any left (has_more).
    .range(offset, offset + limit);

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
  if ("integration_id" in args) {
    // null = not created by an integration; a string = that integration.
    if (args.integration_id === null) query = query.is("integration_id", null);
    else if (typeof args.integration_id === "string")
      query = query.eq("integration_id", args.integration_id);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  let rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  rows = rows.slice(0, limit);
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
    issues: rows.map((row) => {
      const compact = compactIssue(row, ctx.projectKey);
      if (withDescription && typeof row.description === "string" && row.description) {
        compact.description =
          row.description.length > 200
            ? `${row.description.slice(0, 200)}…`
            : row.description;
      }
      return compact;
    }),
    has_more: hasMore,
  };
}

export async function searchIssues(
  ctx: ReadContext,
  args: Record<string, unknown>
): Promise<{ issues: Array<Record<string, unknown>> } | { error: string }> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { error: "query is required." };
  const limit = Math.min(
    Math.max(typeof args.limit === "number" ? Math.floor(args.limit) : 20, 1),
    100
  );

  // Exact identifier ("KEY-42") or bare number lookup first.
  const identifierMatch = query.match(/^([a-zA-Z]{2,10})-(\d+)$/);
  const bareNumber = /^\d+$/.test(query) ? Number(query) : null;
  const number = identifierMatch ? Number(identifierMatch[2]) : bareNumber;
  if (number !== null && Number.isFinite(number)) {
    const { data } = await ctx.db
      .from("issues")
      .select(COMPACT_ISSUE_COLUMNS)
      .is("deleted_at", null)
      .eq("project_id", ctx.projectId)
      .eq("number", number)
      .maybeSingle();
    if (data) {
      return {
        issues: [compactIssue(data as Record<string, unknown>, ctx.projectKey)],
      };
    }
  }

  const pattern = ilikePattern(query);
  const { data, error } = await ctx.db
    .from("issues")
    .select(COMPACT_ISSUE_COLUMNS)
    .is("deleted_at", null)
    .eq("project_id", ctx.projectId)
    .or(`title.ilike.${pattern},description.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };

  return {
    issues: ((data ?? []) as Array<Record<string, unknown>>).map((row) =>
      compactIssue(row, ctx.projectKey)
    ),
  };
}

export interface IssueDetail {
  issue: Record<string, unknown>;
  comments: Array<Record<string, unknown>>;
  sub_issues: Array<Record<string, unknown>>;
  duplicate_of?: Record<string, unknown>;
  relations: Array<Record<string, unknown>>;
  /**
 * The board feedback this ticket implements (MIN-196) — absent when there
 * isn't there.
 *
 * It's the REQUEST behind the work, and it's often the only thing that says why it's requested: an agent reading "add a filter by
 * date" without knowing that three people requested it to find their
 * exports of the month builds the wrong filter. We only put here what
 * decide to go see; `get_feedback` opens the return and its conversation.
 */
  linked_feedback?: IssueLinkedFeedback[];
}

export async function getIssue(
  ctx: ReadContext,
  args: Record<string, unknown>
): Promise<IssueDetail | { error: string }> {
  let issueQuery = ctx.db
    .from("issues")
    .select("*, issue_categories(category_id)")
    .is("deleted_at", null)
    .eq("project_id", ctx.projectId);
  if (typeof args.issue_id === "string") {
    issueQuery = issueQuery.eq("id", args.issue_id);
  } else if (typeof args.number === "number") {
    issueQuery = issueQuery.eq("number", args.number);
  } else {
    return { error: "Pass issue_id or number." };
  }
  const { data: issue, error } = await issueQuery.maybeSingle();
  if (error) return { error: error.message };
  if (!issue) return { error: "Issue not found in this project." };

  const [{ data: comments }, { data: subIssues }, { data: attachmentRows }] =
    await Promise.all([
      ctx.db
        .from("comments")
        .select(
          "id, author_id, body, parent_id, via_assistant, via_mcp, api_key_id, created_at"
        )
        .eq("issue_id", issue.id)
        .order("created_at", { ascending: true }),
      ctx.db
        .from("issues")
        .select("id, number, title, status")
        .is("deleted_at", null)
        .eq("parent_id", issue.id)
        .order("number", { ascending: true }),
      // Resource metadata (MIN-24, MIN-184, MIN-275): comment_id null = on the
      // issue itself. A file's contents stay behind the app's signed-URL door —
      // agents only see names/types/sizes here; a link carries its url outright,
      // a page its id and its LIVE title (the join, so a rename shows).
      ctx.db
        .from("attachments")
        .select(
          "id, comment_id, kind, url, page_id, file_name, mime_type, size_bytes, page:pages(id, title, deleted_at)"
        )
        .eq("issue_id", issue.id)
        .order("created_at", { ascending: true }),
    ]);

  const resourcesByComment = new Map<string | null, Record<string, unknown>[]>();
  for (const row of attachmentRows ?? []) {
    const key = (row.comment_id as string | null) ?? null;
    const list = resourcesByComment.get(key) ?? [];
    list.push(resourceSummary(row));
    resourcesByComment.set(key, list);
  }

  // Resolve author display names (auth admin — best effort). MCP comments are
  // attributed to their acting API key (agent), not the key's owner.
  const authorIds = (comments ?? []).map((c) => c.author_id as string);
  const [users, keyActors] = await Promise.all([
    fetchAuthUsersById(ctx.service, authorIds),
    resolveApiKeyActors((comments ?? []).map((c) => c.api_key_id as string | null)),
  ]);
  const commentRows = (comments ?? []).map((c) => {
    const named = toNamed(users.get(c.author_id as string));
    const author = c.via_assistant
      ? "Numo"
      : c.via_mcp
        ? `${keyActors.get(c.api_key_id as string)?.name ?? "Agent"} (mcp)`
        : displayName(named, "User");
    const commentResources = resourcesByComment.get(c.id as string);
    return {
      id: c.id,
      author,
      body: c.body,
      parent_id: c.parent_id,
      created_at: c.created_at,
      ...(commentResources ? { resources: commentResources } : {}),
    };
  });

  let duplicateOf: Record<string, unknown> | null = null;
  if (issue.duplicate_of_id) {
    // `.eq("project_id")` mandatory (MIN-339): the MCP reads with the key
    // service, donc RIEN d'autre ne borne cette jointure — un `duplicate_of_id`
    // pointing elsewhere (line before the writing guard) would bring out the
    // title of a ticket from another tenant. And the identifier composed just
    // afterwards with the key of THIS project would be wrong on top of that.
    const { data } = await ctx.db
      .from("issues")
      .select("id, number, title")
      .is("deleted_at", null)
      .eq("id", issue.duplicate_of_id)
      .eq("project_id", ctx.projectId)
      .maybeSingle();
    if (data) {
      duplicateOf = {
        ...data,
        identifier: issueIdentifier(ctx.projectKey, data.number as number),
      };
    }
  }

  // Relations (MIN-25): rows touching this issue, resolved to its perspective
  // and hydrated with the other issue's identifier/title/status.
  const { data: relationRows } = await ctx.db
    .from("issue_relations")
    .select("id, source_id, target_id, type")
    .eq("project_id", ctx.projectId)
    .or(`source_id.eq.${issue.id},target_id.eq.${issue.id}`);
  const resolved = resolveRelations(
    issue.id as string,
    (relationRows ?? []) as unknown as IssueRelation[]
  );
  const otherIds = [...new Set(resolved.map((r) => r.otherId))];
  const { data: relatedIssues } = otherIds.length
    ? await ctx.db
        .from("issues")
        .select("id, number, title, status")
        .is("deleted_at", null)
        .eq("project_id", ctx.projectId)
        .in("id", otherIds)
    : { data: [] as Array<Record<string, unknown>> };
  const relatedMap = new Map(
    (relatedIssues ?? []).map((o) => [o.id as string, o])
  );
  const relations = resolved.map((r) => {
    const other = relatedMap.get(r.otherId);
    return {
      relation: r.relation,
      issue_id: r.otherId,
      identifier: other
        ? issueIdentifier(ctx.projectKey, other.number as number)
        : null,
      title: other?.title ?? null,
      status: other?.status ?? null,
    };
  });

  // The returns that this ticket implements (MIN-196). Read by `ctx.service` and
  // not by `ctx.db`: `feedback_posts` is RLS deny-all, and the client of
  // Numo session would not return an error but an EMPTY list — the
  // the most costly silence, since it reads “this ticket does not come from nowhere
  // leaves”. Access to the project is already proven by reading the ticket.
  const linkedFeedback = await listFeedbackForIssue(
    ctx.projectId,
    issue.id as string
  );

  const categories = (issue.issue_categories ?? []) as Array<{
    category_id: string;
  }>;
  const { issue_categories: _junction, ...issueFields } = issue as Record<
    string,
    unknown
  >;

  return {
    issue: {
      ...issueFields,
      identifier: issueIdentifier(ctx.projectKey, issue.number as number),
      category_ids: categories.map((c) => c.category_id),
      resources: resourcesByComment.get(null) ?? [],
    },
    comments: commentRows,
    sub_issues: ((subIssues ?? []) as Array<Record<string, unknown>>).map((s) => ({
      ...s,
      identifier: issueIdentifier(ctx.projectKey, s.number as number),
    })),
    relations,
    ...(duplicateOf ? { duplicate_of: duplicateOf } : {}),
    ...(linkedFeedback.length > 0 ? { linked_feedback: linkedFeedback } : {}),
  };
}

export async function listMembers(
  ctx: ReadContext,
  ownerId: string
): Promise<{ members: Array<Record<string, unknown>> } | { error: string }> {
  const { data: memberRows, error } = await ctx.service
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", ctx.projectId);
  if (error) return { error: error.message };

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

  return { members };
}
