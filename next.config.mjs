import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const dir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this app so Turbopack doesn't walk up into the
  // sibling mangue-ui monorepo (mangue-ui is a `file:` dependency).
  turbopack: { root: dir },
  // mangue-ui ships TS/TSX source (no build) — Next must transpile it.
  transpilePackages: ["mangue-ui"],
  // Bridge Vercel's server-only VERCEL_ENV into a public var so client
  // components (e.g. the sidebar env badge) can tell prod/preview/local apart.
  // Unset locally → "development". Inlined at build time.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "development",
  },
  // Test local des domaines personnalisés (MIN-36) : hosts /etc/hosts pointés
  // sur 127.0.0.1 — sans quoi `next dev` bloque les requêtes cross-origin
  // (server actions, assets) venant d'un host non-localhost.
  allowedDevOrigins: ["board.minddy.test", "view.minddy.test"],
  // The "Mes tickets" tabs merged into the tickets board as a system view —
  // old routes land there with it pre-selected (?view=my; extra query params
  // like ?issue= are preserved). Temporary (307): don't let browsers cache it.
  async redirects() {
    return [
      { source: "/my", destination: "/all?view=my", permanent: false },
      {
        source: "/projects/:id/my",
        destination: "/projects/:id?view=my",
        permanent: false,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
