import { type NextRequest } from "next/server";

import { buildDesktopOpenUrl } from "@/lib/desktop/open-link";

/**
 * `GET /desktop/return?next=…` — bounce from browser to app (MIN-293).
 *
 * This page is never SEEN, or not for half a second. She is the address
 * that we give to the services which send us somewhere after a detour through
 * the browser — Stripe for now — because they only accept one URL
 * http(s) URL in return, never a `minddy://` URL. It translates one into the other.
 *
 * **Why HTML and not a 302 redirect.** Towards an app schema, the
 * redirection is refused by some browsers (and silently:
 * the page remains blank). The gesture that works everywhere is a `location.href`
 * from the page, with a link visible below for those who have blocked it or have not
 * not the app — hence the two, and the sentence that accompanies them.
 *
 * **No sessions are read here**, and this is deliberate: the browser that
 * returns from Stripe is not necessarily the one where you are connected. The page does not
 * carries nothing personal — just a destination, already reduced to a path
 * internal by `buildDesktopOpenUrl`. This is what allows it to be public
 * (proxy.ts, `PUBLIC_ROUTES`) without exposing anything.
 *
 * `noindex`: a plumbing page has no place in an index.
 */
export function GET(request: NextRequest) {
  const deepLink = buildDesktopOpenUrl(request.nextUrl.searchParams.get("next") ?? "");
  const escaped = deepLink.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  // Use `fr` when the browser locale starts with `fr`: this page is served
  // without a session or language cookie, so there is nothing else to inspect.
  const fr = (request.headers.get("accept-language") ?? "").toLowerCase().startsWith("fr");

  const html = `<!doctype html>
<html lang="${fr ? "fr" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>minddy</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100dvh;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem;
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    text-align: center; padding: 2rem;
    background: #fff; color: #111;
  }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #fafafa; } }
  a { color: inherit; }
</style>
</head>
<body>
<p>${fr ? "Retour à minddy…" : "Returning to minddy…"}</p>
<p><a href="${escaped}">${fr ? "Ouvrir l’application" : "Open the app"}</a></p>
<script>location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
