type BoardIntegration = {
  id: string;
  kind: "issues" | "feedback";
  revoked_at: string | null;
};

type IssueIntegrationRef = {
  integration_id?: string | null;
};

/**
 * Keep active issue integrations available for future tickets, and retain a
 * revoked integration only while a living ticket still uses it. Feedback-only
 * integrations can never match a board ticket and are omitted.
 */
export function boardIntegrationFacets<T extends BoardIntegration>(
  integrations: readonly T[],
  issues: readonly IssueIntegrationRef[],
): T[] {
  const usedIds = new Set(
    issues.flatMap((issue) =>
      issue.integration_id ? [issue.integration_id] : [],
    ),
  );
  return integrations.filter(
    (integration) =>
      usedIds.has(integration.id) ||
      (integration.kind === "issues" && integration.revoked_at === null),
  );
}
