import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { CHEATSHEET } from "./keyboard/shortcuts";
import { HOME_TIPS, pickTip, tipShortcut } from "./home-tips";

/**
 * Le garde-fou du vivier d'astuces.
 *
 * Le contrat i18n général (lib/i18n-contract.test.ts) vérifie que les clés
 * APPELÉES existent ; ici les clés transitent par une table, donc c'est à
 * l'inverse qu'on veille — que chaque astuce du vivier ait bien son message,
 * dans les deux langues, et que le catalogue ne traîne pas de message orphelin
 * qui ne sortira jamais.
 *
 * S'y ajoutent les deux invariants propres à cette surface : une astuce ne
 * réclame jamais de valeurs (elle est appelée sans), et le raccourci qu'elle
 * désigne existe vraiment dans le registre du cheat sheet.
 */

const catalogTips = (catalog: typeof en | typeof fr): Record<string, string> =>
  catalog.Home.tips as Record<string, string>;

const KNOWN_SHORTCUTS = new Set(
  CHEATSHEET.flatMap((section) => section.shortcuts.map((sc) => sc.id)),
);

describe("HOME_TIPS", () => {
  it("porte de quoi ne pas se répéter", () => {
    // Le seuil n'est pas décoratif : l'astuce se tire à chaque chargement de
    // l'accueil, et un vivier étroit se reconnaît en une journée.
    expect(HOME_TIPS.length).toBeGreaterThanOrEqual(30);
  });

  it("ne dit jamais deux fois la même chose", () => {
    const keys = HOME_TIPS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ne désigne que des raccourcis qui existent", () => {
    // Une astuce qui cite un id disparu se rendrait SANS ses touches, en
    // silence : la phrase promettrait un raccourci et n'en montrerait aucun.
    for (const tip of HOME_TIPS) {
      if (!tip.shortcut) continue;
      expect(KNOWN_SHORTCUTS, `astuce « ${tip.key} »`).toContain(tip.shortcut);
      expect(tipShortcut(tip)?.keys.length).toBeGreaterThan(0);
    }
  });
});

describe("catalogue", () => {
  it("porte chaque astuce, en anglais et en français", () => {
    for (const tip of HOME_TIPS) {
      expect(catalogTips(en)[tip.key], `en.Home.tips.${tip.key}`).toBeTypeOf(
        "string",
      );
      expect(catalogTips(fr)[tip.key], `fr.Home.tips.${tip.key}`).toBeTypeOf(
        "string",
      );
    }
  });

  it("ne garde aucun message que le vivier n'appelle plus", () => {
    const live = new Set<string>(HOME_TIPS.map((t) => t.key));
    for (const catalog of [en, fr] as const) {
      for (const key of Object.keys(catalogTips(catalog))) {
        expect(live, `Home.tips.${key}`).toContain(key);
      }
    }
  });

  it("n'exige aucune valeur : les astuces sont appelées sans", () => {
    // Même détection que le contrat i18n : on appelle le VRAI formateur sans
    // valeurs et on regarde s'il proteste. Un `{name}` oublié ici afficherait
    // « Home.tips.x » en bas de l'accueil, sans exception ni log.
    for (const [locale, catalog] of [
      ["en", en],
      ["fr", fr],
    ] as const) {
      // Catalogue passé en `never` et clés en chemin complet, comme dans
      // lib/i18n-contract.test.ts : c'est ce qui court-circuite le typage strict
      // de next-intl, dont ce test explore justement la limite.
      const t = createTranslator({
        locale,
        messages: catalog as never,
        onError: () => {},
      }) as unknown as (key: string) => string;
      for (const tip of HOME_TIPS) {
        const path = `Home.tips.${tip.key}`;
        // Le repli de next-intl quand le formatage échoue : le CHEMIN de la
        // clé, affiché tel quel à l'écran.
        expect(t(path), `${locale}.${path}`).not.toBe(path);
      }
    }
  });

  it("n'écrit pas de touche dans la phrase : elles viennent du registre", () => {
    // La règle n° 2 de lib/home-tips.ts, tenue par un test parce qu'elle ne se
    // voit pas à la relecture d'un seul fichier : une phrase qui recopie « ⌘K »
    // dit une deuxième fois ce que le registre dit déjà, et les deux divergent
    // le jour où le raccourci change.
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
    // `<mot>` est lu par next-intl comme une balise, pas comme du texte
    // (cf. CLAUDE.md). Le formateur lèverait, et la clé s'afficherait nue.
    for (const catalog of [en, fr] as const) {
      for (const [key, message] of Object.entries(catalogTips(catalog))) {
        expect(message, `Home.tips.${key}`).not.toMatch(/<[^>]+>/);
      }
    }
  });
});

describe("pickTip", () => {
  it("rend toujours une astuce, quelle que soit la graine", () => {
    for (const seed of [0, 1, 7, 1234, 999_999_999]) {
      expect(pickTip(seed)).toBeDefined();
    }
  });

  it("balaie tout le vivier quand la graine tourne", () => {
    const seen = new Set(HOME_TIPS.map((_, i) => pickTip(i).key));
    expect(seen.size).toBe(HOME_TIPS.length);
  });
});
