/**
 * Where does this request come from? (MIN-345)
 *
 * Minddy's entire CSRF protection relied on the `SameSite=Lax` of the cookie
 * Supabase. This is solid for a `POST` — a form or a `fetch` coming from a
 * other site doesn't take the cookie — but `Lax` has an exception, and that's
 * exactly the one that cost us three surfaces: **the navigation `GET` of
 * first level**. A link clicked from anywhere arrives at our home with the
 * full session.
 *
 * The basic answer is elsewhere (do not mutate anything on a `GET`). This module is the
 * control that was missing above: does the browser SAY it comes from
 * nous ?
 *
 * ## Two levels, and why they are not the same
 *
 * `isSameOriginRequest` **requires** header. To be reserved for surfaces which are
 * knows that they are always reached by a browser — a form of
 * the app —, because any browser sends `Origin` on a non-`GET` request
 * since 2020, and that a request without a header is therefore an anomaly.
 *
 * `hasForeignOrigin` only refuses what is **explicitly elsewhere**.
 * This is the API route guard: an absence of `Origin` is there, on purpose.
 * It cannot come from a third-party page (the browser would have asked it), and
 * refusing it would drop legitimate callers who don't have a page — a
 * command line tool, a probe, a test. We refuse what is declared
 * stranger ; We do not ask for our papers from anyone who does not declare themselves.
 *
 * ## What we compare to
 *
 * To `host` of the query itself, never to a list of domains. minddy is
 * served under several legitimate origins — `www.minddy.app`, previews
 * Vercel, `localhost` in development, customer custom domains
 * — and a list written somewhere would be false the day one of them
 * exchange. “The calling page is served by the same host as the route
 * called” has nothing to keep up to date.
 */

type HeaderBag = { headers: { get(name: string): string | null } };

function hostOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    return new URL(value).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

function expectedHost(request: HeaderBag): string | null {
  return request.headers.get("host")?.toLowerCase() || null;
}

/**
 * The origin declared by the browser, or that of `Referer` failing that —
 * some navigations only have the second. `null` = nothing declared.
 */
function declaredHost(request: HeaderBag): string | null {
  return hostOf(request.headers.get("origin")) ?? hostOf(request.headers.get("referer"));
}

/** True only if the request SAYS coming from us. A silent query is
    refused — see the file header to see where this is the correct choice. */
export function isSameOriginRequest(request: HeaderBag): boolean {
  const host = expectedHost(request);
  const declared = declaredHost(request);
  return Boolean(host && declared && host === declared);
}

/** True when the request is declared from ANOTHER origin. A silent request
    makes `false`: nothing to complain about. */
export function hasForeignOrigin(request: HeaderBag): boolean {
  const declared = declaredHost(request);
  if (!declared) return false;
  const host = expectedHost(request);
  return Boolean(host) && declared !== host;
}

/** Methods that change state, and therefore those that a third-party page should not
    never be able to trigger on someone's behalf. */
export function isMutatingMethod(method: string): boolean {
  const verb = method.toUpperCase();
  return verb !== "GET" && verb !== "HEAD" && verb !== "OPTIONS";
}
