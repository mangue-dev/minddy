import { describe, expect, it } from "vitest";

import { buildIntegrationPrompt } from "./integration-prompt";
import { SSO_ENV_VAR } from "@/lib/feedback/env-lines";
import { INTEGRATION_ENV_VAR } from "@/lib/feedback/integration-contract";

/**
 * What these tests keep is the REASON for the two destinations of the
 * prompt: it can go to Numo because it does not carry any credential — the
 * SSO secret and the API key are only named by their environment variable
 *. The day we reconnect a secret in one of these texts,
 * “entrust to Numo” becomes a sending of credential in an agent conversation
 *, without anything signaling it. Hence the verification by the type (the
 * builder no longer accepts either secret or key) AND by these assertions.
 */

const BASE = {
  locale: "fr" as const,
  projectName: "Acme",
  placement: "Dans le menu utilisateur",
  origin: "https://www.minddy.app",
};

/** The prefixes that minddy's credentials carry, all paths combined. */
const CREDENTIAL_PREFIXES = ["fbsso_", "mdyk_"];

describe("prompt d'intégration — board public", () => {
  for (const locale of ["fr", "en"] as const) {
    it(`nomme la variable d'environnement au lieu du secret (${locale})`, () => {
      const prompt = buildIntegrationPrompt({
        ...BASE,
        locale,
        mode: "board",
        boardUrl: "https://www.minddy.app/f/tok",
        sso: true,
      });
      expect(prompt).toContain(SSO_ENV_VAR);
      for (const prefix of CREDENTIAL_PREFIXES) expect(prompt).not.toContain(prefix);
      expect(prompt).toContain("https://www.minddy.app/f/tok");
    });
  }

  it("sans SSO, ne parle ni de JWT ni de variable d'environnement", () => {
    const prompt = buildIntegrationPrompt({
      ...BASE,
      mode: "board",
      boardUrl: "https://www.minddy.app/f/tok",
      sso: false,
    });
    expect(prompt).not.toContain(SSO_ENV_VAR);
    expect(prompt).not.toContain("JWT");
    expect(prompt).toContain("https://www.minddy.app/f/tok");
  });

  it("reprend l'instruction de placement telle qu'elle a été écrite", () => {
    const prompt = buildIntegrationPrompt({
      ...BASE,
      mode: "board",
      boardUrl: "https://www.minddy.app/f/tok",
      sso: true,
    });
    expect(prompt).toContain("Dans le menu utilisateur");
  });
});

describe("prompt d'intégration — API serveur-à-serveur", () => {
  for (const locale of ["fr", "en"] as const) {
    it(`nomme la variable d'environnement au lieu de la clé (${locale})`, () => {
      const prompt = buildIntegrationPrompt({ ...BASE, locale, mode: "api" });
      expect(prompt).toContain(INTEGRATION_ENV_VAR.feedback);
      for (const prefix of CREDENTIAL_PREFIXES) expect(prompt).not.toContain(prefix);
      // The call remains described from start to finish: it is the endpoint, not the secret,
      // which is the value of this prompt.
      expect(prompt).toContain("https://www.minddy.app/api/v1/feedback");
    });
  }

  it("passe la clé par l'en-tête d'autorisation, jamais en dur", () => {
    const prompt = buildIntegrationPrompt({ ...BASE, mode: "api" });
    expect(prompt).toContain(`Authorization: Bearer $${INTEGRATION_ENV_VAR.feedback}`);
  });
});

describe("prompt d'intégration — tickets par l'API", () => {
  for (const locale of ["fr", "en"] as const) {
    it(`nomme la variable d'environnement au lieu de la clé (${locale})`, () => {
      const prompt = buildIntegrationPrompt({ ...BASE, locale, mode: "issues" });
      expect(prompt).toContain(INTEGRATION_ENV_VAR.issues);
      for (const prefix of CREDENTIAL_PREFIXES) expect(prompt).not.toContain(prefix);
      expect(prompt).toContain("https://www.minddy.app/api/v1/issues");
    });
  }

  it("cite la variable des tickets, pas celle du feedback", () => {
    const prompt = buildIntegrationPrompt({ ...BASE, mode: "issues" });
    expect(prompt).toContain(`Authorization: Bearer $${INTEGRATION_ENV_VAR.issues}`);
    expect(prompt).not.toContain(INTEGRATION_ENV_VAR.feedback);
  });

  it("annonce le triage : rien n'entre directement dans le backlog", () => {
    for (const locale of ["fr", "en"] as const) {
      const prompt = buildIntegrationPrompt({ ...BASE, locale, mode: "issues" });
      expect(prompt.toLowerCase()).toContain("triage");
    }
  });
});

/**
 * The webhook section describes a route that the agent will WRITE, and which will check
 * for a signature. Two things are at stake: it must not carry a
 * credential any more than the rest (the prompt goes to Numo), and it must say the
 * only thing that a receiver cannot guess — that the HMAC key is
 * the fingerprint of the API key, not the key.
 */
describe("prompt d'intégration — section webhook", () => {
  const WEBHOOK = {
    url: "https://acme.test/hooks/minddy",
    events: ["issue.status_changed"],
    scope: "integration",
  };

  it("n'apparaît que si un webhook est réglé", () => {
    const without = buildIntegrationPrompt({ ...BASE, mode: "issues" });
    const with_ = buildIntegrationPrompt({
      ...BASE,
      mode: "issues",
      webhook: WEBHOOK,
    });
    expect(without).not.toContain(WEBHOOK.url);
    expect(with_).toContain(WEBHOOK.url);
  });

  for (const mode of ["api", "issues"] as const) {
    for (const locale of ["fr", "en"] as const) {
      it(`dit la clé du HMAC et le corps brut, sans credential (${mode}/${locale})`, () => {
        const prompt = buildIntegrationPrompt({
          ...BASE,
          locale,
          mode,
          webhook: WEBHOOK,
        });
        const envVar =
          mode === "issues" ? INTEGRATION_ENV_VAR.issues : INTEGRATION_ENV_VAR.feedback;
        expect(prompt).toContain("X-Minddy-Signature");
        // The HMAC key is the fingerprint of the key, not the key: it is THIS
        // sentence which prevents the receiver from refusing all deliveries.
        expect(prompt).toContain(`sha256_hex(process.env.${envVar})`);
        expect(prompt).toContain("delivery_id");
        for (const prefix of CREDENTIAL_PREFIXES) expect(prompt).not.toContain(prefix);
      });
    }
  }

  it("annonce les événements réellement suivis et le périmètre choisi", () => {
    const prompt = buildIntegrationPrompt({
      ...BASE,
      mode: "issues",
      webhook: { ...WEBHOOK, events: ["issue.created"], scope: "all" },
    });
    // The announcement sentence, not the entire prompt: the description of the body cites
    // the other events to say which field accompanies them.
    const announcement = prompt
      .split("\n")
      .find((line) => line.includes(WEBHOOK.url));
    expect(announcement).toContain("`issue.created`");
    expect(announcement).not.toContain("`issue.status_changed`");
    expect(announcement).toContain("tous les tickets du projet");
  });
});
