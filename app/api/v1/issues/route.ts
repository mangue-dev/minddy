import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  authenticateIntegration,
  publicApiError,
  requireIntegrationKind,
} from "@/lib/server/integration-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { createIssueForProject } from "@/lib/server/create-issue";
import { isPriority, isEffort } from "@/lib/issue-validation";

/**
 * POST /api/v1/issues — API publique d'intégration (Bearer mdy_…). Crée une
 * issue au statut 'triage' attribuée à l'intégration. Champs acceptés : title
 * (requis), description, priority, effort, categories (ids). Tout le reste est
 * ignoré — la whitelist ci-dessous est le point d'enforcement (pas d'assignee,
 * de parent ni de statut pilotables de l'extérieur).
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateIntegration(request);
  if (!auth.ok) return auth.response;
  const wrongKind = requireIntegrationKind(auth.integration, "issues");
  if (wrongKind) return wrongKind;

  const rate = checkSessionRateLimit(auth.integration.id, "integration:issues:post", {
    limit: 20,
  });
  if (!rate.allowed) {
    return publicApiError(429, "rate_limited", "Too many requests.", {
      "Retry-After": String(rate.retryAfter),
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return publicApiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  // Validation stricte : contrairement au cœur interne (drop silencieux), une
  // valeur invalide est refusée — meilleure DX pour l'intégrateur externe.
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return publicApiError(422, "title_required", "A non-empty title is required.");
  }
  if (body.priority !== undefined && !isPriority(body.priority)) {
    return publicApiError(
      422,
      "invalid_priority",
      "priority must be one of: none, urgent, high, medium, low."
    );
  }
  if (body.effort !== undefined && !isEffort(body.effort)) {
    return publicApiError(
      422,
      "invalid_effort",
      "effort must be one of: xs, s, m, l, xl."
    );
  }

  let categoryIds: string[] = [];
  if (body.categories !== undefined) {
    if (
      !Array.isArray(body.categories) ||
      body.categories.some((v) => typeof v !== "string")
    ) {
      return publicApiError(
        422,
        "unknown_category",
        "categories must be an array of category ids."
      );
    }
    categoryIds = body.categories as string[];
    if (categoryIds.length > 0) {
      const service = getServiceClient();
      const { data: known } = await service
        .from("categories")
        .select("id")
        .eq("project_id", auth.project.id)
        .in("id", categoryIds);
      const knownIds = new Set((known ?? []).map((c) => c.id as string));
      const unknown = categoryIds.filter((id) => !knownIds.has(id));
      if (unknown.length > 0) {
        return publicApiError(
          422,
          "unknown_category",
          `Unknown category ids: ${unknown.join(", ")}. GET /api/v1/issues/options lists the valid ones.`
        );
      }
    }
  }

  const result = await createIssueForProject({
    projectId: auth.project.id,
    actorId: null,
    integrationId: auth.integration.id,
    input: {
      title,
      ...(typeof body.description === "string"
        ? { description: body.description }
        : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.effort !== undefined ? { effort: body.effort } : {}),
      category_ids: categoryIds,
      status: "triage",
    },
  });

  if (!result.ok) {
    console.error("[api/v1/issues] create failed:", result.errorKey ?? result.rawMessage);
    return publicApiError(500, "internal_error", "Something went wrong.");
  }

  return NextResponse.json(
    {
      id: result.issue.id,
      number: result.issue.number,
      identifier: `${auth.project.key}-${result.issue.number}`,
      status: result.issue.status,
    },
    { status: 201 }
  );
}
