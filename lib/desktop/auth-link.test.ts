import { describe, expect, it } from "vitest";
import {
  buildDesktopAuthUrl,
  desktopAuthLinkFromCallback,
  parseDesktopAuthLink,
  type DesktopAuthLink,
} from "./auth-link";

/** L'aller-retour complet : ce que le serveur émet, ce que l'app relit. */
function roundTrip(link: DesktopAuthLink): DesktopAuthLink | null {
  return parseDesktopAuthLink(buildDesktopAuthUrl(link));
}

describe("desktopAuthLinkFromCallback", () => {
  it("transmet le code OAuth sans l'échanger", () => {
    const link = desktopAuthLinkFromCallback(new URLSearchParams("code=abc123"));
    expect(link).toEqual({ kind: "code", code: "abc123", next: "/home" });
  });

  it("porte la destination d'après connexion", () => {
    const link = desktopAuthLinkFromCallback(
      new URLSearchParams("code=abc&next=%2Finbox")
    );
    expect(link).toEqual({ kind: "code", code: "abc", next: "/inbox" });
  });

  it("ramène une destination échappatoire à /home", () => {
    const link = desktopAuthLinkFromCallback(
      new URLSearchParams("code=abc&next=https%3A%2F%2Fevil.test")
    );
    expect(link).toEqual({ kind: "code", code: "abc", next: "/home" });
  });

  it("transmet le token d'un lien mail INTACT, avec son type", () => {
    const link = desktopAuthLinkFromCallback(
      new URLSearchParams("token_hash=tok&type=magiclink")
    );
    expect(link).toEqual({
      kind: "otp",
      tokenHash: "tok",
      type: "magiclink",
      next: "/home",
    });
  });

  it("refuse un type d'OTP inconnu", () => {
    const link = desktopAuthLinkFromCallback(
      new URLSearchParams("token_hash=tok&type=inventé")
    );
    expect(link).toEqual({
      kind: "error",
      error: "auth_callback_failed",
      reason: "missing_params",
    });
  });

  it("distingue le refus de consentement de la panne", () => {
    expect(
      desktopAuthLinkFromCallback(new URLSearchParams("error=access_denied"))
    ).toEqual({ kind: "error", error: "oauth_denied", reason: "access_denied" });
    expect(
      desktopAuthLinkFromCallback(new URLSearchParams("error=server_error"))
    ).toEqual({ kind: "error", error: "oauth_failed", reason: "server_error" });
  });

  it("l'erreur du provider passe AVANT tout le reste", () => {
    const link = desktopAuthLinkFromCallback(
      new URLSearchParams("error=access_denied&code=abc")
    );
    expect(link.kind).toBe("error");
  });

  it("ne laisse pas l'app attendre quand la query ne porte rien", () => {
    expect(desktopAuthLinkFromCallback(new URLSearchParams())).toEqual({
      kind: "error",
      error: "auth_callback_failed",
      reason: "missing_params",
    });
  });
});

describe("aller-retour serveur → app", () => {
  it("conserve un code et sa destination", () => {
    const link: DesktopAuthLink = { kind: "code", code: "a b+c", next: "/inbox" };
    expect(roundTrip(link)).toEqual(link);
  });

  it("conserve un OTP", () => {
    const link: DesktopAuthLink = {
      kind: "otp",
      tokenHash: "tok",
      type: "signup",
      next: "/home",
    };
    expect(roundTrip(link)).toEqual(link);
  });

  it("conserve une erreur", () => {
    const link: DesktopAuthLink = {
      kind: "error",
      error: "oauth_denied",
      reason: "access_denied",
    };
    expect(roundTrip(link)).toEqual(link);
  });

  it("émet bien notre schéma", () => {
    expect(
      buildDesktopAuthUrl({ kind: "code", code: "abc", next: "/home" })
    ).toBe("minddy://auth?code=abc");
  });
});

describe("parseDesktopAuthLink", () => {
  it("accepte la forme sans double barre oblique", () => {
    expect(parseDesktopAuthLink("minddy:auth?code=abc")).toEqual({
      kind: "code",
      code: "abc",
      next: "/home",
    });
  });

  it("refuse un autre schéma", () => {
    expect(parseDesktopAuthLink("https://www.minddy.app/auth?code=abc")).toBeNull();
  });

  it("refuse un autre hôte de notre schéma", () => {
    expect(parseDesktopAuthLink("minddy://run?code=abc")).toBeNull();
  });

  it("refuse un lien vide et une URL illisible", () => {
    expect(parseDesktopAuthLink("minddy://auth")).toBeNull();
    expect(parseDesktopAuthLink("")).toBeNull();
  });
});
