import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_PATHS } from "@/lib/public-routes";
import { leavesTheWindow, routeDisposition } from "./window-routes";

describe("routeDisposition", () => {
  it("laisse l'app et l'authentification — c'est tout ce que la fenêtre montre", () => {
    for (const path of [
      "/home",
      "/login",
      "/signup",
      "/inbox",
      "/projects/abc",
      "/settings/account",
      "/auth/callback",
      "/agents",
    ]) {
      expect(routeDisposition(path), path).toBe("allow");
    }
  });

  it("routes LANDING to the entry point and nothing else", () => {
    expect(routeDisposition("/")).toBe("home");
    expect(routeDisposition("/fr")).toBe("home");
    // We come across a logo: launching a browser with each click would be a
    // punishment. All other public pages go outside.
    expect(routeDisposition("/pricing")).toBe("external");
  });

  it("sends every other public page OUTSIDE in both languages", () => {
    for (const path of [
      "/pricing",
      "/fr/tarifs",
      "/mcp",
      "/fr/mcp",
      "/changelog",
      "/fr/nouveautes",
      "/download",
      "/fr/telecharger",
      "/alternatives/linear",
      "/legal",
      "/fr/mentions-legales",
      "/terms",
      "/fr/cgu",
      "/privacy",
      "/cookies",
    ]) {
      expect(routeDisposition(path), path).toBe("external");
    }
  });

  /**
 * The case that motivated the change: it was enough to paste the link of a
 * board to open the public site IN the app. These URLs are not pages
 * but authorizations, therefore absent from `PUBLIC_ROUTES`: they are recognized by their prefix or not at all.
 */
  it("sends tokenized public surfaces outside", () => {
    expect(routeDisposition("/f/abc123")).toBe("external");
    expect(routeDisposition("/f/abc123/roadmap")).toBe("external");
    expect(routeDisposition("/p/xyz")).toBe("external");
    expect(routeDisposition("/share/tok")).toBe("external");
  });

  it("does not confuse a prefix with a word boundary", () => {
    // `/feedback` is an INTERNAL route (it sets a JWT and redirects to the
    // board): it's her redirection that goes outside, not her.
    expect(routeDisposition("/feedback")).toBe("allow");
    expect(routeDisposition("/pages")).toBe("allow");
    expect(routeDisposition("/shared-thing")).toBe("allow");
  });

  it("accepts a full URL as a path, with query and trailing slash", () => {
    expect(routeDisposition("https://www.minddy.app/fr")).toBe("home");
    expect(routeDisposition("https://www.minddy.app/pricing?utm=x")).toBe("external");
    expect(routeDisposition("/pricing/")).toBe("external");
    expect(routeDisposition("http://localhost:3000/")).toBe("home");
    expect(routeDisposition("https://www.minddy.app/home")).toBe("allow");
  });

  it("laisse passer ce qu'il n'a pas su lire — la garde d'origine a déjà tranché", () => {
    expect(routeDisposition("pas une url")).toBe("allow");
  });

  /**
 * The contract with `public-routes.ts`: one more public page must pop
 * out of the window without anyone thinking about it. This test fails the day
 * someone adds a route without the bypass routing it.
 */
  it("couvre TOUTE page publique de la table, sans recopie", () => {
    for (const path of PUBLIC_ROUTE_PATHS) {
      expect(leavesTheWindow(path), path).toBe(true);
    }
  });
});
