import { describe, expect, it } from "vitest";
import {
  SIGNUP_STEPS,
  isValidEmail,
  nextSignupStep,
  preserveAuthParams,
  previousSignupStep,
  validateSignupStep,
  type SignupValues,
} from "@/lib/signup-wizard";

const EMPTY: SignupValues = {
  email: "",
  fullName: "",
  password: "",
  confirmPassword: "",
};

const values = (patch: Partial<SignupValues>): SignupValues => ({
  ...EMPTY,
  ...patch,
});

describe("isValidEmail", () => {
  it.each(["a@b.co", "  clement@minddy.app  ", "x+tag@mail.example.org"])(
    "accepte %s",
    (email) => expect(isValidEmail(email)).toBe(true)
  );

  it.each(["", "clement", "clement@", "@minddy.app", "a@b", "a@@b.co", "a b@c.co", "a@.co", "a@b."])(
    "refuse %s",
    (email) => expect(isValidEmail(email)).toBe(false)
  );
});

describe("validateSignupStep", () => {
  it("distingue l'adresse absente de l'adresse fautive", () => {
    expect(validateSignupStep("account", EMPTY)).toBe("emailRequired");
    expect(validateSignupStep("account", values({ email: "   " }))).toBe("emailRequired");
    expect(validateSignupStep("account", values({ email: "clement" }))).toBe("emailInvalid");
    expect(validateSignupStep("account", values({ email: "c@minddy.app" }))).toBeNull();
  });

  it("exige un nom qui ne soit pas que des espaces", () => {
    expect(validateSignupStep("identity", EMPTY)).toBe("nameRequired");
    expect(validateSignupStep("identity", values({ fullName: "   " }))).toBe("nameRequired");
    expect(validateSignupStep("identity", values({ fullName: "Clément" }))).toBeNull();
  });

  it("refuse un mot de passe qui ne tient pas la politique, AVANT de le comparer", () => {
    const weak = "abcdefgh";
    // Les deux champs concordent, et pourtant l'étape ne passe pas : il manque
    // une majuscule et un chiffre, et c'est ça qu'il faut dire — sinon le
    // serveur le dira, en anglais, après le clic.
    expect(validateSignupStep("password", values({ password: weak, confirmPassword: weak }))).toBe(
      "passwordPolicy"
    );
    const short = "Ab3defg";
    expect(validateSignupStep("password", values({ password: short, confirmPassword: short }))).toBe(
      "passwordPolicy"
    );
  });

  it("refuse deux mots de passe qui divergent", () => {
    expect(
      validateSignupStep(
        "password",
        values({ password: "Correct1horse", confirmPassword: "Correct1hors" })
      )
    ).toBe("passwordMismatch");
    expect(
      validateSignupStep(
        "password",
        values({ password: "Correct1horse", confirmPassword: "Correct1horse" })
      )
    ).toBeNull();
  });
});

describe("navigation entre étapes", () => {
  it("enchaîne compte → identité → mot de passe, et s'arrête là", () => {
    expect(SIGNUP_STEPS).toEqual(["account", "identity", "password"]);
    expect(nextSignupStep("account")).toBe("identity");
    expect(nextSignupStep("identity")).toBe("password");
    expect(nextSignupStep("password")).toBeNull();
    expect(previousSignupStep("password")).toBe("identity");
    expect(previousSignupStep("account")).toBeNull();
  });
});

describe("preserveAuthParams", () => {
  it("garde la destination et l'invitation, jette le reste", () => {
    const query = preserveAuthParams(
      "redirect=%2Fprojects%2F42&invite=tok3n&error=oauth_denied&mode=signup&utm_source=x"
    );
    const kept = new URLSearchParams(query);
    expect(kept.get("redirect")).toBe("/projects/42");
    expect(kept.get("invite")).toBe("tok3n");
    expect(kept.get("error")).toBeNull();
    expect(kept.get("mode")).toBeNull();
    expect(kept.get("utm_source")).toBeNull();
  });

  it("ne rend rien quand il n'y a rien à passer", () => {
    expect(preserveAuthParams("")).toBe("");
    expect(preserveAuthParams("error=oauth_failed")).toBe("");
  });

  it("accepte un ajout explicite — le `mode=signin` du retour vers /login", () => {
    const query = preserveAuthParams("redirect=%2Fhome", { mode: "signin" });
    const kept = new URLSearchParams(query);
    expect(query.startsWith("?")).toBe(true);
    expect(kept.get("mode")).toBe("signin");
    expect(kept.get("redirect")).toBe("/home");
  });

  it("lit aussi bien un URLSearchParams qu'une chaîne", () => {
    const params = new URLSearchParams({ invite: "tok3n" });
    expect(preserveAuthParams(params)).toBe("?invite=tok3n");
  });
});
