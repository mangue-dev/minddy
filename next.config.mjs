import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";
import { commitsSinceVersion } from "./scripts/commits-since-version.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Redirections de slugs français (MIN-88). Sous `/fr`, seuls les slugs traduits
 * existent : `/fr/pricing` n'est pas une deuxième URL valide pour la page
 * tarifs, c'est une erreur — et deux URLs pour une page, c'est exactement ce que
 * `canonical` et `hreflang` passent leur temps à démêler.
 *
 * **Tenu en phase avec `lib/public-routes.ts` par `lib/public-routes.test.ts`** :
 * un fichier `.mjs` ne peut pas importer la table TypeScript, donc la liste est
 * recopiée ici et le test échoue si les deux divergent.
 */
export const FRENCH_SLUG_REDIRECTS = [
  { source: "/fr/pricing", destination: "/fr/tarifs" },
  { source: "/fr/download", destination: "/fr/telecharger" },
  { source: "/fr/changelog", destination: "/fr/nouveautes" },
  { source: "/fr/legal", destination: "/fr/mentions-legales" },
  { source: "/fr/terms", destination: "/fr/cgu" },
  { source: "/fr/privacy", destination: "/fr/confidentialite" },
];

/**
 * Toutes les URLs publiques, EN et FR — même recopie, même test de
 * non-divergence. Elles servent ici à poser l'en-tête de cache CDN (voir
 * `headers()`).
 */
export const PUBLIC_ROUTE_PATHS = [
  "/",
  "/pricing",
  "/mcp",
  "/download",
  "/changelog",
  "/alternatives/linear",
  "/alternatives/jira",
  "/alternatives/notion",
  "/legal",
  "/terms",
  "/privacy",
  "/cookies",
  "/fr",
  "/fr/tarifs",
  "/fr/mcp",
  "/fr/telecharger",
  "/fr/nouveautes",
  "/fr/alternatives/linear",
  "/fr/alternatives/jira",
  "/fr/alternatives/notion",
  "/fr/mentions-legales",
  "/fr/cgu",
  "/fr/confidentialite",
  "/fr/cookies",
];

/**
 * Les hosts qui servent minddy elle-même, en expression régulière — la forme
 * qu'attend le `has: [{ type: "host" }]` d'une entrée de `headers()` (comparée
 * ancrée, port retiré, en minuscules).
 *
 * Elle existe pour BORNER le cache CDN des pages publiques à ces hosts-là
 * (MIN-337). Sur un domaine client, `/` sert un board de feedback personnalisé
 * par cookie : il tombait sous le même en-tête, sans `Vary`, et le CDN pouvait
 * servir à un visiteur la page d'un autre.
 *
 * Volontairement plus étroite que `isPrimaryHost` (lib/public-hosts.ts), qui
 * accepte tout `*.minddy.app` : un sous-domaine minddy servant l'app un jour
 * n'aurait ici que le cache en moins, quand l'inverse — un domaine client qui
 * passerait la grille — est le défaut qu'on corrige. `feedback.minddy.app`, le
 * domaine de dogfooding, est justement un `*.minddy.app` qui n'est PAS primaire.
 * `lib/public-routes.test.ts` tient les deux en phase.
 */
export const PRIMARY_HOST_PATTERN =
  "(?:www\\.|preview\\.)?minddy\\.app|localhost|[a-z0-9-]+\\.vercel\\.app";

