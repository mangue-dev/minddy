/**
 * Browser origin checks complement SameSite cookies and read-only GET handlers.
 * `isSameOriginRequest` requires a declared origin for browser-only actions.
 * `hasForeignOrigin` permits headerless API clients, but rejects explicitly
 * invalid or opaque origins. Both compare against the request host so previews,
 * local development, and custom domains follow the same rule.
 */

type HeaderBag = { headers: { get(name: string): string | null } };

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.host.toLowerCase() || null;
  } catch {
    return null;
  }
}

function expectedHost(request: HeaderBag): string | null {
  return request.headers.get("host")?.toLowerCase() || null;
}

/** Use Referer only when Origin is absent, never when Origin is invalid. */
function declaredOrigin(request: HeaderBag): string | null {
  return request.headers.get("origin") ?? request.headers.get("referer");
}

/** Browser-only actions require an explicit, valid declaration. */
export function isSameOriginRequest(request: HeaderBag): boolean {
  const host = expectedHost(request);
  const declared = hostOf(declaredOrigin(request));
  return Boolean(host && declared && host === declared);
}

/** Headerless API clients remain supported; invalid declarations fail closed. */
export function hasForeignOrigin(request: HeaderBag): boolean {
  const origin = declaredOrigin(request);
  if (origin === null) return false;
  const declared = hostOf(origin);
  const host = expectedHost(request);
  return !host || !declared || declared !== host;
}

/** State-changing methods require protection from third-party requests. */
export function isMutatingMethod(method: string): boolean {
  const verb = method.toUpperCase();
  return verb !== "GET" && verb !== "HEAD" && verb !== "OPTIONS";
}
