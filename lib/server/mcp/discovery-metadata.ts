/** Metadata hints that affect how a compact MCP tool description explains impact. */
export interface DiscoveryAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

const MAX_ACTION_CHARS = 320;
export const MAX_DISCOVERY_DESCRIPTION_CHARS = 600;

const IMPORTANT_ERROR =
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)*_(?:stale|not_found|already_linked|outside_repo|limit_reached|invalid)\b/g;

function actionSummary(description: string): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_ACTION_CHARS) return normalized;

  const candidate = normalized.slice(0, MAX_ACTION_CHARS + 1);
  const sentenceEnd = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("? "),
    candidate.lastIndexOf("! ")
  );
  if (sentenceEnd >= 80) return candidate.slice(0, sentenceEnd + 1);

  const wordEnd = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, wordEnd > 0 ? wordEnd : MAX_ACTION_CHARS)}…`;
}

function impactSummary(annotations: DiscoveryAnnotations): string {
  if (annotations.readOnlyHint) {
    return annotations.openWorldHint
      ? "Read-only in Minddy; may read a connected service."
      : "Read-only; does not change Minddy data.";
  }
  if (annotations.destructiveHint) {
    return "Changes Minddy data and may revoke or remove the target.";
  }
  return annotations.idempotentHint
    ? "Changes Minddy data; repeating the same request is idempotent."
    : "Changes Minddy data; not advertised as idempotent.";
}

/**
 * Turns the detailed reference description into cold-start discovery metadata.
 *
 * The full text remains available through `/llms-full.txt`. Discovery needs only the
 * action, side-effect hints, response envelope, and named concurrency/refusal errors.
 */
export function compactToolDescription(
  description: string | undefined,
  annotations: DiscoveryAnnotations = {}
): string {
  const action = actionSummary(description ?? "Minddy tool.");
  const errors = Array.from(new Set((description ?? "").match(IMPORTANT_ERROR) ?? []));
  const importantErrors = errors.length
    ? ` Important errors: ${errors.join(", ")}.`
    : "";
  const compact =
    `${action} ${impactSummary(annotations)} ` +
    "Returns JSON text; failures use { error: { code, message } }." +
    importantErrors;

  return compact.slice(0, MAX_DISCOVERY_DESCRIPTION_CHARS);
}
