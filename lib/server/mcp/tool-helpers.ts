import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { issueIdentifier } from "@/lib/issue-constants";

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_RE = /^([A-Za-z]{2,5})-(\d+)$/;

export interface ResolvedIssue {
  id: string;
  number: number;
  identifier: string;
}

/**
 * Résout une référence de ticket — UUID, identifiant « MIND-42 » ou numéro
 * nu — vers son id, épinglée au projet. Un préfixe d'identifiant qui ne
 * correspond pas à la clé du projet est une erreur explicite (protège d'un
 * copier-coller depuis un autre projet).
 */
export async function resolveIssueRef(
  access: ProjectAccess,
  ref: unknown
): Promise<{ issue: ResolvedIssue } | { error: ToolResult }> {
  const raw = typeof ref === "string" ? ref.trim() : "";
  if (!raw) {
    return {
      error: fail(
        "invalid_params",
        "issue is required — pass a UUID, an identifier like 'MIND-42', or a bare issue number."
      ),
    };
  }

  const service = getServiceClient();
  const project = access.project;
  let query = service
    .from("issues")
    .select("id, number")
    .eq("project_id", project.id);

  const identifierMatch = raw.match(IDENTIFIER_RE);
  if (UUID_RE.test(raw)) {
    query = query.eq("id", raw);
  } else if (identifierMatch) {
    if (identifierMatch[1].toUpperCase() !== project.key.toUpperCase()) {
      return {
        error: fail(
          "issue_not_found",
          `Identifier prefix '${identifierMatch[1]}' doesn't match this project's key '${project.key}'.`
        ),
      };
    }
    query = query.eq("number", Number(identifierMatch[2]));
  } else if (/^\d+$/.test(raw)) {
    query = query.eq("number", Number(raw));
  } else {
    return {
      error: fail(
        "invalid_params",
        `'${raw}' is not a valid issue reference — pass a UUID, '${project.key}-<number>', or a bare number.`
      ),
    };
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { error: fail("database_error", error.message) };
  if (!data) {
    return {
      error: fail("issue_not_found", `Issue '${raw}' not found in this project.`),
    };
  }
  return {
    issue: {
      id: data.id as string,
      number: data.number as number,
      identifier: issueIdentifier(project.key, data.number as number),
    },
  };
}
