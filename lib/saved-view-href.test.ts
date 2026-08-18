import { describe, expect, it } from "vitest";
import {
  buildViewHref,
  isSavedViewHref,
  normalizeViewName,
  MAX_HREF_LENGTH,
  MAX_VIEW_NAME_LENGTH,
} from "./saved-view-href";

/**
 * The address of a saved view. Everything depends on what we KEEP and what we
 * REMOVE: a saved view retains the screen, not the dialog box placed
 * in front, and especially not an address that would leave the site.
 */

describe("buildViewHref", () => {
  it("garde la route nue quand il n'y a pas de query", () => {
    expect(buildViewHref("/projects/p1", "")).toBe("/projects/p1");
    expect(buildViewHref("/home", "?")).toBe("/home");
  });

  it("garde ce qui décrit l'écran : onglet, vue, objectif ouvert", () => {
    expect(buildViewHref("/routines", "?routine=r1")).toBe(
      "/routines?routine=r1"
    );
    expect(buildViewHref("/all", "?view=cycle")).toBe("/all?view=cycle");
    expect(
      buildViewHref("/projects/p1/objectives", "?open=o1")
    ).toBe("/projects/p1/objectives?open=o1");
    expect(buildViewHref("/settings", "?tab=notifications")).toBe(
      "/settings?tab=notifications"
    );
  });

  it("retire le panneau latéral d'un ticket : c'est une surimpression", () => {
    expect(buildViewHref("/projects/p1", "?issue=i1")).toBe("/projects/p1");
    // …sans emporter ce qui l'entoure.
    expect(buildViewHref("/projects/p1", "?view=v1&issue=i1")).toBe(
      "/projects/p1?view=v1"
    );
  });

  it("retire les dialogues et les instructions à usage unique", () => {
    expect(buildViewHref("/projects/p1", "?new=issue")).toBe("/projects/p1");
    expect(buildViewHref("/projects/p1", "?setup=import")).toBe("/projects/p1");
    expect(buildViewHref("/agents", "?compose=new")).toBe("/agents");
    expect(buildViewHref("/billing", "?billing=success")).toBe("/billing");
  });

  it("accepte la query avec ou sans son point d'interrogation", () => {
    expect(buildViewHref("/all", "view=v1")).toBe("/all?view=v1");
    expect(buildViewHref("/all", "?view=v1")).toBe("/all?view=v1");
  });

  it("ajoute ce que la page publie, et `null` retire", () => {
    expect(buildViewHref("/projects/p1", "?objective=o1", { view: "v2" })).toBe(
      "/projects/p1?objective=o1&view=v2"
    );
    // The page overwrites the parameter already there rather than adding a second one.
    expect(buildViewHref("/all", "?view=v1", { view: "cycle" })).toBe(
      "/all?view=cycle"
    );
    // No selection → no parameter (and not an empty `?open=`).
    expect(
      buildViewHref("/projects/p1/objectives", "?open=o1", { open: null })
    ).toBe("/projects/p1/objectives");
    expect(buildViewHref("/pull-requests", "", { pr: "" })).toBe("/pull-requests");
  });

  it("encode les valeurs publiées", () => {
    expect(buildViewHref("/agents", "", { run: "a b&c" })).toBe(
      "/agents?run=a+b%26c"
    );
  });
});

describe("isSavedViewHref", () => {
  it("accepte une adresse interne", () => {
    expect(isSavedViewHref("/")).toBe(true);
    expect(isSavedViewHref("/projects/p1?view=v1")).toBe(true);
  });

  it("refuse tout ce qui sort du site", () => {
    // Protocol-relative: absolute path for URL grammar, other site
    // for a browser.
    expect(isSavedViewHref("//evil.example/x")).toBe(false);
    expect(isSavedViewHref("https://evil.example")).toBe(false);
    expect(isSavedViewHref("javascript:alert(1)")).toBe(false);
    // Backslash read as a bar by some browsers.
    expect(isSavedViewHref("/\\evil.example")).toBe(false);
    expect(isSavedViewHref("projects/p1")).toBe(false);
  });

  it("refuse ce qui n'est pas une chaîne, le vide, et le trop long", () => {
    expect(isSavedViewHref(null)).toBe(false);
    expect(isSavedViewHref(42)).toBe(false);
    expect(isSavedViewHref("")).toBe(false);
    expect(isSavedViewHref(`/${"x".repeat(MAX_HREF_LENGTH)}`)).toBe(false);
  });

  it("refuse espaces et caractères de contrôle", () => {
    expect(isSavedViewHref("/projects/p 1")).toBe(false);
    expect(isSavedViewHref("/projects\nGET /admin")).toBe(false);
  });
});

describe("normalizeViewName", () => {
  it("rogne et normalise les espaces", () => {
    expect(normalizeViewName("  Ma semaine  ")).toBe("Ma semaine");
    expect(normalizeViewName("Ma   semaine")).toBe("Ma semaine");
  });

  it("rend null sur un nom vide — l'appelant en fait « nom requis »", () => {
    expect(normalizeViewName("")).toBe(null);
    expect(normalizeViewName("   ")).toBe(null);
    expect(normalizeViewName(undefined)).toBe(null);
    expect(normalizeViewName(12)).toBe(null);
  });

  it("borne la longueur", () => {
    const long = "a".repeat(MAX_VIEW_NAME_LENGTH + 50);
    expect(normalizeViewName(long)).toHaveLength(MAX_VIEW_NAME_LENGTH);
  });
});
