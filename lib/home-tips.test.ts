import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { CHEATSHEET } from "./keyboard/shortcuts";
import { HOME_TIPS, pickTip, tipShortcut } from "./home-tips";

/**
 * The cheat pool guardrail.
 *
 * The general i18n contract (lib/i18n-contract.test.ts) verifies that the keys
 * CALLED exist; here the keys pass through a table, so it is __
 * the opposite that we ensure - that each tip in the pool has its message,
 * in both languages, and that the catalog does not carry any orphan message
 * which will never come out.
 *
 * Added to this are the two invariants specific to this surface: a trick never
 * never requires values (it is called without), and the shortcut that it
 * designates really exists in the cheat sheet register.
 */

const catalogTips = (catalog: typeof en | typeof fr): Record<string, string> =>
  catalog.Home.tips as Record<string, string>;

const KNOWN_SHORTCUTS = new Set(
  CHEATSHEET.flatMap((section) => section.shortcuts.map((sc) => sc.id)),
);

describe("HOME_TIPS", () => {
  it("contains enough entries to avoid repetition", () => {
    // The threshold is not decorative: the trick is pulled each time the
    // reception, and a narrow pool can be recognized in one day.
    expect(HOME_TIPS.length).toBeGreaterThanOrEqual(30);
  });

  it("never says the same thing twice", () => {
    const keys = HOME_TIPS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mentions only shortcuts that exist", () => {
    // A trick that cites a missing id would render WITHOUT its keys, in
    // silence: the sentence would promise a shortcut and show none.
    for (const tip of HOME_TIPS) {
      if (!tip.shortcut) continue;
      expect(KNOWN_SHORTCUTS, `astuce « ${tip.key} »`).toContain(tip.shortcut);
      expect(tipShortcut(tip)?.keys.length).toBeGreaterThan(0);
    }
  });
});

describe("catalogue", () => {
  it("contains every tip in English and French", () => {
    for (const tip of HOME_TIPS) {
      expect(catalogTips(en)[tip.key], `en.Home.tips.${tip.key}`).toBeTypeOf(
        "string",
      );
      expect(catalogTips(fr)[tip.key], `fr.Home.tips.${tip.key}`).toBeTypeOf(
        "string",
      );
    }
  });

  it("keeps no message that the pool no longer uses", () => {
    const live = new Set<string>(HOME_TIPS.map((t) => t.key));
    for (const catalog of [en, fr] as const) {
      for (const key of Object.keys(catalogTips(catalog))) {
        expect(live, `Home.tips.${key}`).toContain(key);
      }
    }
  });

  it("n'exige aucune valeur : les astuces sont appelées sans", () => {
    // Same detection as the i18n contract: we call the REAL trainer without
    // values ​​and we see if he protests. A `{name}` forgotten here would display
    // « Home.tips.x » en bas de l'accueil, sans exception ni log.
    for (const [locale, catalog] of [
      ["en", en],
      ["fr", fr],
    ] as const) {
      // Catalog passed as `never` and keys as full path, as in
      // lib/i18n-contract.test.ts: this is what bypasses strict typing
      // of next-intl, the limit of which this test explores.
      const t = createTranslator({
        locale,
        messages: catalog as never,
        onError: () => {},
      }) as unknown as (key: string) => string;
      for (const tip of HOME_TIPS) {
        const path = `Home.tips.${tip.key}`;
        // The fallback of next-intl when formatting fails: the PATH of the
        // key, displayed as is on the screen.
        expect(t(path), `${locale}.${path}`).not.toBe(path);
      }
    }
  });

  it("n'écrit pas de touche dans la phrase : elles viennent du registre", () => {
    // Rule no. 2 of lib/home-tips.ts, held by a test because it does not
    // does not see the rereading of a single file: a sentence which copies “⌘K”
    // says a second time what the register already says, and the two diverge
    // the day the shortcut changes.
    const GLYPHS = ["⌘", "Ctrl", "Cmd", "⇧"];
    for (const catalog of [en, fr] as const) {
      for (const [key, message] of Object.entries(catalogTips(catalog))) {
        for (const glyph of GLYPHS) {
          expect(message, `Home.tips.${key}`).not.toContain(glyph);
        }
      }
    }
  });

  it("ne glisse pas de fausse balise riche", () => {
    // `<mot>` is read by next-intl as a tag, not as text
    // (see CLAUDE.md). The trainer would raise, and the key would display naked.
    for (const catalog of [en, fr] as const) {
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

  it("balaie tout le vivier quand la graine tourne", () => {
    const seen = new Set(HOME_TIPS.map((_, i) => pickTip(i).key));
    expect(seen.size).toBe(HOME_TIPS.length);
  });
});
