import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  resolveIssueRef as resolveIssueRefCore,
  type ResolvedIssueRef,
} from "@/lib/server/issue-reads";

/**
 * Boîte à outils commune des tools MCP : résultats ok/fail (JSON dans un bloc
 * text, codes d'erreur stables en anglais — pas de i18n, comme l'API
 * publique), résolution de l'utilisateur depuis AuthInfo, rate limit, et
 * garde d'accès projet/ticket. Toute requête issue est épinglée
 * `.eq("project_id")` — l'équivalent d'assertIssueInProject côté Numo,
 * puisqu'il n'y a pas de session RLS ici.
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

/** Extra passé par le SDK aux callbacks de tools — seul authInfo nous sert. */
export interface ToolExtra {
  authInfo?: AuthInfo;
}

export function getUserId(extra: ToolExtra): string | null {
  const userId = extra.authInfo?.extra?.userId;
  return typeof userId === "string" ? userId : null;
}

const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/** Garde combinée auth + rate limit, à appeler en tête de chaque tool.
    keyId = la clé API qui agit — les écritures l'enregistrent comme acteur
    (la timeline affiche « nom de la clé (mcp) », pas l'utilisateur). */
export function requireUser(
  extra: ToolExtra
): { userId: string; keyId: string | null } | { error: ToolResult } {
  const userId = getUserId(extra);
  if (!userId) return { error: fail("unauthorized", "Missing or invalid API key.") };
  const rawKeyId = extra.authInfo?.extra?.keyId;
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

/** Garde combinée auth + rate limit + accès projet des tools scopés projet.
    Partagée par les deux modules de tools (les tickets et compagnie dans
    tools.ts, les pages dans page-tools.ts) : un tool qui se garderait autrement
    serait un tool à qui on aurait oublié le rate limit. */
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

/** Les annotations MCP, les mêmes pour tous les tools de la surface. */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;
export const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;

export type ResolvedIssue = ResolvedIssueRef;

/**
 * Résout une référence de ticket — UUID, identifiant « MIND-42 » ou numéro
 * nu — vers son id, épinglée au projet. Enveloppe fine du résolveur partagé
 * (`lib/server/issue-reads.ts`, également utilisé par les tools ticket de
 * l'agent de code) : elle ne fait que rendre les codes d'erreur du MCP.
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
