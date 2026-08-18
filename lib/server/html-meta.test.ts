import { describe, expect, it } from "vitest";

import { extractMetaContent, extractTitleText, parseAttributes, scanTags } from "./html-meta";

/**
 * MIN-336 — this module reads HTML provided by a user. Two things to hold, and the second is the one that missed:
 *
 * 1. Correctly read a regular `<head>` *.
 * 2. **Don't explode on a chosen entry to make it explode.** The
 * three entries measured here cost 66 s, 25 s and 21 s event loop aux
 * regex from before — a denial of service on the entire instance, triggered by a single
 * pasted link. The MEASUREMENT test; it doesn't assume.
 */

/** Wide: on a loaded machine the threshold must not become unstable. This
 that we want to prove is not “it's fast” but “it's no longer quadratic” —
 the same entries took tens of SECONDS. */
const BUDGET_MS = 1_000;

function millis(work: () => void): number {
  const started = performance.now();
  work();
  return performance.now() - started;
}

describe("scanTags", () => {
  it("rend le contenu de chaque balise du nom demandé", () => {
    const tags = [...scanTags('<link rel="icon" href="/a.png"><LINK rel="x">', "link")];
    expect(tags).toEqual([' rel="icon" href="/a.png"', ' rel="x"']);
  });

  it("ne confond pas `<linkedin>` avec `<link>`", () => {
    expect([...scanTags("<linkedin href='/a'>", "link")]).toEqual([]);
  });

  it("s'arrête à la première balise jamais fermée", () => {
    expect([...scanTags("<link rel='icon' href='/a'><link rel='icon'", "link")]).toHaveLength(1);
  });
});

describe("parseAttributes", () => {
  it("lit les valeurs entre doubles, simples, ou nues", () => {
    const attributes = parseAttributes(` rel="icon" sizes='32x32' href=/a.png disabled`);
    expect(Object.fromEntries(attributes)).toEqual({
      rel: "icon",
      sizes: "32x32",
      href: "/a.png",
      disabled: "",
    });
  });

  it("garde la première occurrence d'un attribut répété", () => {
    expect(parseAttributes(` href="/un" href="/deux"`).get("href")).toBe("/un");
  });

  it("supporte un guillemet jamais refermé", () => {
    expect(parseAttributes(` href="/jamais-ferme`).get("href")).toBe("/jamais-ferme");
  });
});

describe("extractTitleText / extractMetaContent", () => {
  it("prend le texte du premier <title>", () => {
    expect(extractTitleText("<head><title>Le titre</title></head>")).toBe("Le titre");
  });

  it("ignore une balise qui commence par title sans en être une", () => {
    expect(extractTitleText("<titlebar>x</titlebar><title>Vrai</title>")).toBe("Vrai");
  });

  it("tolère un <title> jamais refermé", () => {
    expect(extractTitleText("<title>coupé au milieu")).toBe("coupé au milieu");
  });

  it("lit og:title, que la balise dise property ou name", () => {
    expect(extractMetaContent('<meta property="og:title" content="A">', "og:title")).toBe("A");
    expect(extractMetaContent("<meta name='og:title' content='B'>", "og:title")).toBe("B");
  });

  it("rend null quand la propriété n'est pas là", () => {
    expect(extractMetaContent('<meta property="og:image" content="A">', "og:title")).toBeNull();
  });
});

describe("entrées pathologiques — le temps, mesuré", () => {
  it("1 Mo de `<link` sans le moindre `>`", () => {
    const html = "<link ".repeat(175_000); // ~1 Mo
    expect(millis(() => void [...scanTags(html, "link")])).toBeLessThan(BUDGET_MS);
  });

  it("52 Ko de `<meta` ouvert — l'entrée cubique d'og:title", () => {
    const html = `<meta ${"property=x ".repeat(5_000)}`;
    expect(millis(() => void extractMetaContent(html, "og:title"))).toBeLessThan(BUDGET_MS);
  });

  it("1 Mo de `<title` sans fermeture", () => {
    const html = "<title ".repeat(150_000);
    expect(millis(() => void extractTitleText(html))).toBeLessThan(BUDGET_MS);
  });

  it("1 Mo d'attributs dans une seule balise", () => {
    const html = `<link ${"a=1 ".repeat(250_000)}>`;
    expect(millis(() => void [...scanTags(html, "link")])).toBeLessThan(BUDGET_MS);
  });
});
