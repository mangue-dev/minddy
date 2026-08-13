import { type NextRequest } from "next/server";

import { buildDesktopOpenUrl } from "@/lib/desktop/open-link";

/**
 * `GET /desktop/return?next=…` — le rebond du navigateur vers l'app (MIN-293).
 *
 * Cette page n'est jamais VUE, ou alors une demi-seconde. Elle est l'adresse
 * qu'on donne aux services qui nous renvoient quelque part après un détour par
 * le navigateur — Stripe pour l'instant — parce qu'ils n'acceptent qu'une URL
 * http(s) en retour, jamais un `minddy://`. Elle traduit l'un en l'autre.
 *
 * **Pourquoi du HTML et non une redirection 302.** Vers un schéma d'app, la
 * redirection est refusée par une partie des navigateurs (et silencieusement :
 * la page reste blanche). Le geste qui marche partout est un `location.href`
 * depuis la page, avec un lien visible en dessous pour qui l'a bloqué ou n'a
 * pas l'app — d'où les deux, et la phrase qui les accompagne.
 *
 * **Aucune session n'est lue ici**, et c'est délibéré : le navigateur qui
 * revient de Stripe n'est pas forcément celui où l'on est connecté. La page ne
 * porte rien de personnel — juste une destination, déjà réduite à un chemin
 * interne par `buildDesktopOpenUrl`. C'est ce qui lui permet d'être publique
 * (proxy.ts, `PUBLIC_ROUTES`) sans rien exposer.
 *
 * `noindex` : une page de plomberie n'a rien à faire dans un index.
 */
export function GET(request: NextRequest) {
  const deepLink = buildDesktopOpenUrl(request.nextUrl.searchParams.get("next") ?? "");
  const escaped = deepLink.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  // `fr` dès que la locale du navigateur commence par `fr` : cette page est
  // servie sans session et sans cookie de langue, il n'y a rien d'autre à lire.
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
