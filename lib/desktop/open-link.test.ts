import { describe, expect, it } from "vitest";
import { buildDesktopOpenUrl, parseDesktopOpenLink } from "./open-link";
import { billingReturnUrl } from "./return-url";
import { parseDesktopAuthLink } from "./auth-link";

/** L'aller-retour complet : ce que la page de rebond émet, ce que l'app relit. */
function roundTrip(next: string): string | null {
  return parseDesktopOpenLink(buildDesktopOpenUrl(next));
}

describe("buildDesktopOpenUrl", () => {
  it("émet notre schéma sur l'hôte `open`", () => {
    expect(buildDesktopOpenUrl("/billing")).toBe("minddy://open?next=%2Fbilling");
  });

  it("garde la query de la destination — c'est elle qui dit le résultat", () => {
    expect(roundTrip("/billing?billing=success")).toBe("/billing?billing=success");
  });

  it("réduit une destination externe au repli interne", () => {
    // macOS livre à l'app TOUT ce qui porte notre schéma, y compris ce qu'on
    // n'a jamais émis : une destination absolue serait une fenêtre qu'un tiers
    // pointe où il veut.
    expect(roundTrip("https://evil.example/x")).toBe("/home");
    expect(roundTrip("//evil.example")).toBe("/home");
  });
});

describe("parseDesktopOpenLink", () => {
  it("accepte la forme sans double barre oblique", () => {
    expect(parseDesktopOpenLink("minddy:open?next=%2Fbilling")).toBe("/billing");
  });

  it("refuse un autre schéma, un autre hôte, un lien sans destination", () => {
    expect(parseDesktopOpenLink("https://www.minddy.app/open?next=/billing")).toBeNull();
    expect(parseDesktopOpenLink("minddy://auth?code=abc")).toBeNull();
    expect(parseDesktopOpenLink("minddy://open")).toBeNull();
    expect(parseDesktopOpenLink("")).toBeNull();
  });

  it("ne se marche pas sur les pieds avec le lien d'authentification", () => {
    // Les deux lecteurs se croisent dans `receiveDeepLink` : chacun doit rendre
    // `null` sur l'hôte de l'autre, sans quoi le premier consulté avale tout.
    expect(parseDesktopAuthLink(buildDesktopOpenUrl("/billing"))).toBeNull();
  });
});

describe("billingReturnUrl", () => {
  const ORIGIN = "https://www.minddy.app";

  it("depuis le web : la page elle-même", () => {
    expect(billingReturnUrl(ORIGIN, "/billing?billing=success", false)).toBe(
      "https://www.minddy.app/billing?billing=success"
    );
  });

  it("depuis l'app : la page de rebond, qui rouvre l'app dessus", () => {
    const url = billingReturnUrl(ORIGIN, "/billing?billing=success", true);
    expect(url).toBe(
      "https://www.minddy.app/desktop/return?next=%2Fbilling%3Fbilling%3Dsuccess"
    );
    // Stripe n'accepte que du http(s) : le rebond doit rester une vraie URL.
    expect(new URL(url).protocol).toBe("https:");
    // Et ce que cette page-là émettra doit ramener à la bonne destination.
    const next = new URL(url).searchParams.get("next");
    expect(roundTrip(next ?? "")).toBe("/billing?billing=success");
  });
});
