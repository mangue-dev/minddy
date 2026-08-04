import { describe, expect, it } from "vitest";

import { buildIntegrationPrompt } from "./integration-prompt";
import { SSO_ENV_VAR } from "@/lib/feedback/env-lines";
import { INTEGRATION_ENV_VAR } from "@/lib/feedback/integration-contract";

/**
 * Ce que ces tests gardent, c'est la RAISON d'être des deux destinations du
 * prompt : il peut partir chez Numo parce qu'il ne porte aucun credential — le
 * secret SSO et la clé d'API n'y sont nommés que par leur variable
 * d'environnement. Le jour où on rebranche un secret dans un de ces textes,
 * « confier à Numo » devient un envoi de credential dans une conversation
 * d'agent, sans que rien ne le signale. D'où la vérification par le type (le
 * builder n'accepte plus ni secret ni clé) ET par ces assertions.
 */

const BASE = {
  locale: "fr" as const,
  projectName: "Acme",
  placement: "Dans le menu utilisateur",
  origin: "https://www.minddy.app",
};

/** Les préfixes que portent les credentials de minddy, tous chemins confondus. */
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
      // L'appel reste décrit de bout en bout : c'est l'endpoint, pas le secret,
      // qui fait la valeur de ce prompt.
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
 * La section webhook décrit une route que l'agent va ÉCRIRE, et qui vérifiera
 * une signature. Deux choses s'y jouent : elle ne doit pas plus porter de
 * credential que le reste (le prompt part chez Numo), et elle doit dire la
 * seule chose qu'un récepteur ne peut pas deviner — que la clé du HMAC est
 * l'empreinte de la clé d'API, pas la clé.
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
        // La clé du HMAC est l'empreinte de la clé, pas la clé : c'est CETTE
        // phrase qui évite au récepteur de refuser toutes les livraisons.
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
    // La phrase d'annonce, pas le prompt entier : la description du corps cite
    // les autres événements pour dire quel champ les accompagne.
    const announcement = prompt
      .split("\n")
      .find((line) => line.includes(WEBHOOK.url));
    expect(announcement).toContain("`issue.created`");
    expect(announcement).not.toContain("`issue.status_changed`");
    expect(announcement).toContain("tous les tickets du projet");
  });
});
