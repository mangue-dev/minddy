export function resolveAssistantProjectId(
  conversationProjectId: string | null,
  requestedProjectId: unknown,
): string | null {
  if (typeof requestedProjectId !== "string") return conversationProjectId;
  const explicitProjectId = requestedProjectId.trim();
  return explicitProjectId || conversationProjectId;
}
