import { describe, expect, it } from "vitest";

import { buildIntegrationPrompt } from "./integration-prompt";
import { SSO_ENV_VAR } from "@/lib/feedback/sso-env";

/**
 * Ce que ces tests gardent, c'est la RAISON d'être des deux destinations du
 * prompt : celui du board public peut partir chez Numo parce qu'il ne porte
 * aucun credential — le secret SSO n'y est nommé que par sa variable
 * d'environnement. Le jour où on rebranche un secret dans ce texte, l'option
 * « confier à Numo » devient un envoi de credential dans une conversation
 * d'agent, sans que rien ne le signale. D'où la vérification par le type (le
 * builder n'accepte plus le secret) ET par ces assertions.
 */

const BASE = {
  locale: "fr" as const,
  projectName: "Acme",
  placement: "Dans le menu utilisateur",
  origin: "https://www.minddy.app",
};

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
      // Le préfixe de tout secret SSO (`rotateSsoSecret`) : aucun ne doit
      // pouvoir se retrouver dans ce texte, quel que soit le chemin d'appel.
      expect(prompt).not.toContain("fbsso_");
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
  it("porte encore la clé en clair (elle n'est relisible nulle part)", () => {
    const prompt = buildIntegrationPrompt({
      ...BASE,
      mode: "api",
      apiKey: "mdyk_test_key",
    });
    expect(prompt).toContain("mdyk_test_key");
    expect(prompt).toContain("MINDDY_FEEDBACK_KEY");
  });
});