/** Sur Vercel, hors production (preview, deploys de branche). Pas en local. */
const isVercelNonProduction =
  !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this app so Turbopack doesn't walk up into the
  // sibling mangue-ui monorepo (mangue-ui is a `file:` dependency).
  turbopack: { root: dir },
  // mangue-ui ships TS/TSX source (no build) — Next must transpile it.
  transpilePackages: ["mangue-ui"],
  // `radix-ui` est un baril sur toutes les primitives Radix, et c'est par lui que
  // les composants de mangue-ui les importent (`import { Dialog } from
  // "radix-ui"`). Next réécrit ces imports nommés vers le module qui les exporte
  // vraiment, au lieu d'évaluer le baril entier (MIN-100).
  //
  // Le même réglage ne peut RIEN pour le baril de mangue-ui : la réécriture a
  // besoin de sous-chemins, et le champ `exports` du paquet n'en publie aucun.
  // C'est l'alias `mangue-ui/*` de `tsconfig.json` qui s'en charge — voir le
  // commentaire là-bas, il porte la mesure.
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
  /**
   * LES DEUX BUNDLES ESBUILD DU DÉPÔT, embarqués dans les fonctions.
   *
   * Tous deux sont produits par `prebuild` et LUS PAR CHEMIN à l'exécution — l'un
   * par `fs`, l'autre par `require`. Le traceur de Next suit les IMPORTS : un
   * fichier lu par chemin n'est pas une arête du graphe, et il ne peut donc pas
   * le voir passer. Sans ces lignes, la fonction déploie sans eux.
   *
   * `.agent-vm/` (MIN-224) — le harness de la microVM, écrit dans la VM au
   * démarrage de chaque tour. Absent, chaque run `loop_in_vm` échoue sur un
   * ENOENT. Le motif couvre toutes les routes d'API : le harnais est écrit depuis
   * le chemin de LANCEMENT comme depuis le CRON de drain, et lister les deux à la
   * main ferait qu'un troisième appelant, un jour, découvrirait le problème en
   * production.
   *
   * `.pages-md/` (MIN-295) — la projection markdown des pages, sortie du bundler
   * de Next parce que celui-ci substitue `typeof window` → `"undefined"` et
   * réduit ainsi `elementFromString` de tiptap à un `throw` inconditionnel (voir
   * scripts/build-pages-md.mjs, qui porte la mesure). Ici le motif est `/**`, et
   * pas `/api/**` : la projection est appelée depuis les routes d'API, mais aussi
   * depuis l'export, la recherche et les server actions de pages — c'est-à-dire
   * depuis des routes de page. Restreindre le motif reviendrait à tenir cette
   * liste à la main, pour économiser un fichier que Vercel mutualise de toute
   * façon entre les traces.
   */
  outputFileTracingIncludes: {
    "/api/**": [".agent-vm/**"],
    "/**": [".pages-md/**"],
  },
  // Bridge Vercel's server-only VERCEL_ENV into a public var so client
  // components (e.g. the sidebar env badge) can tell prod/preview/local apart.
  // Unset locally → "development". Inlined at build time.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "development",
    // Le SHA du commit qui a produit CE bundle (MIN-157). Server-only chez
    // Vercel comme VERCEL_ENV, donc bridgé ici — et inliné au build, ce qui est
    // exactement le point : la constante reste celle de la version chargée dans
    // l'onglet, quand /api/version répond, elle, celle du déploiement qui sert
    // le trafic. Vide en local (et si « Automatically expose System Environment
    // Variables » est décoché) → la détection s'éteint d'elle-même.
    NEXT_PUBLIC_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    // Le nombre de commits entre le tag de la version courante et le commit
    // construit — le nombre affiché derrière le numéro de version (0.8.9-3).
    // Mesuré ICI parce que c'est le seul moment où le dépôt est là : le runtime
    // Vercel ne voit ni `.git` ni l'historique. Voir le module pour la mesure,
    // et pour le `VERCEL_DEEP_CLONE=1` qu'elle réclame côté Vercel.
    NEXT_PUBLIC_VERSION_COMMITS: String(commitsSinceVersion()),
  },
  // Test local des domaines personnalisés (MIN-36) : hosts /etc/hosts pointés
  // sur 127.0.0.1 — sans quoi `next dev` bloque les requêtes cross-origin
  // (server actions, assets) venant d'un host non-localhost.
  allowedDevOrigins: ["board.minddy.test", "view.minddy.test"],
  async redirects() {
    return [
      // The "Mes tickets" tabs merged into the tickets board as a system view —
      // old routes land there with it pre-selected (?view=my; extra query params
      // like ?issue= are preserved). Temporary (307): don't let browsers cache it.
      { source: "/my", destination: "/all?view=my", permanent: false },
      {
        source: "/projects/:id/my",
        destination: "/projects/:id?view=my",
        permanent: false,
      },
      ...FRENCH_SLUG_REDIRECTS.map((rule) => ({ ...rule, permanent: true })),
    ];
  },
  async headers() {
    const headers = [];

    // En-têtes de sécurité, toutes routes (MIN-118). HSTS ne vaut que sur une
    // réponse HTTPS — inoffensif en dev, et la redirection HTTP→HTTPS est
    // native Vercel. `preload` est dans l'en-tête mais le domaine n'est PAS
    // soumis à hstspreload.org (quasi irréversible). La CSP se limite à
    // `frame-ancestors`/`base-uri`/`form-action` : un `script-src` à nonces
    // exigerait de réécrire la chaîne de rendu (scripts inline Next +
    // theme-init-script) — chantier séparé si souhaité. Micro autorisé en
    // self : la dictée de l'assistant s'en sert.
    const securityHeaders = (csp) => [
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=()",
      },
      { key: "Content-Security-Policy", value: csp },
    ];

    const BASE_CSP = "frame-ancestors 'none'; base-uri 'self'";

    // ⚠ `/oauth/authorize` est EXCLU de cette entrée (un seul en-tête CSP par
    // réponse : deux se cumulent en intersection, la plus stricte gagnerait).
    // L'exclusion est ancrée sur `/` ou la fin — sans quoi une future route en
    // `/oauth/authorize-…` sortirait en silence de TOUS ces en-têtes.
    headers.push({
      source: "/((?!oauth/authorize(?:/|$)).*)",
      headers: securityHeaders(`${BASE_CSP}; form-action 'self'`),
    });

    // L'écran de consentement OAuth, et lui seul, sans `form-action`.
    //
    // Son formulaire (components/oauth/consent-card.tsx) POSTe vers
    // /api/oauth/authorize, qui répond 303 vers le `redirect_uri` du client MCP
    // — donc vers claude.ai, un localhost, ou un schéma applicatif : une cible
    // cross-origin PAR CONSTRUCTION. Or Chrome et Safari appliquent
    // `form-action` à la cible de la REDIRECTION qui suit un POST de formulaire
    // (Firefox non — le comportement n'est pas spécifié). `form-action 'self'`
    // ici bloquerait donc le retour au client sur deux navigateurs sur trois,
    // c'est-à-dire tout le flux OAuth du MCP, seule voie d'accès depuis le
    // retrait des clés `mdyk_`. Le reste de la CSP est identique.
    headers.push({
      source: "/oauth/authorize",
      headers: securityHeaders(BASE_CSP),
    });

    // Le service worker des notifications push (MIN-183).
    //
    // `Content-Type` : servi depuis `public/`, il l'a déjà — mais un service
    // worker refusé pour cause de type MIME échoue à l'enregistrement, sans
    // recours possible côté client. On le pose explicitement.
    //
    // `Cache-Control` : le navigateur re-télécharge `/sw.js` pour comparer les
    // octets et décider s'il y a une nouvelle version. Un worker mis en cache
    // est un worker qui ne se met jamais à jour.
    //
    // ⚠ SURTOUT PAS de `Content-Security-Policy` ici, malgré ce que suggère le
    // guide PWA de Next : l'entrée fourre-tout ci-dessus en pose DÉJÀ une sur
    // `/sw.js`, et deux en-têtes CSP sur une même réponse se cumulent en
    // intersection — la plus stricte gagne, sur chaque directive. C'est le même
    // piège que `/oauth/authorize` plus haut, dans l'autre sens.
    headers.push({
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      ],
    });

    // Les pages publiques, dans leurs deux langues. Recopiées de
    // `lib/public-routes.ts` faute de pouvoir importer du TypeScript ici —
    // `lib/public-routes.test.ts` vérifie qu'elles ne divergent pas.
    //
    // Elles répondaient `cache-control: private, no-cache, no-store` avec
    // `x-vercel-cache: MISS` à CHAQUE appel, parce que la landing appelait
    // `auth.getUser()` au rendu. Ce rebond est passé dans le proxy (qui
    // s'exécute avant le cache), plus rien dans ces pages ne dépend d'un
    // cookie : le CDN peut enfin les servir.
    //
    // Pas de `Vary: Cookie` : sur le CDN de Vercel il ferait tomber le taux de
    // hit à zéro (chaque combinaison de cookies devient une entrée), c'est-à-dire
    // exactement l'inverse de ce qu'on cherche. La langue est portée par l'URL
    // et non par un cookie depuis les URLs localisées, et la session est
    // traitée par le middleware — il ne reste rien à faire varier.
    //
    // ⚠ POURQUOI DEUX EN-TÊTES, et pas seulement `Cache-Control`.
    //
    // Ces pages sont rendues dynamiquement (elles lisent `headers()` pour
    // résoudre la locale), et Next pose LUI-MÊME `Cache-Control: private,
    // no-cache, no-store` sur la réponse d'un rendu dynamique. Sur Vercel, les
    // en-têtes de ce fichier sont appliqués par le routeur AVANT l'invocation de
    // la fonction : celle-ci écrase ensuite `Cache-Control`. Mesuré sur la prod
    // au premier déploiement — `private, no-store` et `x-vercel-cache: MISS`,
    // alors que `next start` en local donnait bien la valeur d'ici. (Le
    // `X-Robots-Tag` plus bas, lui, fonctionne : Next ne le pose jamais, donc
    // personne ne l'écrase.)
    //
    // `Vercel-CDN-Cache-Control` est l'en-tête prévu pour ce cas : il ne pilote
    // QUE le cache de l'Edge Network de Vercel, Next n'y touche pas, et il est
    // retiré de la réponse avant qu'elle n'atteigne le navigateur. On garde
    // `Cache-Control` à côté : il reste juste hors de Vercel (et en local), et
    // le navigateur, lui, continuera de recevoir le `private, no-store` de Next
    // — ce qui est très bien, on veut un cache CDN partagé, pas un cache
    // navigateur qui figerait la page d'un visiteur qui vient de se connecter.
    //
    // ⚠ `has: host` — ces en-têtes ne valent QUE sur les hosts de minddy.
    //
    // Un domaine personnalisé (MIN-36) sert à sa racine un board de feedback ou
    // une vue partagée, c'est-à-dire une page personnalisée par cookie. Sans
    // cette condition, le `/` du client tombait sous la ligne ci-dessus : mis en
    // cache par le CDN, sans `Vary`, donc servi à qui passe ensuite (MIN-337).
    // Le proxy pose en plus `no-store` sur toute réponse d'un domaine client.
    headers.push(
      ...PUBLIC_ROUTE_PATHS.map((source) => ({
        source,
        has: [{ type: "host", value: PRIMARY_HOST_PATTERN }],
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
          {
            key: "Vercel-CDN-Cache-Control",
            value: "max-age=300, stale-while-revalidate=86400",
          },
        ],
      })),
    );

    // Preview et deploys de branche : un site complet, en double, qui répondait
    // jusqu'ici `Allow: /` sur `preview.minddy.app/robots.txt` (MIN-88). Le
    // robots.txt ne protège que la DÉCOUVERTE : une URL déjà connue d'un
    // crawler est visitée quand même, et seule cette en-tête l'empêche
    // d'atterrir dans l'index — où elle concurrencerait la vraie.
    if (isVercelNonProduction) {
      headers.push({
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      });
    }

    return headers;
  },
};

export default withNextIntl(nextConfig);
