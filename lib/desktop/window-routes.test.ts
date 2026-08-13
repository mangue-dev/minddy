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

  it("ramène la LANDING à l'entrée, et elle seule", () => {
    expect(routeDisposition("/")).toBe("home");
    expect(routeDisposition("/fr")).toBe("home");
    // On y tombe par un logo : lancer un navigateur à chaque clic serait un
    // châtiment. Toutes les autres pages publiques, elles, partent dehors.
    expect(routeDisposition("/pricing")).toBe("external");
  });

  it("envoie DEHORS toute autre page publique, dans les deux langues", () => {
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
   * Le cas qui a motivé le changement : il suffisait de coller le lien d'un
   * board pour ouvrir le site public DANS l'app. Ces URLs ne sont pas des pages
   * mais des autorisations, donc absentes de `PUBLIC_ROUTES` : elles se
   * reconnaissent à leur préfixe ou pas du tout.
   */
  it("envoie dehors les surfaces publiques à jeton", () => {
    expect(routeDisposition("/f/abc123")).toBe("external");
    expect(routeDisposition("/f/abc123/roadmap")).toBe("external");
    expect(routeDisposition("/p/xyz")).toBe("external");
    expect(routeDisposition("/share/tok")).toBe("external");
  });

  it("ne confond pas un préfixe avec un début de mot", () => {
    // `/feedback` est une route INTERNE (elle pose un JWT et redirige vers le
    // board) : c'est sa redirection qui part dehors, pas elle.
    expect(routeDisposition("/feedback")).toBe("allow");
    expect(routeDisposition("/pages")).toBe("allow");
    expect(routeDisposition("/shared-thing")).toBe("allow");
  });

  it("accepte une URL complète comme un chemin, avec query et barre finale", () => {
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
   * Le contrat avec `public-routes.ts` : une page publique de plus doit sortir
   * de la fenêtre sans que personne n'y pense. Ce test échoue le jour où
   * quelqu'un ajoute une route sans que la dérivation la voie.
   */
  it("couvre TOUTE page publique de la table, sans recopie", () => {
    for (const path of PUBLIC_ROUTE_PATHS) {
      expect(leavesTheWindow(path), path).toBe(true);
    }
  });
});
