import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-284 — le confort au doigt est, lui aussi, un contrat entre deux paquets.
 *
 * mangue-ui vit dans node_modules : on ne le patche pas. `app/globals.css` le
 * corrige donc À DISTANCE, en visant ses `data-slot` et sa géométrie — cibles de
 * toucher portées à 44 px, retour à l'appui, zones de sécurité rendues visibles
 * par le `viewport-fit=cover` du root layout.
 *
 * Rien ne relie les deux à l'exécution. Un bump de mangue-ui qui renomme un
 * `data-slot`, qui retire le `data-side` d'un tiroir ou qui change le plafond de
 * hauteur d'une boîte de dialogue ne casse RIEN de visible depuis un poste de
 * dev : les règles cessent simplement de s'accrocher, et l'app redevient dure à
 * taper sur un téléphone — exactement ce que personne ne voit à la souris.
 *
 * Ce test relit les deux sources et échoue à la seconde où elles ne disent plus
 * la même chose. Comme pour `lib/mobile-nav-clearance.test.ts`, la consigne est
 * alors de METTRE À JOUR globals.css d'après mangue-ui, pas d'assouplir le test.
 */

const REPO = process.cwd();
const UI = (name: string) => join(REPO, `node_modules/mangue-ui/src/components/ui/${name}.tsx`);
const GLOBALS = join(REPO, "app/globals.css");
const LAYOUT = join(REPO, "app/layout.tsx");

const read = (path: string) => readFileSync(path, "utf8");

