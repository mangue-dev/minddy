import "server-only";

/** Inspect the route's fixed result keys, never worker exceptions or row content. */
export function maintenanceDiagnostics(result: Record<string, unknown>, signal: AbortSignal) {
  const failedDomains: string[] = [];
  const interruptedDomains: string[] = [];
  for (const [domain, value] of Object.entries(result)) {
    if (domain === "invitation_failed" && value === true) failedDomains.push("invitations");
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const batch = value as { failed?: unknown; interrupted?: unknown };
    if (batch.failed === true || typeof batch.failed === "number" && batch.failed > 0) failedDomains.push(domain);
    if (batch.interrupted === true) interruptedDomains.push(domain);
  }
  return { aborted: signal.aborted, failed_domains: failedDomains, interrupted_domains: interruptedDomains };
}
