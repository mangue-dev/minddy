/**
 * The session FOLLOWS the channel (MIN-353).
 *
 * ## The problem, and why it has no solution on the web side
 *
 * Both channels serve the same Supabase project — same accounts, same
 * data — but not the same ORIGIN: `www.minddy.app` and
 * `preview.minddy.app`. But a cookie belongs to a host. Switching the channel
 * therefore arrived on the login screen, each time, in both directions:
 * the session exists, it is valid, it is simply stored under the other
 * door.
 *
 * Expand the cookie to the domain (`.minddy.app`) would fix it for everyone
 * — and also give it to everything that lives under this domain, including that
 * that we put there one day without thinking about it. This is not a setting to take for
 * a convenience of the desktop app.
 *
 * **The report is therefore done in the shell, and nowhere else.** She has
 * the two jars on hand (only one `session` Electron for two
 * origins), it knows exactly when the switch occurs, and nothing it does changes what the web serves to a browser. GoTrue ROTATES the refresh token for each use: two
 * origins that hold the same end up having one with an expired
 * token, and using it is worth disconnecting. This is why the report is
 * always in the direction of the seesaw, **from the origin that we leave**: the one
 * that we leave is the one that has just used it, therefore the one that has the fresh token
 *. The one we join is overwritten, not merged.
 *
 * What remains behind is out of date, and does not have to be cleaned: the next
 * switch in the other direction will overwrite it in turn, with fresh. Neither side
 * ever uses a token that it did not receive on the last pass.
 *
 * PUR module: `desktop/src/main.ts` reads and writes the jar, this file says what.
 */

/** A cookie such as Electron makes (`Electron.Cookie`), reduced to what we read. */
export interface SourceCookie {
  name: string;
  value: string;
  /** Absent on a session cookie — it then dies with the app. */
  expirationDate?: number;
  sameSite?: string;
}

/** What we pass to `cookies.set` (`Electron.CookiesSetDetails`). */
export interface CarriedCookie {
  url: string;
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  expirationDate?: number;
}

/** The values ​​that Electron accepts; everything else falls on that of Supabase. */
const SAME_SITE = new Set(["unspecified", "no_restriction", "lax", "strict"]);

/**
 * Cookies that CARRY the session, and them alone.
 *
 * `@supabase/ssr` writes `sb-<ref>-auth-token`, and splits it into
 * `sb-<ref>-auth-token.0`, `.1`… when the load exceeds the size of a cookie.
 * The pieces travel together or not at all: one is missing and the session
 * is no longer read again.
 *
 * **Which is deliberately EXCLUDED**: `…-auth-token-code-verifier`, the
 * PKCE checker of an authentication round in progress. It belongs to the turn
 * that drew it, on the origin that drew it; Reporting it elsewhere only leaves a half-trade that no one will finish. And everything else — language,
 * cookie consent, shared view tokens — which is an origin setting, not an identity.
 */
export function isSessionCookie(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}

/**
 * What to write on the ARRIVAL origin, based on what we read about
 * the departure one.
 *
 * The options are not copied from the source, they are DEDUCED from the target:
 * `secure` follows its protocol (`https` in preview as in production, `http` in
 * local dev), and `httpOnly` remains false because the Supabase client of the
 * browser reads these cookies in JavaScript to reconstruct the session — the
 * same choice than `lib/session-cookies.ts`, for the same reason. Without `domain`:
 * we write a HOST cookie, which does not overflow onto neighbors.
 */
export function carrySessionCookies(
  cookies: readonly SourceCookie[],
  targetOrigin: string
): CarriedCookie[] {
  const secure = targetOrigin.startsWith("https://");
  return cookies.filter((cookie) => isSessionCookie(cookie.name)).map((cookie) => ({
    url: targetOrigin,
    name: cookie.name,
    value: cookie.value,
    path: "/",
    secure,
    httpOnly: false,
    sameSite:
      cookie.sameSite && SAME_SITE.has(cookie.sameSite)
        ? (cookie.sameSite as CarriedCookie["sameSite"])
        : "lax",
    ...(cookie.expirationDate === undefined
      ? {}
      : { expirationDate: cookie.expirationDate }),
  }));
}

/**
 * Session cookies to be DELETED on the arrival origin before writing.
 *
 * The case that we repair: the target carried a session divided into three pieces,
 * the one that arrives makes two. Writing over leaves the `.2` of the old
 * lying around, and the client puts together three pieces, the last of which does not belong to
 * on the same load — an unreadable session, therefore a disconnection, on a path
 * whose whole purpose was to avoid it.
 *
 * We only erase what we are not going to rewrite: the rest will be overwritten anyway, and a cookie removed then put back is a cookie that does not exist during
 * the interval.
 */
export function staleSessionCookies(
  targetCookies: readonly SourceCookie[],
  carried: readonly CarriedCookie[]
): string[] {
  const keep = new Set(carried.map((cookie) => cookie.name));
  return targetCookies
    .filter((cookie) => isSessionCookie(cookie.name) && !keep.has(cookie.name))
    .map((cookie) => cookie.name);
}