describe("zones de sécurité", () => {
  it("le root layout rend la page à fond perdu", () => {
    const layout = read(LAYOUT);
    // Sans `cover`, la fenêtre est calée DANS la zone sûre et les sept
    // `env(safe-area-inset-*)` du dépôt valent tous 0. C'est la ligne qui met
    // en service tout le travail de safe area déjà écrit.
    expect(layout).toContain("export const viewport: Viewport");
    expect(layout).toContain('viewportFit: "cover"');
    // Et le clavier logiciel rétrécit le viewport de MISE EN PAGE, sans quoi les
    // composers ancrés (pull request, session d'agent) passent derrière lui.
    expect(layout).toContain('interactiveWidget: "resizes-content"');
  });

  it("le root layout ne bride pas le zoom", () => {
    // Un `maximumScale` ou un `userScalable: false` glissés ici seraient un
    // défaut d'accessibilité, et aucun correctif de MIN-284 n'en a besoin.
    // Les deux-points : on cherche la CLÉ, pas la mention dans le commentaire
    // qui explique justement pourquoi elle n'est pas là.
    const layout = read(LAYOUT);
    expect(layout).not.toContain("maximumScale:");
    expect(layout).not.toContain("userScalable:");
  });

  it("les boîtes de dialogue plafonnent toujours à la hauteur qu'on recalcule", () => {
    // globals.css réécrit ce plafond en lui retranchant les insets. Si mangue-ui
    // change la formule, notre règle ne corrige plus la bonne chose.
    for (const file of ["dialog", "alert-dialog"]) {
      expect(read(UI(file))).toContain("max-h-[calc(100dvh-2rem)]");
    }
    expect(read(GLOBALS)).toContain(
      "100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)",
    );
  });

  it("les tiroirs annoncent toujours leur bord", () => {
    // `data-side` est la seule prise pour savoir de QUEL bord un tiroir est
    // collé, donc quel inset lui donner.
    expect(read(UI("sheet"))).toContain("data-side={side}");
    const css = read(GLOBALS);
    expect(css).toContain('[data-slot="sheet-content"][data-side="bottom"]');
    expect(css).toContain('[data-slot="sheet-content"][data-side="top"]');
  });

  it("le shell dégage l'encoche et les bords en paysage", () => {
    expect(read(GLOBALS)).toMatch(
      /\.app-shell \{\s*padding-top: env\(safe-area-inset-top\);/,
    );
  });
});

describe("cibles de toucher", () => {
  it("aucune taille de bouton n'atteint 44 px — la règle a toujours lieu d'être", () => {
    const button = read(UI("button"));
    // Les six tailles de `buttonVariants`, en unités Tailwind (1 = 0.25rem = 4px).
    // Le jour où l'une d'elles atteint 11 (44px), la cible étendue devient
    // inutile pour elle : c'est le moment de relire la règle, pas de la garder
    // par réflexe.
    const heights = [
      /default:\s*\n?\s*"h-9 /, // 36
      /sm: "h-8 /, // 32
      /lg: "h-10 /, // 40
      /icon: "size-9"/, // 36
      /"icon-sm": "size-8"/, // 32
      /"icon-lg": "size-10"/, // 40
    ];
    for (const height of heights) expect(button).toMatch(height);
  });

  it("le bouton expose toujours les attributs que la règle vise", () => {
    const button = read(UI("button"));
    expect(button).toContain('data-slot="button"');
    // `data-variant` porte l'exclusion des liens en ligne, dont la cible
    // déborderait sur son paragraphe.
    expect(button).toContain("data-variant={variant}");
    expect(button).toContain("link:");
  });

  it("globals.css étend la cible sans toucher au dessin", () => {
    const css = read(GLOBALS);
    // `max()` fait le tri : ce qui dépasse 44 garde sa taille, le reste y monte.
    // Aucune hauteur n'est écrite en dur, donc rien à retoucher si mangue-ui
    // change ses tailles — seul le test ci-dessus s'en apercevra.
    expect(css).toContain("width: max(100%, 44px)");
    expect(css).toContain("height: max(100%, 44px)");
    expect(css).toContain('[data-slot="button"]:not([data-variant="link"])::after');
    // Le positionnement du bouton reste celui de ses utilitaires : `relative`
    // est posé en @layer base à dessein (un `absolute` Tailwind doit gagner).
    expect(css).toMatch(/@layer base \{\s*\[data-slot="button"\] \{\s*position: relative;/);
  });

  it("les commandes isolées gardent la géométrie sur laquelle on a calculé", () => {
    // On REPREND le pseudo-élément de mangue-ui au lieu d'en poser un second :
    // si sa taille de base change, nos `inset` négatifs ne donnent plus 44 px.
    const checkbox = read(UI("checkbox"));
    expect(checkbox).toContain('data-slot="checkbox"');
    expect(checkbox).toMatch(/size-4 .*after:absolute after:-inset-x-3 after:-inset-y-2/);
    expect(read(GLOBALS)).toContain("inset: -14px; /* 16 + 2×14 = 44 */");

    const slider = read(UI("slider"));
    expect(slider).toContain('data-slot="slider-thumb"');
    expect(slider).toMatch(/size-3 .*after:absolute after:-inset-2/);
    expect(read(GLOBALS)).toContain("inset: -16px; /* 12 + 2×16 = 44 */");

    // L'interrupteur, lui, n'a pas de `::after` à reprendre : on lui en donne
    // un. Si mangue-ui lui en ajoute un jour un, les deux se marcheraient dessus.
    const switchUi = read(UI("switch"));
    expect(switchUi).toContain('data-slot="switch"');
    expect(switchUi).toMatch(/h-5 w-9 /);
    expect(switchUi).not.toContain("after:");
  });

  it("la cible de l'onglet passe par `::before`, jamais par `::after`", () => {
    // Le trait de l'onglet actif est dessiné par un `after:`, et on ne pose donc
    // pas le nôtre au même endroit.
    //
    // Depuis mangue-ui 0.6.0 ce trait a DÉMÉNAGÉ : il n'est plus sur le
    // déclencheur mais sur un indicateur qui glisse d'un onglet à l'autre
    // (`data-slot="tabs-indicator"`, variante `line` — celle que minddy utilise
    // partout). Le `::after` du déclencheur est donc libre aujourd'hui. **On
    // garde `::before` quand même** : ça ne coûte rien, et ça nous laisse
    // indifférents au jour où le trait lui reviendra.
    const tabs = read(UI("tabs"));
    expect(tabs).toContain('data-slot="tabs-indicator"');
    expect(tabs).toMatch(/after:absolute .*after:bg-foreground/);
    expect(read(GLOBALS)).toContain('[data-slot="tabs-trigger"]::before');
  });

  it("les rangées de liste grandissent pour de vrai", () => {
    // Une rangée ne peut pas déborder sur sa voisine sans qu'on ouvre la
    // mauvaise ligne : là, et seulement là, on change la hauteur réelle.
    const css = read(GLOBALS);
    for (const slot of [
      "dropdown-menu-item",
      "dropdown-menu-checkbox-item",
      "dropdown-menu-radio-item",
      "dropdown-menu-sub-trigger",
      "select-item",
      "command-item",
    ]) {
      expect(css).toContain(`[data-slot="${slot}"]`);
      // Le slot existe toujours du côté de mangue-ui.
      const file = slot.startsWith("dropdown") ? "dropdown-menu" : slot.split("-")[0];
      expect(read(UI(file))).toContain(`data-slot="${slot}"`);
    }
    expect(css).toContain("min-height: 44px;");
  });

  it("les options de dropdown redeviennent compactes dès 768 px", () => {
    const css = read(GLOBALS);
    expect(css).toContain("@media (width >= 768px)");
    expect(css).toContain('[data-slot="dropdown-menu-item"]');
    expect(css).toContain("padding-block: 0.375rem !important;");
    // La dépendance conserve son réglage tactle à 1200 px : l'override ci-dessus
    // est donc nécessaire pour le seuil réel de l'application.
    expect(read(UI("dropdown-menu"))).toContain("max-[1199px]:py-2.5");
  });
});

describe("retour au toucher", () => {
  it("l'appui enfonce le bouton, et seulement au doigt", () => {
    const css = read(GLOBALS);
    // Tout le bloc vit sous `pointer: coarse` : le ressenti à la souris ne
    // bouge pas. Et il s'efface si l'utilisateur demande moins d'animation.
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toMatch(/\):active \{\s*scale: 0\.97;/);
  });

  it("le bouton sait déjà animer cet enfoncement", () => {
    // `transition-all` vient de mangue-ui : sans lui, le `scale` claquerait d'un
    // coup au lieu de répondre. Rien dans globals.css ne le rattraperait.
    expect(read(UI("button"))).toContain("transition-all");
  });

  it("le halo gris du navigateur est éteint", () => {
    // Il arrive en retard et déborde du rayon de bordure — il n'a plus rien à
    // dire maintenant que l'appui a son propre retour.
    expect(read(GLOBALS)).toContain("-webkit-tap-highlight-color: transparent;");
  });

  it("le délai du double-tap est levé sur ce qui se tape", () => {
    // …et SEULEMENT là : le double-tap-pour-zoomer doit rester disponible sur
    // le contenu (une capture, un tableau, un bloc de code).
    const css = read(GLOBALS);
    expect(css).toContain("touch-action: manipulation;");
    expect(css).not.toMatch(/^(html|body)[^{]*\{[^}]*touch-action/m);
  });
});

describe("les autres pièges du tactile", () => {
  it("aucun champ ne descend sous 16 px au doigt", () => {
    // Sous 16 px, iOS zoome à la mise au point et ne dézoome pas en sortant.
    // mangue-ui l'a compris pour ses champs ; la règle couvre ceux que le
    // produit écrit à la main, et le prochain qui sera écrit.
    expect(read(UI("input"))).toContain("text-base");
    expect(read(UI("input"))).toContain("md:text-sm");
    const css = read(GLOBALS);
    expect(css).toMatch(/textarea,\s*select \{\s*font-size: 16px;/);
    // Ce qui n'a pas de texte à saisir reste en dehors.
    for (const type of ["checkbox", "radio", "range", "submit"]) {
      expect(css).toContain(`[type="${type}"]`);
    }
  });

  it("le défilement de l'app ne remonte pas jusqu'au tirer-pour-rafraîchir", () => {
    const css = read(GLOBALS);
    // `contain` et pas `none` : on coupe la propagation, on garde le rebond.
    expect(css).toMatch(
      /\.app-shell main \{\s*overscroll-behavior: contain;/,
    );
    // Et pas sur `html, body` : sur la landing et le board public, le
    // tirer-pour-rafraîchir est le comportement attendu du navigateur.
    expect(css).not.toMatch(/^(html|body)[^{]*\{[^}]*overscroll-behavior/m);
  });

  it("Tailwind protège toujours ses `hover:` du tactile", () => {
    // C'est ce qui dispense de gater les centaines d'utilitaires `hover:` du
    // dépôt un par un — seuls les `:hover` écrits à la main restent à couvrir.
    // Si un bump de Tailwind revenait en arrière, la garantie tomberait en
    // silence : le survol resterait collé après chaque tap, partout.
    // On vise la DÉFINITION du variant dans le bundle, pas une chaîne de la
    // feuille compilée : `i.static("hover", …)` y enveloppe `&:hover` dans
    // `@media (hover: hover)`. C'est cette enveloppe qui nous dispense de gater
    // les centaines d'utilitaires `hover:` du dépôt un par un.
    const tw = readFileSync(
      join(REPO, "node_modules/tailwindcss/dist/lib.js"),
      "utf8",
    );
    expect(tw).toContain('H("&:hover",[B("@media","(hover: hover)"');
  });

  it("les `:hover` écrits à la main sont neutralisés au doigt", () => {
    const css = read(GLOBALS);
    // Chaque `:hover` de ce fichier qui peint quelque chose doit avoir sa
    // contrepartie sous `@media (hover: none)`, sinon il reste collé après tap.
    expect(css).toContain("@media (hover: none)");
    for (const selector of [
      ".page-editor .page-details-toggle:hover",
      ".page-block-comment-badge:hover",
      ".scratchpad-editor .ProseMirror .scratchpad-section-copy:hover",
    ]) {
      // Deux fois : la règle d'origine, et sa neutralisation.
      expect(css.split(selector).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it("la barre d'état suit le thème réel, et ses couleurs suivent les tokens", () => {
    const script = read(join(REPO, "components/theme-init-script.tsx"));
    expect(script).toContain('name","theme-color"');
    // L'observateur qui garde la balise juste quand on bascule le thème.
    expect(script).toContain("MutationObserver");

    // Les deux hex sont une CONVERSION à la main des tokens de mangue-ui, que
    // `theme-color` ne peut pas lire en `var()`. Si un token bouge, il faut
    // recalculer — ce test est là pour qu'on ne l'apprenne pas sur un téléphone.
    const tokens = read(join(REPO, "node_modules/mangue-ui/src/styles/tokens.css"));
    expect(tokens).toContain("--background: oklch(0.975 0.006 266);"); // clair
    expect(tokens).toContain("--background: oklch(0.135 0.003 250);"); // sombre
    expect(script).toContain('light: "#f5f7fb"');
    expect(script).toContain('dark: "#070809"');
  });
});
