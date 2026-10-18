import "server-only";

import { imagesIn } from "@/lib/server/document-images";
import { readResultForReader } from "@/lib/server/mention-access";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  accessAllows,
  getProjectAccess,
  type ProjectAccess,
  type ProjectCapability,
} from "@/lib/server/project-access";
import { declaredProjectCapability } from "./tool-capabilities";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  resolveIssueRef as resolveIssueRefCore,
  resolveObjectiveRef as resolveObjectiveRefCore,
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

/**
 * A tool reply as `userId` may read it (MIN-734): every typed mention in its
 * text gets the target's current label, or the neutral one when the target
 * is not theirs to see. JSON replies are rewritten value by value, so a
 * label's escaping inside a JSON string never confuses the rewrite.
 */
export async function mentionsForReader(result: ToolResult, userId: string): Promise<ToolResult> {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || !content.some((item) =>
    item?.type === "text" && typeof item.text === "string" && (item.text.includes("](mention:") || item.text.includes("[@")))) {
    return result;
  }
  const next = await Promise.all(content.map(async (item) => {
    if (item?.type !== "text" || typeof item.text !== "string" || !(item.text.includes("](mention:") || item.text.includes("[@"))) return item;
    try {
      const parsed = JSON.parse(item.text);
      return { ...item, text: JSON.stringify(await readResultForReader(userId, parsed), null, 2) };
    } catch {
      return { ...item, text: await readResultForReader(userId, item.text) };
    }
  }));
  return { ...result, content: next } as ToolResult;
}

/**
 * A read whose text can show images (MIN-728): the payload plus `images`,
 * each image's src and alt text, to open with minddy_get_image. Omitted when
 * the text shows none.
 */
export function okWithImages(payload: Record<string, unknown>): ToolResult {
  const images = imagesIn(payload);
  return ok(images.length > 0 ? { ...payload, images, read_images_with: "minddy_get_image" } : payload);
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

const CAPABILITY_DENIED: Record<Exclude<ProjectCapability, "read">, string> = {
  comment:
    "Your role in this project is read-only: you cannot comment. Ask the project owner for comment access.",
  write:
    "Your role in this project is read-only (Reader): this tool needs Member access. Ask the project owner to change your role.",
  admin: "Only the project owner can use this tool.",
};

/**
 * Resolves a project and enforces the capability the running tool declared
 * in `MCP_TOOL_CAPABILITIES` (MIN-693). The access is re-read on every call,
 * so a role change applies to the next call without revoking tokens.
 */
export async function resolveProject(
  userId: string,
  projectId: unknown,
  capability: ProjectCapability = declaredProjectCapability()
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
  if (!accessAllows(access, capability)) {
    return {
      error: fail(
        "forbidden",
        CAPABILITY_DENIED[capability as Exclude<ProjectCapability, "read">]
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
  projectId: unknown,
  capability: ProjectCapability = declaredProjectCapability()
): Promise<
  | { userId: string; keyId: string | null; access: ProjectAccess }
  | { error: ToolResult }
> {
  const auth = requireUser(extra);
  if ("error" in auth) return auth;
  const project = await resolveProject(auth.userId, projectId, capability);
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

export interface ResolvedObjective {
  id: string;
  name: string;
  status: string;
  lead_user_id: string | null;
}

/**
 * Resolves an objective reference — UUID, or "obj:<name>" for an exact name —
 * to its id, pinned to the project (MIN-513). Same wrapper pattern as
 * resolveIssueRef: renders the shared resolver's error into MCP codes.
 */
export async function resolveObjectiveRef(
  access: ProjectAccess,
  ref: unknown
): Promise<{ objective: ResolvedObjective } | { error: ToolResult }> {
  const resolved = await resolveObjectiveRefCore(
    getServiceClient(),
    { projectId: access.project.id },
    ref
  );
  if ("error" in resolved) {
    return { error: fail(resolved.code, resolved.error) };
  }
  return { objective: resolved.objective };
}
