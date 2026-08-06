import { describe, expect, it } from "vitest";

import { hasUrlScheme, normalizeWebUrl, withUrlScheme } from "./url-normalize";

/**
 * MIN-184 — personne ne tape `https://`. Un lien se colle ou se dicte, et le
 * refuser pour un schéma manquant, c'est faire faire à la main ce que la
 * machine sait compléter.
 *
 * Ce que ce test garde, c'est la ligne de partage. Elle n'est pas évidente :
 * `linear.app` n'a pas de schéma, `javascript:alert(1)` en a un, et
 * `exemple.com:8080` ressemble aux deux. Les départager sur la seule présence
 * d'un `:` — ce que faisait la première version — traitait le troisième comme
 * un protocole exotique et le refusait. Le critère qui tranche : un vrai schéma
 * ne contient jamais de point.
 */

describe("hasUrlScheme", () => {
  it.each(["https://x.com", "http://x.com", "javascript:alert(1)", "mailto:a@b.c"])(
    "voit un schéma dans %s",
    (value) => expect(hasUrlScheme(value)).toBe(true)
  );

  it.each([
    "linear.app",
    "www.exemple.fr/docs",
    "exemple.com:8080",
    "exemple.com:8080/a/b",
    "",
  ])("ne voit pas de schéma dans %s", (value) =>
    expect(hasUrlScheme(value)).toBe(false)
  );
});

describe("withUrlScheme", () => {
  it("préfixe https:// quand le schéma manque", () => {
    expect(withUrlScheme("linear.app")).toBe("https://linear.app");
    expect(withUrlScheme("  www.exemple.fr/docs  ")).toBe(
      "https://www.exemple.fr/docs"
    );
  });

  it("préfixe un hôte à port, qui n'est PAS un schéma", () => {
    expect(withUrlScheme("exemple.com:8080")).toBe("https://exemple.com:8080");
  });

  it("laisse intact ce qui porte déjà un schéma, même refusable", () => {
    expect(withUrlScheme("http://x.com")).toBe("http://x.com");
    expect(withUrlScheme("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});

describe("normalizeWebUrl — ce qui passe", () => {
  it.each([
    ["un domaine nu", "linear.app", "https://linear.app"],
    ["un www", "www.exemple.fr", "https://www.exemple.fr"],
    ["un domaine avec chemin", "exemple.fr/docs/x", "https://exemple.fr/docs/x"],
    ["un hôte à port", "exemple.com:8080/a", "https://exemple.com:8080/a"],
    ["un https explicite", "https://x.co/a?b=1#c", "https://x.co/a?b=1#c"],
    ["un http explicite", "http://x.co", "http://x.co"],
    ["des espaces autour", "  linear.app  ", "https://linear.app"],
    ["un sous-domaine profond", "a.b.c.exemple.fr", "https://a.b.c.exemple.fr"],
  ])("accepte %s", (_label, input, expected) => {
    expect(normalizeWebUrl(input)).toBe(expected);
  });
});

describe("normalizeWebUrl — ce qui est refusé", () => {
  it.each([
    ["le vide", ""],
    ["des espaces seuls", "   "],
    ["javascript:", "javascript:alert(document.cookie)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["file:", "file:///etc/passwd"],
    ["mailto:", "mailto:a@b.c"],
    ["un hôte sans point", "localhost"],
    ["localhost à port", "localhost:3000"],
    ["une phrase", "pas une url du tout"],
  ])("refuse %s", (_label, input) => {
    expect(normalizeWebUrl(input)).toBeNull();
  });
});
