import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTES,
  PUBLIC_ROUTE_PATHS,
  englishPathForFrench,
  localeForPublicPath,
  publicPathForLocale,
  publicRouteVariants,
  routeByPath,
} from "./public-routes";
import { PROTECTED_PREFIXES } from "./protected-prefixes";
import nextConfig, {
  LOCALIZED_SLUG_REDIRECTS,
  PRIMARY_HOST_PATTERN,
  PUBLIC_ROUTE_PATHS as CONFIG_PUBLIC_ROUTE_PATHS,
} from "../next.config.mjs";
import { isPrimaryHost } from "./public-hosts";
import { locales } from "@/i18n/config";

const REPO_ROOT = path.resolve(__dirname, "..");

describe("public routes table", () => {
  it("gives every page distinct explicit locale paths", () => {
    const paths = PUBLIC_ROUTES.flatMap((route) => [route.en, route.fr]);
    expect(new Set(paths).size).toBe(paths.length);
    const variants = PUBLIC_ROUTES.flatMap((route) =>
      publicRouteVariants(route).map(({ path }) => path),
    );
    expect(new Set(variants).size).toBe(variants.length);
    expect(PUBLIC_ROUTE_PATHS.size).toBe(variants.length);
  });

  it("puts every French path under /fr", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.fr === "/fr" || route.fr.startsWith("/fr/")).toBe(true);
    }
  });

  it("maps French paths back to their English original", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(englishPathForFrench(route.fr)).toBe(route.en);
      // An English URL is not a French URL: without it, `/pricing`
      // would be rewritten about itself by declaring itself French.
      expect(englishPathForFrench(route.en)).toBeNull();
    }
  });

  it("resolves both languages of a page to the same entry", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(routeByPath(route.en)?.key).toBe(route.key);
      expect(routeByPath(route.fr)?.key).toBe(route.key);
    }
    expect(routeByPath("/blog")).toBeNull();
  });

  it("publishes every public page in all six locales", () => {
    const home = PUBLIC_ROUTES.find((route) => route.key === "home")!;
    expect(publicRouteVariants(home)).toEqual([
      { locale: "fr", path: "/fr" },
      { locale: "en", path: "/" },
      { locale: "de", path: "/de" },
      { locale: "pt-BR", path: "/pt-br" },
      { locale: "it", path: "/it" },
      { locale: "es", path: "/es" },
    ]);

    for (const [locale, path] of [
      ["de", "/de"],
      ["pt-BR", "/pt-br"],
      ["it", "/it"],
      ["es", "/es"],
    ] as const) {
      expect(publicPathForLocale(home, locale)).toBe(path);
      expect(localeForPublicPath(path)).toBe(locale);
      expect(routeByPath(path)?.key).toBe("home");
    }

    for (const route of PUBLIC_ROUTES) {
      expect(publicRouteVariants(route)).toHaveLength(6);
    }

    const pricing = PUBLIC_ROUTES.find((route) => route.key === "pricing")!;
    expect(publicPathForLocale(pricing, "de")).toBe("/de/preise");
    expect(publicPathForLocale(pricing, "pt-BR")).toBe("/pt-br/precos");
    expect(publicPathForLocale(pricing, "it")).toBe("/it/prezzi");
    expect(publicPathForLocale(pricing, "es")).toBe("/es/precios");
  });
});

describe("protected prefixes", () => {
  /**
   * The proxy protects a BLACKLIST: everything that is not there falls into the
   * rendered Next (and therefore in 404 if there is no route). This is what makes
   * true 404s possible — but it means that an app route added tomorrow
   * would be public by default. This test is the safeguard.
   */
  it("covers every route folder of app/(app)", () => {
    const appDir = path.join(REPO_ROOT, "app", "(app)");
    const segments = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // `(…)` groups and `_…` private segments do not produce URLs.
      .filter((entry) => !entry.name.startsWith("(") && !entry.name.startsWith("_"),
      )
      .map((entry) => `/${entry.name}`);

    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(PROTECTED_PREFIXES).toContain(segment);
    }
  });

  it("never protects a public path", () => {
    for (const publicPath of PUBLIC_ROUTE_PATHS) {
      for (const prefix of PROTECTED_PREFIXES) {
        expect(
          publicPath === prefix || publicPath.startsWith(`${prefix}/`),
        ).toBe(false);
      }
    }
  });
});

