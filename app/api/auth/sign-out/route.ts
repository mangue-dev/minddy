/**
 * Clears the caller's HTTP cache at sign-out (MIN-999), so pages and API
 * responses of the departing account are not served from cache to the next
 * one on a shared machine.
 *
 * Only `"cache"`: `"cookies"` would also drop the locale (`NEXT_LOCALE`) and
 * time-zone cookies, and its scope is the whole registrable domain, so it
 * would sign the same browser out of sibling hosts (preview, self-hosted
 * subdomains). The Supabase session cookies are already removed by the
 * client's `signOut`. `"storage"` is not sent either: it would unregister the
 * push service worker; the client sweeps its own keys instead
 * (`lib/account-storage.ts`).
 *
 * The response only affects the browser that asked for it, so it needs no
 * session; POST keeps it from being triggered by a link or a prefetch.
 */
export function POST() {
  return new Response(null, {
    status: 204,
    headers: {
      "Clear-Site-Data": '"cache"',
      "Cache-Control": "no-store",
    },
  });
}
