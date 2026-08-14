import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { BOARD_COLUMN_CLASS } from "./board-layout";

/**
 * La largeur d'une colonne de board se décide dans la CASCADE, pas dans le
 * fichier qui l'écrit.
 *
 * `BOARD_COLUMN_CLASS` empile quatre largeurs sur le même élément — une par
 * palier — et la seule qui compte est la dernière qui s'applique. Or l'ordre
 * d'écriture des media queries n'est pas celui des classes : Tailwind trie les
 * points de rupture par valeur mais ne compare pas `px` et `rem`, si bien que le
 * `desktop:` de mangue-ui (1200px) sort AVANT les `sm:`/`lg:` du cœur (40rem,
 * 64rem). Une colonne peut donc être trois fois plus large que ce que le fichier
 * annonce, sans que rien ne l'annonce nulle part — c'est arrivé, et ça se lisait
 * en cartes de ticket étirées au-dessus de 1200 px.
 *
 * Relire les classes ne vérifie pas ça. Ce qui le vérifie : les compiler pour de
 * vrai, avec les tokens de mangue-ui, puis rejouer la cascade à cinq largeurs de
 * fenêtre. Le test échoue aussi bien si quelqu'un retire le `max-desktop:` que si
 * un bump de mangue-ui déplace le seuil.
 */

const require = createRequire(import.meta.url);

/** Ce que vaut 1rem dans une media query : la taille de police RACINE par défaut.
    C'est ce qui permet de comparer les paliers en `rem` du cœur au seuil en `px`
    de mangue-ui — la comparaison que Tailwind, justement, ne fait pas. */
const REM = 16;

/**
 * Compile les classes avec le VRAI thème : les points de rupture de Tailwind plus
 * ceux de mangue-ui (`--breakpoint-desktop`), qui sont tout l'enjeu.
 *
 * Les `@import` de `tokens.css` sont retirés plutôt que résolus : ils tirent
 * `tw-animate-css`, dont l'export ne se résout que par la condition `style` que
 * `require.resolve` ne sait pas demander. Rien de ce qu'ils apportent (des
 * keyframes) ne pèse sur une largeur ; le bloc `@theme` du fichier, lui, est lu
 * tel quel.
 */
async function buildCss(candidates: string[]): Promise<string> {
  const loadStylesheet = async (id: string, base: string) => {
    const file = id.startsWith(".") ? path.resolve(base, id) : require.resolve(id);
    return {
      path: file,
      base: path.dirname(file),
      content: readFileSync(file, "utf8"),
    };
  };
  const tokens = readFileSync(require.resolve("mangue-ui/tokens.css"), "utf8").replace(
    /^\s*@import\s[^;]*;\s*$/gm,
    "",
  );
  const compiler = await compile(
    [
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities);',
      tokens,
    ].join("\n"),
    { base: process.cwd(), loadStylesheet },
  );
  return compiler.build(candidates);
}

/** `(width >= 40rem)` / `(width < 1200px)` → la condition tient-elle à `viewport` ? */
function conditionHolds(condition: string, viewport: number): boolean {
  const m = /\(\s*width\s*(>=|<=|>|<)\s*([\d.]+)(px|rem)\s*\)/.exec(condition);
  // Une condition qu'on ne sait pas lire (`print`, `hover`…) ne doit pas être
  // silencieusement traitée comme vraie : la lecture serait fausse sans le dire.
  if (!m) throw new Error(`Condition de media query non reconnue : ${condition}`);
  const bound = Number(m[2]) * (m[3] === "rem" ? REM : 1);
  switch (m[1]) {
    case ">=":
      return viewport >= bound;
    case ">":
      return viewport > bound;
    case "<=":
      return viewport <= bound;
    default:
      return viewport < bound;
  }
}

/**
 * Les règles de la feuille : `sélecteur` → `corps`, dans l'ordre du document.
 *
 * Les `@layer` sont TRAVERSÉS (les utilitaires sont générés dans
 * `@layer utilities`) : une couche ne change pas l'ordre entre deux règles qui
 * vivent dedans, et c'est cet ordre-là qu'on rejoue.
 */
function flatRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let openedAt = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      if (depth === 0) openedAt = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        const selector = css.slice(start, openedAt).trim();
        const body = css.slice(openedAt + 1, i);
        if (selector.startsWith("@layer")) rules.push(...flatRules(body));
        else rules.push({ selector, body });
        start = i + 1;
      }
    }
  }
  return rules;
}

/** La `width` posée par un corps de règle, si toutes ses media queries tiennent. */
function widthInBody(body: string, viewport: number): string | null {
  const nested = /@media([^{]*)\{/.exec(body);
  if (nested) {
    if (!conditionHolds(nested[1].trim(), viewport)) return null;
    // Le corps imbriqué : de l'accolade ouvrante à sa fermante.
    let depth = 0;
    for (let i = nested.index + nested[0].length - 1; i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}" && --depth === 0) {
        return widthInBody(body.slice(nested.index + nested[0].length, i), viewport);
      }
    }
    return null;
  }
  const decl = /(?:^|;)\s*width:\s*([^;]+)/.exec(body);
  return decl ? decl[1].trim() : null;
}

/** La largeur qui GAGNE à cette largeur de fenêtre — la dernière qui s'applique. */
async function resolvedWidth(viewport: number): Promise<string | null> {
  const candidates = BOARD_COLUMN_CLASS.split(" ").filter((c) => /(^|:)w-/.test(c));
  expect(candidates.length).toBeGreaterThan(1);
  const css = await buildCss(candidates);
  // Le sélecteur généré est échappé (`.max-desktop\:sm\:w-\[…\]`) : retirer les
  // antislashs le ramène au nom de la classe.
  const wanted = new Set(candidates.map((c) => `.${c}`));
  let winner: string | null = null;
  for (const rule of flatRules(css)) {
    if (!wanted.has(rule.selector.replace(/\\/g, ""))) continue;
    const width = widthInBody(rule.body, viewport);
    if (width) winner = width;
  }
  return winner;
}

describe("largeur d'une colonne de board", () => {
  it("téléphone (375 px) : une colonne pleine, qu'on feuillette", async () => {
    expect(await resolvedWidth(375)).toBe("100%");
  });

  it("640 px : deux colonnes, gouttière déduite", async () => {
    expect(await resolvedWidth(800)).toBe("calc((100% - 0.75rem) / 2)");
  });

  it("1024 px : trois colonnes", async () => {
    expect(await resolvedWidth(1100)).toBe("calc((100% - 1.5rem) / 3)");
  });

  it("au-dessus de 1200 px la colonne est FIXE — le partage ne déborde pas", async () => {
    // Le cœur du test : sans `max-desktop:` sur les fractions, `lg:` gagnait ici
    // et rendait une colonne au tiers de la fenêtre.
    expect(await resolvedWidth(1400)).toBe("22rem");
    expect(await resolvedWidth(2400)).toBe("22rem");
  });
});
