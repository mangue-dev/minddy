import { describe, expect, it } from "vitest";
import { authErrorKey, authErrorMessage } from "@/lib/auth-errors";

/** Un refus GoTrue tel qu'il arrive dans un `catch`. */
const authError = (code: string | undefined, message: string) =>
  Object.assign(new Error(message), code ? { code } : {});

describe("authErrorKey", () => {
  it("traduit par le code", () => {
    expect(
      authErrorKey(
        authError(
          "weak_password",
          "Password is known to be weak and easy to guess, please choose a different one."
        )
      )
    ).toBe("errorWeakPassword");
    expect(authErrorKey(authError("user_already_exists", "User already registered"))).toBe(
      "errorUserExists"
    );
    expect(authErrorKey(authError("over_email_send_rate_limit", "…"))).toBe(
      "errorRateLimited"
    );
  });

  it("retombe sur le message quand le code manque", () => {
    // Les versions plus anciennes de GoTrue ne posent pas de `code`.
    expect(
      authErrorKey(new Error("Password is known to be weak and easy to guess"))
    ).toBe("errorWeakPassword");
    expect(authErrorKey(new Error("User already registered"))).toBe("errorUserExists");
    expect(authErrorKey(new Error("Invalid login credentials"))).toBe(
      "errorInvalidCredentials"
    );
  });

  it("le code l'emporte sur le message", () => {
    expect(
      authErrorKey(authError("email_not_confirmed", "User already registered"))
    ).toBe("errorEmailNotConfirmed");
  });

  it("rend null sur ce qu'il ne connaît pas", () => {
    expect(authErrorKey(new Error("fetch failed"))).toBeNull();
    expect(authErrorKey(authError("some_new_code", "Something new"))).toBeNull();
    expect(authErrorKey(null)).toBeNull();
    expect(authErrorKey("boom")).toBeNull();
  });
});

describe("authErrorMessage", () => {
  const translate = (key: string) => `traduit:${key}`;

  it("traduit ce qu'il connaît", () => {
    expect(authErrorMessage(authError("weak_password", "…"), translate)).toBe(
      "traduit:errorWeakPassword"
    );
  });

  it("ne montre jamais un message qui ne dit rien — le « {} » observé en vrai", () => {
    // supabase-js recopie `msg` du corps de la réponse ; sans lui, il stringifie
    // le corps. Une réponse d'erreur au corps vide donnait donc « {} » sous le
    // formulaire d'inscription.
    expect(authErrorMessage(new Error("{}"), translate)).toBe("traduit:errorUnexpected");
    expect(authErrorMessage(new Error("   "), translate)).toBe("traduit:errorUnexpected");
    expect(authErrorMessage(new Error('{"":""}'), translate)).toBe("traduit:errorUnexpected");
  });

  it("garde le message d'origine sur un refus inconnu", () => {
    // Une phrase anglaise EXACTE vaut mieux qu'une phrase française inventée :
    // le trou reste visible, donc comblable.
    expect(authErrorMessage(new Error("Database error saving new user"), translate)).toBe(
      "Database error saving new user"
    );
  });

  it("dit toujours quelque chose, même sans erreur exploitable", () => {
    expect(authErrorMessage({}, translate)).toBe("traduit:errorUnexpected");
    expect(authErrorMessage(undefined, translate)).toBe("traduit:errorUnexpected");
  });
});
