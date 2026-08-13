import { describe, expect, it } from "vitest";
import { navigationDecision } from "./nav-guard";

const ORIGIN = "https://www.minddy.app";

describe("navigationDecision", () => {
  it("laisse naviguer dans notre origine", () => {
    expect(navigationDecision(`${ORIGIN}/home`, ORIGIN)).toBe("allow");
    expect(navigationDecision(`${ORIGIN}/projects/x?issue=y#z`, ORIGIN)).toBe(
      "allow"
    );
  });

  it("sort tout ce qui n'est pas notre origine, sous-domaine compris", () => {
    expect(navigationDecision("https://github.com/x", ORIGIN)).toBe("external");
    expect(navigationDecision("https://minddy.app/", ORIGIN)).toBe("external");
    expect(navigationDecision("https://docs.minddy.app/", ORIGIN)).toBe("external");
    expect(navigationDecision("mailto:hello@minddy.app", ORIGIN)).toBe("external");
  });

  it("sort aussi le même hôte en clair — l'origine, pas l'hôte", () => {
    expect(navigationDecision("http://www.minddy.app/home", ORIGIN)).toBe(
      "external"
    );
  });

  it("bloque ce qui ne doit ni s'ouvrir ici ni partir au système", () => {
    expect(navigationDecision("file:///etc/passwd", ORIGIN)).toBe("block");
    expect(navigationDecision("javascript:alert(1)", ORIGIN)).toBe("block");
    expect(navigationDecision("data:text/html,<h1>x", ORIGIN)).toBe("block");
    // Notre propre schéma : il se traite par `open-url`, pas par une navigation.
    expect(navigationDecision("minddy://auth?code=abc", ORIGIN)).toBe("block");
  });

  it("bloque une URL illisible, des deux côtés", () => {
    expect(navigationDecision("pas une url", ORIGIN)).toBe("block");
    expect(navigationDecision(`${ORIGIN}/home`, "pas une origine")).toBe("block");
  });

  it("suit l'origine qu'on lui donne (dev sur localhost)", () => {
    const dev = "http://localhost:3000";
    expect(navigationDecision("http://localhost:3000/home", dev)).toBe("allow");
    expect(navigationDecision("http://localhost:3001/home", dev)).toBe("external");
    expect(navigationDecision(`${ORIGIN}/home`, dev)).toBe("external");
  });
});
