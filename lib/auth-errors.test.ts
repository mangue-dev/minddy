import { describe, expect, it } from "vitest";
import { authErrorKey, authErrorMessage } from "@/lib/auth-errors";

/** A GoTrue denial as it happens in a `catch`. */
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

  it("falls back to the message when the code is missing", () => {
    // Older versions of GoTrue do not set `code`.
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

  it("returns null for what it does not know", () => {
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

  it("never shows a message that says nothing — the « {} » seen in reality", () => {
    // supabase-js copies `msg` from the response body; without it, it stringifies
    // the body. An error response to the empty body therefore gave “{}” under the
    // formulaire d'inscription.
    expect(authErrorMessage(new Error("{}"), translate)).toBe("traduit:errorUnexpected");
    expect(authErrorMessage(new Error("   "), translate)).toBe("traduit:errorUnexpected");
    expect(authErrorMessage(new Error('{"":""}'), translate)).toBe("traduit:errorUnexpected");
  });

  it("garde le message d'origine sur un refus inconnu", () => {
    // An EXACT English sentence is better than an invented French sentence:
    // the hole remains visible, therefore fillable.
    expect(authErrorMessage(new Error("Database error saving new user"), translate)).toBe(
      "Database error saving new user"
    );
  });

  it("always says something, even without a usable error", () => {
    expect(authErrorMessage({}, translate)).toBe("traduit:errorUnexpected");
    expect(authErrorMessage(undefined, translate)).toBe("traduit:errorUnexpected");
  });
});
