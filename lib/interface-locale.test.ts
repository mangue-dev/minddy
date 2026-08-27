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

  it("uses a supported locale cookie before browser preferences", () => {
    expect(
      resolveInterfaceLocale({
        cookieHeader: "NEXT_LOCALE=de",
        languages: ["fr-FR"],
      })
    ).toBe("de");
  });

  // The case of registration: the cookie is ONLY written by the selectors of
  // language, so someone who has never changed it does not have one — even though he has
  // well seen the app in French.
  it("falls back to the browser language, not English", () => {
    expect(
      resolveInterfaceLocale({
        cookieHeader: "",
        languages: ["fr-FR", "fr", "en-US"],
      })
    ).toBe("fr");
  });

  it("uses English only when no supported language is available", () => {
    expect(resolveInterfaceLocale({ cookieHeader: "", languages: [] })).toBe("en");
    expect(
      resolveInterfaceLocale({ cookieHeader: "", languages: ["de-DE", "es"] })
    ).toBe(
      "de",
    );
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
