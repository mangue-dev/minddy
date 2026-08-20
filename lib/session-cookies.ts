import type { CookieOptions } from "@supabase/ssr";
import type { NextResponse } from "next/server";

/**
 * Cookie options for SESSION Supabase (MIN-351).
 *
 * `@supabase/ssr` writes its cookies with its own defaults —
 * `{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400j }` — and there are
 * NO `secure` in it (see `DEFAULT_COOKIE_OPTIONS` in the package). The cookies
 * which carry the session were therefore the only ones in the repository to leave without it: the
 * three handwritten ones (OTP waiting token, shared view unlocking,
 * identity of the public board) all leave it.
 *
 * Without `Secure`, the browser agrees to send the cookie back to `http://` — it's enough to take the victim to a clear link to the domain to read the
 * access token in transit. HSTS covers the case in production, but HSTS is a
 * browser policy that needs a first visit to install:
 * the flag is carried by the cookie itself.
 *
 * `Secure` follows the actual app origin. Public deployments stay HTTPS-only,
 * while the explicitly supported localhost and private-network HTTP modes must
 * be able to retain a session. The browser uses its current protocol; the
 * server uses `MINDDY_PUBLIC_APP_URL` and falls back to the production-safe
 * default when no origin is configured.
 *
 * `httpOnly` remains FALSE, and this is not an oversight: the browser client reads
 * these cookies in JavaScript to rebuild the session. Making them `httpOnly`
 * would disconnect the app on each reload.
 */
export function cookieRequiresSecure({
  appUrl,
  browserHostname,
  browserProtocol,
  production,
}: {
  appUrl?: string;
  browserHostname?: string;
  browserProtocol?: string;
  production: boolean;
}): boolean {
  const privateHttpHost = (hostname: string) => {
    if (["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase())) return true;
    const parts = hostname.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254);
  };
  if (browserProtocol) return browserProtocol !== "http:" || !browserHostname || !privateHttpHost(browserHostname);
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      return url.protocol !== "http:" || !privateHttpHost(url.hostname);
    } catch {
      // Invalid public origins are rejected by runtime configuration. Keep the
      // safer cookie default while that separate error is reported.
      return true;
    }
  }
  return production;
}

export const SESSION_COOKIE_OPTIONS = {
  secure: cookieRequiresSecure({
    appUrl: process.env.MINDDY_PUBLIC_APP_URL,
    browserHostname: typeof window === "undefined" ? undefined : window.location.hostname,
    browserProtocol: typeof window === "undefined" ? undefined : window.location.protocol,
    production: process.env.NODE_ENV === "production",
  }),
} as const;

/**
 * What `@supabase/ssr` gives to write, kept aside then reported on the
 * response returned (MIN-293).
 *
 * Reading a session can RENEW it: when the access token has expired,
 * GoTrue makes a new couple and **spins** the refresh token at the
 * passage. An adapter that throws away what it is given to write therefore transforms
 * a read into session destruction — the server has spent the token, the
 * browser keeps the old one, and the next refresh fails in
 * `refresh_token_not_found`.
 *
 * Separated from Supabase to be held by a test: it is the link that was missing,
 * and a link that cannot be exercised is a link that will break again.
 */
export interface CookieSink {
  /** What `@supabase/ssr` calls to write — its `cookies.setAll`. */
  collect: (cookies: { name: string; value: string; options: CookieOptions }[]) => void;
  /** To call on the rendered response — including a redirect. */
  applyCookies: <T extends NextResponse>(response: T) => T;
}

export function createCookieSink(): CookieSink {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  return {
    collect(cookies) {
      pending.push(...cookies);
    },
    applyCookies(response) {
      for (const { name, value, options } of pending) {
        response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
      }
      return response;
    },
  };
}
