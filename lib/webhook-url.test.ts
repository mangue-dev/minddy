import { describe, expect, it } from "vitest";

import { normalizeWebhookUrl } from "@/lib/webhook-url";

/**
 * L'adresse d'un webhook se colle depuis une doc ou une barre d'adresse, et ce
 * qu'on colle n'a pas toujours de schéma. Ce que ce test garde, ce n'est pas la
 * commodité : c'est que le schéma ajouté soit `https`, sur un champ dont la
 * valeur finit par recevoir des charges utiles signées, et qu'un schéma écrit
 * à la main ne soit jamais réécrit.
 */
describe("normalizeWebhookUrl", () => {
  it("complète en https ce qui n'a pas de schéma", () => {
    expect(normalizeWebhookUrl("example.com/hooks/minddy")).toBe(
      "https://example.com/hooks/minddy",
    );
    expect(normalizeWebhookUrl("www.example.com")).toBe(
      "https://www.example.com",
    );
    expect(normalizeWebhookUrl("localhost:3000/hook")).toBe(
      "https://localhost:3000/hook",
    );
  });

  it("respecte un schéma déjà écrit, y compris http", () => {
    expect(normalizeWebhookUrl("http://localhost:3000/hook")).toBe(
      "http://localhost:3000/hook",
    );
    expect(normalizeWebhookUrl("https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("laisse le vide vide — c'est ainsi qu'on éteint un webhook", () => {
    expect(normalizeWebhookUrl("")).toBe("");
    expect(normalizeWebhookUrl("   ")).toBe("");
  });

  it("coupe les espaces autour de ce qui a été collé", () => {
    expect(normalizeWebhookUrl("  example.com/hook \n")).toBe(
      "https://example.com/hook",
    );
  });

  it("produit une URL que le serveur saura parser", () => {
    for (const raw of [
      "example.com/hook",
      "http://a.test",
      "sub.domain.co.uk/x",
    ]) {
      const url = new URL(normalizeWebhookUrl(raw));
      expect(["http:", "https:"]).toContain(url.protocol);
    }
  });
});
