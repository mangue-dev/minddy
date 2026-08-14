import { describe, expect, it } from "vitest";
import { resolveInterfaceLocale } from "./interface-locale";

describe("resolveInterfaceLocale", () => {
  it("prend le cookie quand il en existe un", () => {
    expect(
      resolveInterfaceLocale({
        cookieHeader: "theme=dark; NEXT_LOCALE=fr; sb-x=y",
        languages: ["en-US", "en"],
      })
    ).toBe("fr");
  });

  it("ignore un cookie qui n'est pas une langue supportée", () => {
    expect(
      resolveInterfaceLocale({
        cookieHeader: "NEXT_LOCALE=de",
        languages: ["fr-FR"],
      })
    ).toBe("fr");
  });

  // Le cas de l'inscription : le cookie n'est écrit QUE par les sélecteurs de
  // langue, donc quelqu'un qui n'en a jamais changé n'en a pas — alors qu'il a
  // bien vu l'app en français.
  it("retombe sur la langue du navigateur, pas sur l'anglais", () => {
    expect(
      resolveInterfaceLocale({
        cookieHeader: "",
        languages: ["fr-FR", "fr", "en-US"],
      })
    ).toBe("fr");
  });

  it("rend l'anglais quand rien ne dit la langue", () => {
    expect(resolveInterfaceLocale({ cookieHeader: "", languages: [] })).toBe("en");
    expect(
      resolveInterfaceLocale({ cookieHeader: "", languages: ["de-DE", "es"] })
    ).toBe("en");
  });

  it("ne confond pas un cookie dont le nom finit par NEXT_LOCALE", () => {
    expect(
      resolveInterfaceLocale({
        cookieHeader: "MY_NEXT_LOCALE=fr",
        languages: ["en"],
      })
    ).toBe("en");
  });
});
