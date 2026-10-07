import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import itMessages from "@/messages/it.json";
import ptBr from "@/messages/pt-BR.json";
import { CHEATSHEET } from "./keyboard/shortcuts";
import { HOME_TIPS, pickTip, tipShortcut } from "./home-tips";

/**
 * Tip keys pass through a table rather than literal translation calls.
 * Check that every locale matches the pool, formats without values, and
 * leaves shortcut keys to CHEATSHEET.
 */

const CATALOGS = [
  ["de", de], ["en", en], ["es", es], ["fr", fr],
  ["it", itMessages], ["pt-BR", ptBr],
] as const;

const catalogTips = (catalog: typeof en | typeof fr): Record<string, string> =>
  catalog.Home.tips as Record<string, string>;

const KNOWN_SHORTCUTS = new Set(
  CHEATSHEET.flatMap((section) => section.shortcuts.map((sc) => sc.id)),
);

describe("HOME_TIPS", () => {
  it("contains enough entries to avoid repetition", () => {
    // A small pool would repeat noticeably across daily visits.
    expect(HOME_TIPS.length).toBeGreaterThanOrEqual(30);
  });

  it("never says the same thing twice", () => {
    const keys = HOME_TIPS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mentions only shortcuts that exist", () => {
    // Missing IDs would silently render a shortcut tip without its keys.
    for (const tip of HOME_TIPS) {
      if (!tip.shortcut) continue;
      expect(KNOWN_SHORTCUTS, `tip: ${tip.key}`).toContain(tip.shortcut);
      expect(tipShortcut(tip)?.keys.length).toBeGreaterThan(0);
    }
  });
});

describe("tip catalogs", () => {
  it("contains every tip in every supported language", () => {
    for (const [locale, catalog] of CATALOGS) {
      for (const tip of HOME_TIPS) {
        expect(catalogTips(catalog)[tip.key], `${locale}.Home.tips.${tip.key}`)
          .toBeTypeOf("string");
      }
    }
  });

  it("keeps no message that the pool no longer uses", () => {
    const live = new Set<string>(HOME_TIPS.map((t) => t.key));
    for (const [, catalog] of CATALOGS) {
      for (const key of Object.keys(catalogTips(catalog))) {
        expect(live, `Home.tips.${key}`).toContain(key);
      }
    }
  });

  it("formats every tip without values", () => {
    // Use the real formatter to detect ICU values and rich tags.
    for (const [locale, catalog] of CATALOGS) {
      const errors: unknown[] = [];
      const t = createTranslator({
        locale,
        messages: catalog as never,
        onError: (error) => errors.push(error),
      }) as unknown as (key: string) => string;
      for (const tip of HOME_TIPS) {
        const path = `Home.tips.${tip.key}`;
        // A formatting failure would expose the translation path to users.
        expect(t(path), `${locale}.${path}`).not.toBe(path);
      }
      expect(errors, locale).toEqual([]);
    }
  });

  it("leaves shortcut keys to the registry", () => {
    // Duplicating keys in messages would drift when a shortcut changes.
    const GLYPHS = ["⌘", "Ctrl", "Cmd", "⇧"];
    for (const [, catalog] of CATALOGS) {
      for (const [key, message] of Object.entries(catalogTips(catalog))) {
        for (const glyph of GLYPHS) {
          expect(message, `Home.tips.${key}`).not.toContain(glyph);
        }
      }
    }
  });

  it("contains no unsupported rich text tags", () => {
    // next-intl interprets angle brackets as tags rather than plain text.
    for (const [, catalog] of CATALOGS) {
      for (const [key, message] of Object.entries(catalogTips(catalog))) {
        expect(message, `Home.tips.${key}`).not.toMatch(/<[^>]+>/);
      }
    }
  });
});

describe("pickTip", () => {
  it("always returns a tip regardless of the seed", () => {
    for (const seed of [0, 1, 7, 1234, 999_999_999]) {
      expect(pickTip(seed)).toBeDefined();
    }
  });

  it("selects every tip across consecutive seeds", () => {
    const seen = new Set(HOME_TIPS.map((_, i) => pickTip(i).key));
    expect(seen.size).toBe(HOME_TIPS.length);
  });
});