describe("localized slug redirects in next.config.mjs", () => {
  /**
   * A `.mjs` cannot import the TypeScript table: the list of
   * redirects is copied there. This test is what prevents the two from diverging — adding a public page without its redirect causes it to fail.
   */
  it("redirects every English slug used under a locale prefix", () => {
    const home = PUBLIC_ROUTES.find((route) => route.en === "/")!;
    const expected = locales
      .filter((locale) => locale !== "en")
      .flatMap((locale) => {
        const prefix = publicPathForLocale(home, locale);
        return PUBLIC_ROUTES.filter((route) => route.en !== "/")
          .map((route) => ({
            source: `${prefix}${route.en}`,
            destination: publicPathForLocale(route, locale),
          }))
          .filter((rule) => rule.source !== rule.destination);
      });

    expect([...LOCALIZED_SLUG_REDIRECTS].sort(bySource)).toEqual(
      [...expected].sort(bySource),
    );
  });

  /** Same reason: the list is used to set the CDN cache header. */
  it("lists exactly the public URLs for the CDN cache header", () => {
    expect([...CONFIG_PUBLIC_ROUTE_PATHS].sort()).toEqual(
      [...PUBLIC_ROUTE_PATHS].sort(),
    );
  });
});

describe("CDN cache header vs custom domains", () => {
  /**
   * The `/` of a custom domain serves a feedback board, personalized
   * per cookie. It fell under the CDN cache header placed on `/` for the
   * landing, without `Vary`: the CDN could serve to a visitor the page of another
   * (MIN-337). The `has: host` condition is what breaks it — and it
   * doesn't appear anywhere in the types.
   */
  const cacheEntries = async () =>
    (await nextConfig.headers!()).filter((entry) =>
      entry.headers.some(
        (header) =>
          header.key === "Vercel-CDN-Cache-Control" &&
          header.value !== "no-store",
      ),
    );

  it("gates every public-cache header on a primary host", async () => {
    const entries = await cacheEntries();
    expect(entries.map((entry) => entry.source).sort()).toEqual(
      [...PUBLIC_ROUTE_PATHS].sort(),
    );
    for (const entry of entries) {
      expect(entry.has).toEqual([
        { type: "host", value: PRIMARY_HOST_PATTERN },
      ]);
    }
  });

  it("matches only hosts that serve minddy itself", () => {
    // Next compares the anchored value, on the host without port and in lowercase.
    const matches = (host: string) =>
      new RegExp(`^${PRIMARY_HOST_PATTERN}$`).test(host);

    for (const host of [
      "minddy.app",
      "www.minddy.app",
      "preview.minddy.app",
      "localhost",
    ]) {
      expect(matches(host)).toBe(true);
      expect(isPrimaryHost(host)).toBe(true);
    }
    // A client domain, and the dogfooding subdomain which IS a domain
    // client (allowed by ops): never shared cache.
    process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST = "feedback.minddy.app";
    try {
      for (const host of [
        "feedback.acme.com",
        "acme.com",
        "feedback.minddy.app",
      ]) {
        expect(matches(host)).toBe(false);
        expect(isPrimaryHost(host)).toBe(false);
      }
    } finally {
      delete process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST;
    }
  });

  it("keeps a self-hosted canonical hostname on the application route", () => {
    const previousAppUrl = process.env.MINDDY_PUBLIC_APP_URL;
    const previousAllowlist = process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST;
    process.env.MINDDY_PUBLIC_APP_URL = "https://tickets.example.test:8443";
    process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST =
      "tickets.example.test,feedback.example.test";
    try {
      expect(isPrimaryHost("tickets.example.test")).toBe(true);
      expect(isPrimaryHost("feedback.example.test")).toBe(false);
    } finally {
      if (previousAppUrl === undefined)
        delete process.env.MINDDY_PUBLIC_APP_URL;
      else process.env.MINDDY_PUBLIC_APP_URL = previousAppUrl;
      if (previousAllowlist === undefined)
        delete process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST;
      else process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST = previousAllowlist;
    }
  });
});

function bySource(a: { source: string }, b: { source: string }) {
  return a.source.localeCompare(b.source);
}
