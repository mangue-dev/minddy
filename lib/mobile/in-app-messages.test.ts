import { describe, expect, it } from "vitest";

import { inAppMessages } from "@/i18n/in-app-messages";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import it_ from "@/messages/it.json";
import ptBR from "@/messages/pt-BR.json";

/**
 * The mobile app sells nothing (MIN-907, App Store guideline 3.1.1): the
 * plan-limit errors the server writes for it must not invite an upgrade.
 */

const catalogs = { en, fr, de, es, it: it_, "pt-BR": ptBR } as const;

/** The words each locale's ApiErrors use to point at a purchase. */
const UPGRADE = /upgrade|offre supérieure|changez d'offre|plan superior/i;

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();

describe("inAppMessages", () => {
  it.each(Object.entries(catalogs))("replaces existing ApiErrors keys only, with the same values (%s)", (_, catalog) => {
    for (const [key, text] of Object.entries(catalog.InAppApiErrors)) {
      const original = (catalog.ApiErrors as Record<string, string>)[key];
      expect(original, key).toBeTypeOf("string");
      expect(placeholders(text), key).toEqual(placeholders(original));
    }
  });

  it.each(Object.entries(catalogs))("leaves no call to upgrade in the app's errors (%s)", (_, catalog) => {
    for (const [key, text] of Object.entries(catalog.InAppApiErrors)) {
      expect(text, key).not.toMatch(UPGRADE);
    }
  });

  it("swaps the plan-limit errors and keeps every other message", () => {
    const messages = inAppMessages(en);
    const apiErrors = messages.ApiErrors as Record<string, string>;
    expect(apiErrors.projectLimitReached).toBe(en.InAppApiErrors.projectLimitReached);
    expect(apiErrors.titleRequired).toBe(en.ApiErrors.titleRequired);
    expect(messages.Common).toBe(en.Common);
  });
});
