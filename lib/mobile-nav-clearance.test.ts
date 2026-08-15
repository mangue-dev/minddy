import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Le dégagement de la barre de navigation mobile est un contrat entre DEUX
 * paquets. mangue-ui pose la géométrie — la hauteur de la pilule flottante et la
 * réserve que l'AppShell laisse sous le contenu — et `app/globals.css` la
 * recalcule pour recaler cette réserve sur ce que la pilule occupe vraiment
 * (`--mobile-nav-clearance`), au lieu du tiers de trop qu'elle réservait.
 *
 * Rien ne relie les deux à l'exécution : ce sont des nombres recopiés. Un bump
 * de mangue-ui qui change la pilule de hauteur, ou qui abandonne sa réserve, ne
 * casse RIEN de visible — les écrans à champ ancré (le composer d'une pull
 * request, celui d'une session d'agent) se contentent de se reposer au mauvais
 * endroit, quelques dizaines de pixels trop haut ou par-dessus la barre. C'est
 * exactement le genre de dérive qu'on ne voit pas depuis un poste de dev, où la
 * barre mobile n'existe pas.
 *
 * D'où ce test : il relit les deux sources et échoue à la seconde où elles ne
 * disent plus la même chose. La consigne est alors de METTRE À JOUR globals.css
 * d'après mangue-ui, pas d'assouplir le test.
 */

const REPO = process.cwd();
const APP_SHELL = join(REPO, "node_modules/mangue-ui/src/components/shell/app-shell.tsx");
const MOBILE_NAV = join(REPO, "node_modules/mangue-ui/src/components/shell/mobile-nav.tsx");
const GLOBALS = join(REPO, "app/globals.css");

const read = (path: string) => readFileSync(path, "utf8");

describe("dégagement de la barre de navigation mobile", () => {
  it("mangue-ui réserve toujours une hauteur fixe sous le contenu, sous `desktop`", () => {
    // La règle de globals.css n'a de sens que parce qu'il y a quelque chose à
    // corriger : un padding bas posé par l'AppShell, et seulement sur mobile.
    expect(read(APP_SHELL)).toContain(
      "max-desktop:pb-[calc(6rem+env(safe-area-inset-bottom))]",
    );
  });

  it("la pilule mesure toujours 3rem de boutons + son ancrage bas", () => {
    const nav = read(MOBILE_NAV);
    // Ancrage bas de la barre…
    expect(nav).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
    // …et hauteur d'un bouton de la pilule (MobileNavItem).
    expect(nav).toMatch(/inline-flex h-12 w-12 items-center/);
  });

  it("globals.css recopie exactement cette géométrie", () => {
    const css = read(GLOBALS);
    expect(css).toContain(
      "--mobile-nav-height: calc(3rem + max(1rem, env(safe-area-inset-bottom)));",
    );
    expect(css).toContain(
      "--mobile-nav-clearance: calc(var(--mobile-nav-height) + 0.75rem);",
    );
    // La réserve de l'AppShell est bien celle qu'on écrase, sur le <main> du
    // shell et sous le même point de rupture (768px = --breakpoint-desktop).
    expect(css).toMatch(
      /@media \(width < 768px\) \{\s*\.app-shell main \{\s*padding-bottom: var\(--mobile-nav-clearance\);/,
    );
  });

  it("l'application redéfinit `desktop` à 768 px", () => {
    expect(read(GLOBALS)).toMatch(
      /@theme \{\s*--breakpoint-desktop: 768px;/,
    );
  });

  it("force le chrome desktop entre 768 et 1200 px, même si la dépendance est mise en cache", () => {
    const css = read(GLOBALS);
    expect(css).toContain("@media (768px <= width < 1200px)");
    expect(css).toContain(".app-shell .desktop\\:flex");
    expect(css).toContain(".app-shell .desktop\\:hidden");
  });

  it("le shell porte la classe sur laquelle la règle s'accroche", () => {
    expect(read(join(REPO, "components/app-shell-chrome.tsx"))).toContain(
      'className="app-shell"',
    );
  });
});
