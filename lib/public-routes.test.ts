import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTES,
  PUBLIC_ROUTE_PATHS,
  englishPathForFrench,
  routeByPath,
} from "./public-routes";
import { PROTECTED_PREFIXES } from "./protected-prefixes";
import {
  FRENCH_SLUG_REDIRECTS,
  PUBLIC_ROUTE_PATHS as CONFIG_PUBLIC_ROUTE_PATHS,
} from "../next.config.mjs";

const REPO_ROOT = path.resolve(__dirname, "..");

describe("public routes table", () => {
  it("gives every page a distinct English and French path", () => {
    const paths = PUBLIC_ROUTES.flatMap((route) => [route.en, route.fr]);
    expect(new Set(paths).size).toBe(paths.length);
    expect(PUBLIC_ROUTE_PATHS.size).toBe(paths.length);
  });

  it("puts every French path under /fr", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.fr === "/fr" || route.fr.startsWith("/fr/")).toBe(true);
    }
  });

  it("maps French paths back to their English original", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(englishPathForFrench(route.fr)).toBe(route.en);
      // Une URL anglaise n'est pas une URL française : sans ça, `/pricing`
      // serait réécrite sur elle-même en se déclarant française.
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
});

describe("protected prefixes", () => {
  /**
   * Le proxy protège une LISTE NOIRE : tout ce qui n'y est pas tombe dans le
   * rendu Next (et donc en 404 s'il n'y a pas de route). C'est ce qui rend les
   * vrais 404 possibles — mais ça veut dire qu'une route d'app ajoutée demain
   * serait publique par défaut. Ce test est le garde-fou.
   */
  it("covers every route folder of app/(app)", () => {
    const appDir = path.join(REPO_ROOT, "app", "(app)");
    const segments = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Les groupes `(…)` et les segments privés `_…` ne produisent pas d'URL.
      .filter((entry) => !entry.name.startsWith("(") && !entry.name.startsWith("_"))
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

describe("French slug redirects in next.config.mjs", () => {
  /**
   * Un `.mjs` ne peut pas importer la table TypeScript : la liste de
   * redirections y est recopiée. Ce test est ce qui empêche les deux de
   * diverger — ajouter une page publique sans sa redirection le fait échouer.
   */
  it("redirects every English slug used under /fr to its translated slug", () => {
    const expected = PUBLIC_ROUTES
      // La landing n'a pas de slug : `/fr` EST son URL française.
      .filter((route) => route.en !== "/" && route.fr !== `/fr${route.en}`)
      .map((route) => ({ source: `/fr${route.en}`, destination: route.fr }));

    expect([...FRENCH_SLUG_REDIRECTS].sort(bySource)).toEqual(
      [...expected].sort(bySource),
    );
  });

  /** Même raison : la liste sert à poser l'en-tête de cache CDN. */
  it("lists exactly the twelve public URLs for the CDN cache header", () => {
    expect([...CONFIG_PUBLIC_ROUTE_PATHS].sort()).toEqual(
      [...PUBLIC_ROUTE_PATHS].sort(),
    );
  });
});

function bySource(a: { source: string }, b: { source: string }) {
  return a.source.localeCompare(b.source);
}
