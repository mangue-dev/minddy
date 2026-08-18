import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  resolveIssueRef as resolveIssueRefCore,
  type ResolvedIssueRef,
} from "@/lib/server/issue-reads";

/**
 * Common MCP tools toolkit: ok/fail results (JSON in block
 * text, stable error codes in English — no i18n, like public API
 *), user resolution from AuthInfo, rate limit, and
 * project/ticket guard. Any resulting request is pinned
 * `.eq("project_id")` — the equivalent of assertIssueInProject on the Numo side,
 * since there is no RLS session here.
 */

export interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function fail(code: string, message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
    isError: true,
  };
}

/** Context passed through the SDK to tool callbacks — only authInfo is useful to us. */
export interface ToolExtra {
  http?: { authInfo?: AuthInfo };
}

export function getUserId(extra: ToolExtra): string | null {
  const userId = extra.http?.authInfo?.extra?.userId;
  return typeof userId === "string" ? userId : null;
}

const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/** Combined auth + rate limit guard, to be called at the top of each tool.
 keyId = the API key that is acting — writes record it as actor
 (the timeline shows "key name (mcp)", not the user). */
export function requireUser(
  extra: ToolExtra
): { userId: string; keyId: string | null } | { error: ToolResult } {
  const userId = getUserId(extra);
  if (!userId) return { error: fail("unauthorized", "Missing or invalid API key.") };
  const rawKeyId = extra.http?.authInfo?.extra?.keyId;
  const keyId = typeof rawKeyId === "string" ? rawKeyId : null;
  const rate = checkSessionRateLimit(userId, "mcp", RATE_LIMIT);
  if (!rate.allowed) {
    return {
      error: fail(
        "rate_limited",
        `Rate limit exceeded. Retry in ${rate.retryAfter}s.`
      ),
    };
  }
  return { userId, keyId };
}

export async function resolveProject(
  userId: string,
  projectId: unknown
): Promise<{ access: ProjectAccess } | { error: ToolResult }> {
  if (typeof projectId !== "string" || !projectId) {
    return {
      error: fail(
        "invalid_params",
        "project_id is required. Use minddy_list_projects to discover project ids."
      ),
    };
  }
  const access = await getProjectAccess(userId, projectId);
  if (!access) {
    return {
      error: fail(
        "project_not_found",
        "Project not found or not accessible with this key."
      ),
    };
  }
  return { access };
}

/** Combined auth + rate limit + project access to project scoped tools.
 Shared by the two tool modules (the tickets and company in
 tools.ts, the pages in page-tools.ts): a tool which would otherwise be kept
 would be a tool for which the rate limit would have been forgotten. */
export async function requireProject(
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

/** MCP annotations, the same for all tools on the surface. */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;
export const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;

export type ResolvedIssue = ResolvedIssueRef;

/**
 * Resolves a ticket reference — UUID, identifier "MIND-42" or number
 * bare — to its id, pinned to the project. Thin wrapper of the shared resolver
 * (`lib/server/issue-reads.ts`, also used by the tools ticket of
 * the code agent): it only renders the error codes of the MCP.
 */
export async function resolveIssueRef(
  access: ProjectAccess,
  ref: unknown
): Promise<{ issue: ResolvedIssue } | { error: ToolResult }> {
  const project = access.project;
  const resolved = await resolveIssueRefCore(
    getServiceClient(),
    { projectId: project.id, projectKey: project.key },
    ref
  );
  if ("error" in resolved) {
    return { error: fail(resolved.code, resolved.error) };
  }
  return { issue: resolved.issue };
}
