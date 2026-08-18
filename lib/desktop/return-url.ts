import { DESKTOP_RETURN_PATH } from "@/lib/desktop/config";

/**
 * Where to return someone sent to a third party (MIN-293).
 *
 * The third party — Stripe — only accepts an http(s) URL in return. From the web,
 * is the page itself; from the desktop app, it's the bounce page, which
 * reopens the app on it (app/desktop/return/route.ts).
 *
 * **`fromDesktop` comes from the BODY of the request, not from the user agent.** This is the
 * rule lib/desktop/bridge.ts: what decides is the presence of the bridge, which
 * only the page can observe. The user agent suffix is ​​there for the logs.
 * And the worst a customer can get for lying is getting sent
 * to an app they don't have — on HIS own session.
 */
export function billingReturnUrl(
  origin: string,
  path: string,
  fromDesktop: boolean
): string {
  if (!fromDesktop) return `${origin}${path}`;
  return `${origin}${DESKTOP_RETURN_PATH}?next=${encodeURIComponent(path)}`;
}
