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
 * POST /api/v1/issues — Public integration API (Bearer mdy_…). Create a
 * outcome with 'triage' status attributed to integration. Accepted fields: title
 * (required), description, priority, effort, categories (ids). Everything else is
 * ignored — the whitelist below is the enforcement point (not assigned,
 * parent or status controllable from the outside).
 */
// Terminals (MIN-118), aligned with the heart of creation: beyond, explicit refusal
// (the core would truncate silently — bad DX for an external integrator).
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 65_536;
const MAX_CATEGORIES = 50;

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
    // A non-object body (`null`, string, array) is valid JSON: refused
    // here rather than crashing on a lower field access.
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return publicApiError(400, "invalid_json", "Request body must be a JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return publicApiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  // Strict validation: unlike the internal core (silent drop), a
  // invalid value is refused — better DX for the external integrator.
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return publicApiError(422, "title_required", "A non-empty title is required.");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return publicApiError(
      422,
      "title_too_long",
      `title must be at most ${MAX_TITLE_LENGTH} characters.`
    );
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    return publicApiError(422, "invalid_description", "description must be a string.");
  }
  if (
    typeof body.description === "string" &&
    body.description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return publicApiError(
      422,
      "description_too_long",
      `description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`
    );
  }
  if (body.priority !== undefined && !isPriority(body.priority)) {
    return publicApiError(
      422,
      "invalid_priority",
      "priority must be one of: none, low, medium, high, urgent."
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
    if (categoryIds.length > MAX_CATEGORIES) {
      return publicApiError(
        422,
        "too_many_categories",
        `categories must contain at most ${MAX_CATEGORIES} ids.`
      );
    }
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
    // The owner's plan issue limit (MIN-72) is NOT a failure: it is
    // a definitive refusal as long as nothing changes on the account side. Send it back in 500
    // said “try again” to a client who could never have succeeded — he
    // resounded endlessly, and no one learned the real cause. The roads of
    // the app renders it in 403 located from the beginning; here it's the same 403,
    // with stable code to plug a message or CTA into.
    if (result.errorKey === "issueLimitReached") {
      const limit = result.params?.limit;
      return publicApiError(
        403,
        "issue_limit_reached",
        `This project has reached the ${limit ?? "issue"} issue limit of its owner's plan. The owner must upgrade or free up issues.`
      );
    }
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
