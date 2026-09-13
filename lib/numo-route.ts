export type AppSearchParams = Record<string, string | string[] | undefined>;

const LEGACY_AGENT_PARAMS = ["run", "issue"] as const;

/** Existing worker histories keep their detail surface while new work uses Numo. */
export function usesLegacyAgentSurface(params: AppSearchParams): boolean {
  return LEGACY_AGENT_PARAMS.some((key) => params[key] !== undefined);
}

/** Preserve query parameters when redirecting old Numo links to the canonical route. */
export function numoPathFromSearchParams(params: AppSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  const serialized = query.toString();
  return serialized ? `/numo?${serialized}` : "/numo";
}
