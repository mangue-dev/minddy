export function resolveAssistantProjectId(
  contextProjectId: string | null,
  requestedProjectId: unknown,
): string | null {
  if (typeof requestedProjectId !== "string") return contextProjectId;
  const explicitProjectId = requestedProjectId.trim();
  return explicitProjectId || contextProjectId;
}
