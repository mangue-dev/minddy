// @vitest-environment jsdom
//
// Le garde-fou du CHROME du bloc (MIN-268).
//
// Ce que ce fichier tient, et qu'aucun type ne voit :
//
//  - les actions du menu ⋯ opèrent sur une PLAGE de blocs, pas sur un bloc :
//    dupliquer un dépliant emporte son contenu, supprimer trois blocs les
//    supprime tous les trois. C'est la propriété qui décide si l'éditeur
//    « paraît bon », et c'est celle qu'une relecture ne voit pas ;
//  - un bloc dupliqué ne recopie PAS son identité. Deux blocs de même `blockId`
//    donneraient deux ancres identiques et une sauvegarde par bloc (MIN-271)
//    qui écrase l'un par l'autre — silencieusement ;
//  - chaque raccourci déclaré au registre est bien lié, et bascule : celui du
//    bloc actif ramène au paragraphe. Le menu affiche le champ que le clavier
//    déclenche, donc les deux ne peuvent pas diverger ;
//  - la palette des couleurs et les jetons CSS de app/globals.css disent la
//    même chose. C'est le seul lien du dépôt entre un fichier TypeScript et une
//    feuille de style : rien d'autre ne peut l'attraper.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import UniqueID from "@tiptap/extension-unique-id";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/category-colors";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_TYPES,
  PAGE_BLOCKS,
  blockById,
  PAGE_COLORS,
  PAGE_COLOR_ATTRIBUTE,
  PageBlockShortcuts,
  activePageColor,
  blockExtensions,
  pageColorExtensions,
  setPageColor,
  type PageBlockId,
} from "@/components/pages/blocks";
import { BlockFlash, flashBlockAt } from "@/components/pages/block-flash";
import { handleNodeLinkClick } from "@/components/editor-node-link";
import {
  GUTTER_HOVER,
  GUTTER_WIDTH,
  blockLink,
  blockRange,
  styledBox,
  deleteBlocks,
  duplicateBlocks,
  focusDocumentEnd,
  focusDocumentStart,
  insertBlockAround,
  posOfBlockId,
  revealBlock,
  selectBlockAt,
  selectBlockFromHandle,
  selectedBlockCount,
  selectedBlockIds,
  turnBlocksInto,
  withoutBlockIds,
} from "@/components/pages/block-actions";

/** Le vrai éditeur d'une page, moins React : le registre, les couleurs, les
    raccourcis et les ID stables — c'est-à-dire tout ce sur quoi le chrome
    s'appuie. */
function makeEditor(content = "") {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      Document,
      Text,
      ...blockExtensions({ headless: true }),
      ...pageColorExtensions(),
      PageBlockShortcuts,
      UniqueID.configure({
        attributeName: BLOCK_ID_ATTRIBUTE,
        types: BLOCK_ID_TYPES,
      }),
    ] as never,
  });
}

/**
 * Le même éditeur, une fois les ID de bloc posés.
 *
 * `UniqueID` les attribue depuis l'événement `create`, que tiptap émet au tour
 * de boucle SUIVANT — un document lu juste après `new Editor()` n'a donc que
 * des `blockId` à `null`. Ce n'est pas une bizarrerie de test : c'est aussi
 * vrai dans l'app, et c'est pourquoi rien de ce qui dépend de l'identité d'un
 * bloc ne peut se faire au montage.
 */
async function makeIdentifiedEditor(content = "") {
  const editor = makeEditor(content);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

/** Le nom de chaque nœud de premier niveau, dans l'ordre. */
function topLevel(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  return names;
}

/**
 * Frapper un raccourci — par le VRAI chemin, celui du plugin `keymap`.
 *
 * Et pas `editor.commands.keyboardShortcut()`, qui passe par
 * `captureTransaction` : celui-ci retient les transactions au lieu de les
 * appliquer, si bien que l'état de l'éditeur ne bouge pas d'une transaction à
 * l'autre. Une conversion qui en dispatche plusieurs — étaler la sélection,
 * aplatir, convertir — s'y calcule donc trois fois sur le document de départ et
 * lève. Dans un navigateur, le keymap appelle la liaison directement et chaque
 * transaction s'applique : c'est ce chemin-là qu'on veut mesurer.
 */
function press(editor: Editor, shortcut: string): void {
  const keys = shortcut.split("-");
  const key = keys[keys.length - 1];
  const event = new KeyboardEvent("keydown", {
    key,
    altKey: keys.includes("Alt"),
    ctrlKey: keys.includes("Ctrl") || keys.includes("Mod"),
    metaKey: keys.includes("Meta"),
    shiftKey: keys.includes("Shift"),
  });
  editor.view.someProp("handleKeyDown", (handler) =>
    handler(editor.view, event)
  );
}

describe("la plage de blocs", () => {
  it("part du bloc entier, pas du curseur", () => {
    const editor = makeEditor("<p>Premier</p><p>Second</p>");
    editor.commands.setTextSelection(3);
    const range = blockRange(editor);
    expect(range).not.toBeNull();
    expect(selectedBlockCount(editor)).toBe(1);
    // La plage couvre le paragraphe entier, pas les trois caractères devant le
    // curseur : c'est ce qui fait que « dupliquer » duplique un bloc.
    expect(range!.to - range!.from).toBe(editor.state.doc.firstChild!.nodeSize);
    editor.destroy();
  });

  it("couvre TOUS les blocs d'une sélection qui en traverse plusieurs", async () => {
    const editor = await makeIdentifiedEditor(
      "<p>Un</p><p>Deux</p><p>Trois</p>"
    );
    editor.commands.setTextSelection({
      from: 2,
      to: editor.state.doc.content.size - 2,
    });
    expect(selectedBlockCount(editor)).toBe(3);
    expect(selectedBlockIds(editor)).toHaveLength(3);
    editor.destroy();
  });

  it("emporte les enfants quand le bloc en a", () => {
    const editor = makeEditor(
      "<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>"
    );
    selectBlockAt(editor, 0);
    const range = blockRange(editor)!;
    // Un seul bloc de premier niveau — la liste — mais la plage couvre ses deux
    // items : c'est ce que « le bloc part avec ses enfants » veut dire.
    expect(selectedBlockCount(editor)).toBe(1);
    expect(range.to - range.from).toBe(editor.state.doc.firstChild!.nodeSize);
    editor.destroy();
  });
});

describe("dupliquer", () => {
  it("pose la copie juste en dessous, enfants compris", () => {
    const editor = makeEditor(
      "<ul><li><p>Un</p></li><li><p>Deux</p></li></ul><p>Après</p>"
    );
    selectBlockAt(editor, 0);
    expect(duplicateBlocks(editor)).toBe(true);
    expect(topLevel(editor)).toEqual(["bulletList", "bulletList", "paragraph"]);
    const [first, second] = [
      editor.state.doc.child(0),
      editor.state.doc.child(1),
    ];
    expect(second.textContent).toBe(first.textContent);
    expect(second.childCount).toBe(2);
    editor.destroy();
  });

  it("ne recopie PAS l'identité du bloc", async () => {
    const editor = await makeIdentifiedEditor("<p>Un</p>");
    selectBlockAt(editor, 0);
    duplicateBlocks(editor);
    const ids = [
      editor.state.doc.child(0).attrs[BLOCK_ID_ATTRIBUTE],
      editor.state.doc.child(1).attrs[BLOCK_ID_ATTRIBUTE],
    ];
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[1]).not.toBe(ids[0]);
    editor.destroy();
  });

  it("nettoie l'identité en profondeur, pas seulement à la racine", () => {
    const nested = withoutBlockIds([
      {
        type: "bulletList",
        attrs: { [BLOCK_ID_ATTRIBUTE]: "a", other: 1 },
        content: [
          {
            type: "listItem",
            attrs: { [BLOCK_ID_ATTRIBUTE]: "b" },
            content: [],
          },
        ],
      },
    ]);
    expect(nested[0].attrs).toEqual({ other: 1 });
    expect(nested[0].content![0].attrs).toEqual({});
  });
});

describe("supprimer", () => {
  it("emporte toute la sélection", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    editor.commands.setTextSelection({ from: 2, to: 8 });
    expect(selectedBlockCount(editor)).toBe(2);
    expect(deleteBlocks(editor)).toBe(true);
    expect(editor.state.doc.textContent).toBe("Trois");
    editor.destroy();
  });
});

describe("le « + » de la marge", () => {
  it("insère un paragraphe et y amorce le menu « / »", () => {
    const editor = makeEditor("<h1>Titre</h1>");
    expect(insertBlockAround(editor, 0, "below")).toBe(true);
    expect(topLevel(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.state.doc.child(1).textContent).toBe("/");
    editor.destroy();
  });

  it("insère au-dessus quand on le lui demande", () => {
    const editor = makeEditor("<h1>Titre</h1>");
    insertBlockAround(editor, 0, "above");
    expect(topLevel(editor)).toEqual(["paragraph", "heading"]);
    editor.destroy();
  });
});

describe("la réserve cliquable du bas", () => {
  it("ajoute un paragraphe et y met le curseur", () => {
    const editor = makeEditor("<h1>Titre</h1>");
    focusDocumentEnd(editor);
    expect(topLevel(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    editor.destroy();
  });

  it("n'en empile pas quand la fin du document en porte déjà un vide", () => {
    const editor = makeEditor("<h1>Titre</h1><p></p>");
    focusDocumentEnd(editor);
    focusDocumentEnd(editor);
    // Deux clics dans la réserve, un seul paragraphe : le vide sous le texte
    // est de la mise en page, il ne doit pas partir en base.
    expect(topLevel(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    editor.destroy();
  });

  it("écrit à la SUITE, sans toucher au dernier bloc", () => {
    const editor = makeEditor("<p>Un</p><blockquote><p>Deux</p></blockquote>");
    focusDocumentEnd(editor);
    expect(topLevel(editor)).toEqual(["paragraph", "blockquote", "paragraph"]);
    expect(editor.state.doc.child(1).textContent).toBe("Deux");
    editor.destroy();
  });
});

describe("Entrée à la fin du titre", () => {
  it("ouvre une ligne vide en tête du corps, curseur dedans", () => {
    const editor = makeEditor("<p>Déjà écrit</p>");
    focusDocumentStart(editor);
    expect(topLevel(editor)).toEqual(["paragraph", "paragraph"]);
    // La ligne OUVERTE est la première, et elle est vide : le texte déjà écrit
    // descend d'un cran, comme quand on ouvre une ligne n'importe où ailleurs.
    expect(editor.state.doc.child(0).content.size).toBe(0);
    expect(editor.state.doc.child(1).textContent).toBe("Déjà écrit");
    expect(editor.state.selection.$from.parent.content.size).toBe(0);
    editor.destroy();
  });

  it("n'en empile pas quand le corps commence déjà par une ligne vide", () => {
    const editor = makeEditor("<p></p><p>Déjà écrit</p>");
    focusDocumentStart(editor);
    focusDocumentStart(editor);
    expect(topLevel(editor)).toEqual(["paragraph", "paragraph"]);
    expect(editor.state.selection.$from.parent.content.size).toBe(0);
    editor.destroy();
  });
});

describe("le clignement d'un bloc", () => {
  /** Le vrai éditeur, AVEC l'extension du clignement — c'est elle qu'on teste. */
  function flashEditor(content: string) {
    return new Editor({
      element: document.createElement("div"),
      content,
      extensions: [
        Document,
        Text,
        ...blockExtensions({ headless: true }),
        UniqueID.configure({
          attributeName: BLOCK_ID_ATTRIBUTE,
          types: BLOCK_ID_TYPES,
        }),
        BlockFlash,
      ] as never,
    });
  }

  const domAt = (editor: Editor, pos: number) =>
    editor.view.nodeDOM(pos) as HTMLElement;

  it("passe par une DÉCORATION, donc la classe est bien dans le document rendu", () => {
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const pos = 7;
    expect(editor.state.doc.nodeAt(pos)?.type.name).toBe("heading");

    flashBlockAt(editor, pos);
    expect(domAt(editor, pos).classList.contains("page-block-target")).toBe(true);
    editor.destroy();
  });

  it("SURVIT à un re-rendu du nœud — ce qu'une classe posée à la main ne fait pas", () => {
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const pos = 7;

    // Le défaut qu'on garde : ProseMirror surveille le DOM de sa zone éditable
    // et DÉFAIT tout ce qu'il n'a pas écrit. Une classe posée par
    // `classList.add` atterrissait sur un élément que PM remplaçait dans la
    // foulée — mesuré dans le navigateur, sur le vrai éditeur. Ici on force le
    // re-rendu par le chemin le plus court : on change le document.
    flashBlockAt(editor, pos);
    editor.commands.insertContentAt(1, "x");

    const node = editor.state.doc.nodeAt(pos + 1);
    expect(node?.type.name).toBe("heading");
    // La décoration a SUIVI son nœud, qui a bougé d'un cran.
    expect(domAt(editor, pos + 1).classList.contains("page-block-target")).toBe(
      true
    );
    editor.destroy();
  });

  it("n'écrit rien dans le document ni dans l'historique", () => {
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const before = JSON.stringify(editor.getJSON());
    let updates = 0;
    editor.on("update", () => (updates += 1));

    flashBlockAt(editor, 7);

    // Un clignement qui rentrerait dans le document partirait en base et
    // ressortirait dans le markdown que lit l'agent.
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(updates).toBe(0);
    editor.destroy();
  });

  it("s'éteint tout seul, et s'annule", () => {
    // L'éditeur est monté AVANT de figer le temps : tiptap diffère une partie
    // de son montage, et un faux minuteur le laisserait à moitié construit.
    const editor = flashEditor("<p>Avant</p><h2>Cible</h2>");
    const pos = 7;
    const lit = () =>
      domAt(editor, pos).classList.contains("page-block-target");
    vi.useFakeTimers();
    try {
      flashBlockAt(editor, pos);
      expect(lit()).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(lit()).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(lit()).toBe(false);

      // Et l'annulation, qui empêche le minuteur d'un clic d'éteindre le suivant.
      const cancel = flashBlockAt(editor, pos);
      cancel();
      expect(lit()).toBe(false);
    } finally {
      vi.useRealTimers();
      editor.destroy();
    }
  });

  it("retrouve un bloc par son identité, pour l'ancre d'un lien", async () => {
    const editor = await makeIdentifiedEditor("<p>Un</p><p>Deux</p>");
    const id = editor.state.doc.child(1).attrs[BLOCK_ID_ATTRIBUTE] as string;
    expect(posOfBlockId(editor, id)).toBe(editor.state.doc.child(0).nodeSize);
    expect(posOfBlockId(editor, "inconnu")).toBeNull();
    editor.destroy();
  });
});

describe("amener un bloc à l'écran", () => {
  it("saute SEC, et c'est ce qui rend le clignement visible", () => {
    vi.useFakeTimers();
    const editor = new Editor({
      element: document.createElement("div"),
      content: "<p>Avant</p><h2>Cible</h2>",
      extensions: [Document, Text, ...blockExtensions({ headless: true }), BlockFlash] as never,
    });
    const pos = 7;
    const container = document.createElement("div");
    container.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    (editor.view.nodeDOM(pos) as HTMLElement).getBoundingClientRect = () =>
      ({ top: 2_000 }) as DOMRect;
    const calls: ScrollToOptions[] = [];
    container.scrollBy = ((options: ScrollToOptions) => {
      calls.push(options);
    }) as HTMLElement["scrollBy"];

    revealBlock(editor, container, pos, 24);

    // En défilement DOUX, `scrollBy` rend la main tout de suite et la page met
    // jusqu'à une seconde à arriver — or une animation CSS tourne qu'on la voie
    // ou non. Le clignement brûlait son temps pendant le trajet et n'était plus
    // là à l'arrivée : visible sur un bloc proche, invisible sur un bloc loin.
    expect(calls).toHaveLength(1);
    expect(calls[0].behavior).toBe("auto");
    // 2000 - 100 - 24 : le bloc se pose 24 px sous le bord haut, et non collé
    // dessous, où le fil d'Ariane et l'état d'enregistrement le cacheraient.
    expect(calls[0].top).toBe(1_876);
    expect(
      (editor.view.nodeDOM(pos) as HTMLElement).classList.contains(
        "page-block-target"
      )
    ).toBe(true);
    vi.useRealTimers();
    editor.destroy();
  });
});

describe("la teinte du clignement", () => {
  it("n'est PAS l'encre du produit", () => {
    // Le garde-fou d'une régression déjà commise : `--primary` est l'ENCRE de
    // minddy — presque noire en clair, presque blanche en sombre. Un fond
    // d'encre dilué est un gris pâle qui ne se voit pas passer, et le
    // clignement ne désignait alors rien du tout. Il lui faut une teinte
    // d'attention, prise au registre des couleurs de bloc.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const rule = css.slice(
      css.indexOf("@keyframes page-block-pulse"),
      css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("@keyframes page-block-pulse"))
    );
    // La teinte vient du registre des couleurs de bloc, quelle qu'elle soit —
    // ce qui est verrouillé ici, c'est qu'elle n'est PAS l'encre.
    expect(rule).toMatch(/--page-color-[a-z]+/);
    expect(rule).not.toContain("--primary");
  });

  it("tient le fond sous « réduire les animations » au lieu de disparaître", () => {
    // L'autre moitié de la même régression : une animation réduite à néant est
    // une animation invisible. Sans battement, le fond doit RESTER — c'est le
    // minuteur de `flashBlock` qui le retire, pas la durée de l'animation.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const start = css.indexOf(".page-block-target {");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", start));
    const block = reduced.slice(0, reduced.indexOf("}", reduced.indexOf("}") + 1));
    expect(block).toContain("animation: none");
    expect(block).toContain("background-color");
    expect(block).not.toContain("animation-duration");
  });
});

describe("le lien d'un bloc", () => {
  it("est l'URL de la page plus l'ancre, et remplace l'ancre existante", () => {
    expect(blockLink("https://minddy.app/p/42", "abc")).toBe(
      "https://minddy.app/p/42#abc"
    );
    expect(blockLink("https://minddy.app/p/42#old", "abc")).toBe(
      "https://minddy.app/p/42#abc"
    );
  });

  it("vise un bloc réellement identifié", async () => {
    const editor = await makeIdentifiedEditor("<p>Un</p>");
    selectBlockAt(editor, 0);
    expect(selectedBlockIds(editor)).toHaveLength(1);
    editor.destroy();
  });
});

describe("les couleurs", () => {
  it("posent un NOM de palette, jamais une couleur", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(setPageColor(editor, "text", "red")).toBe(true);
    expect(editor.getHTML()).toContain(`${PAGE_COLOR_ATTRIBUTE.text}="red"`);
    expect(editor.getHTML()).not.toMatch(/#[0-9a-f]{6}/i);
    editor.destroy();
  });

  it("texte et fond sont deux marks : poser l'une n'efface pas l'autre", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    setPageColor(editor, "text", "red");
    setPageColor(editor, "background", "blue");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(activePageColor(editor, "text")).toBe("red");
    expect(activePageColor(editor, "background")).toBe("blue");
    editor.destroy();
  });

  it("se retirent", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection({ from: 1, to: 3 });
    setPageColor(editor, "text", "red");
    setPageColor(editor, "text", null);
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(activePageColor(editor, "text")).toBeNull();
    editor.destroy();
  });

  it("couvrent TOUTE une sélection multi-blocs d'un seul appel", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p>");
    editor.commands.setTextSelection({ from: 1, to: 8 });
    setPageColor(editor, "text", "green");
    const html = editor.getHTML();
    expect(html.match(/data-page-text="green"/g)).toHaveLength(2);
    editor.destroy();
  });
});

describe("la palette et ses jetons CSS", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("est CELLE du produit, pas une seconde palette", () => {
    expect([...PAGE_COLORS]).toEqual(
      CATEGORY_COLORS.map((hex) => CATEGORY_COLOR_NAMES[hex])
    );
  });

  it("a, pour chaque couleur, sa teinte source et ses deux règles", () => {
    for (const hex of CATEGORY_COLORS) {
      const name = CATEGORY_COLOR_NAMES[hex];
      // La teinte source recopie EXACTEMENT le hex de lib/category-colors.ts —
      // c'est le seul endroit où les deux se rencontrent.
      expect(css, `--page-ink-${name} manque ou diverge de ${hex}`).toContain(
        `--page-ink-${name}: ${hex};`
      );
      expect(css, `--page-color-${name} n'est pas défini`).toContain(
        `--page-color-${name}:`
      );
      expect(css, `pas de règle de texte pour ${name}`).toContain(
        `[data-page-text="${name}"]`
      );
      expect(css, `pas de règle de fond pour ${name}`).toContain(
        `[data-page-back="${name}"]`
      );
    }
  });

  it("donne au thème sombre sa propre valeur pour chacune", () => {
    const dark = css.slice(
      css.indexOf(".dark {", css.indexOf("--page-ink-red"))
    );
    for (const name of PAGE_COLORS) {
      expect(dark, `${name} n'a pas de valeur en thème sombre`).toContain(
        `--page-color-${name}:`
      );
    }
  });
});

/**
 * La gouttière se survole ELLE-MÊME.
 *
 * L'extension de la poignée n'écoute que le `mousemove` de la vue ProseMirror :
 * hors de cette boîte, rien ne se passe, et la bande vide à gauche du texte —
 * celle où l'on va justement chercher la poignée — était morte. La réparation
 * est une règle de style : un rembourrage à gauche étend la boîte de la vue
 * sous la gouttière, et une marge négative exactement opposée remet le texte où
 * il était.
 *
 * Trois valeurs doivent coïncider, et aucun type ne les regarde : la RÉSERVE
 * que la colonne laisse à gauche (`md:pl-24`), le rembourrage de la règle, et
 * la marge négative qui l'annule. Un déséquilibre d'un pixel entre les deux
 * dernières décale le corps sous son titre. Un rembourrage plus étroit que la
 * réserve laisse une bande morte au bord gauche — c'est le défaut mesuré au
 * navigateur sur la première version : la poignée sortait quand on s'arrêtait
 * à 25 px du texte, et pas quand on s'arrêtait à 70 px, c'est-à-dire pas quand
 * on visait la gouttière. Un rembourrage plus LARGE, lui, sortirait la boîte
 * de la colonne.
 */
describe("la surface de survol de la gouttière", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const rule = css.slice(
    css.indexOf(".page-editor[data-gutter] .ProseMirror {"),
    css.indexOf("}", css.indexOf(".page-editor[data-gutter] .ProseMirror {"))
  );

  it("couvre TOUTE la réserve de la colonne, pas seulement les boutons", () => {
    expect(rule, "la règle a disparu de app/globals.css").toContain(
      "padding-left"
    );
    expect(rule).toContain(`padding-left: ${GUTTER_HOVER}px;`);
    // Le garde-fou du défaut d'origine, dit en une ligne : la bande de survol
    // est plus large que les boutons, elle ne s'arrête pas à eux.
    expect(GUTTER_HOVER).toBeGreaterThan(GUTTER_WIDTH);
  });

  it("ne déplace pas le texte : la marge annule le rembourrage", () => {
    expect(rule).toContain(`margin-left: -${GUTTER_HOVER}px;`);
  });

  it("vaut exactement la réserve que la colonne du document se donne", () => {
    // `md:pl-24` = 6rem = 96 px. C'est la colonne qui décide de la largeur de
    // la gouttière ; la règle de style ne fait que la recopier. Si l'une des
    // deux bouge sans l'autre, ou bien la boîte sort de la colonne, ou bien il
    // reste une bande morte — les deux sont invisibles à la relecture.
    const view = readFileSync(
      join(process.cwd(), "components/pages/page-view.tsx"),
      "utf8"
    );
    const rem = GUTTER_HOVER / 16;
    expect(view, `la colonne n'a plus md:pl-${rem * 4}`).toContain(
      `md:pl-${rem * 4}`
    );
  });

  it("n'est pas allumée là où il n'y a pas de gouttière", () => {
    // La règle est conditionnée à `[data-gutter]`, que page-editor.tsx ne pose
    // qu'en édition : une page publique ou une impression n'a pas de réserve à
    // gauche, et la marge négative y ferait sortir le texte de sa colonne.
    const editor = readFileSync(
      join(process.cwd(), "components/pages/page-editor.tsx"),
      "utf8"
    );
    expect(editor).toContain("data-gutter={editor && editable");
  });

  it("laisse aux boutons leur propre largeur, plus étroite", () => {
    const gutter = readFileSync(
      join(process.cwd(), "components/pages/block-gutter.tsx"),
      "utf8"
    );
    expect(gutter).toContain("style={{ width: GUTTER_WIDTH }}");
  });
});

/**
 * « Transformer en » sur une PLAGE (MIN-274 bis).
 *
 * Le défaut d'origine : une liste de trois items, convertie depuis la poignée,
 * ressortait en liste numérotée d'UN item suivie de deux paragraphes nus. La
 * poignée pose une `NodeSelection` sur le bloc entier, ce que les commandes de
 * liste de tiptap ne savent pas lire — elles retombent sur un chemin générique
 * qui ne rattrape que le premier bloc. Rien ne le signale : la conversion
 * « réussit », et c'est le document qui est faux.
 *
 * Ces cas-là sont écrits en NOMBRE d'items exprès : c'est ce que l'œil voit à
 * l'écran, et c'est exactement ce qui manquait.
 */
describe("« transformer en »", () => {
  const LIST =
    "<ul><li><p>Un</p></li><li><p>Deux</p></li><li><p>Trois</p></li></ul>";
  const turn = (editor: Editor, id: PageBlockId) =>
    turnBlocksInto(editor, blockById.get(id)!);

  /** Le nom de chaque bloc de premier niveau, avec son nombre d'enfants. */
  function outline(editor: Editor): string[] {
    const out: string[] = [];
    editor.state.doc.forEach((node) =>
      out.push(`${node.type.name}:${node.childCount}`)
    );
    return out;
  }

  it("convertit la liste ENTIÈRE, pas son premier item", () => {
    const editor = makeEditor(LIST);
    // Exactement ce que fait un clic sur la poignée.
    selectBlockAt(editor, 0);
    turn(editor, "orderedList");
    expect(outline(editor)).toEqual(["orderedList:3"]);
    editor.destroy();
  });

  it("donne un bloc par item quand la cible n'est pas une liste", () => {
    const editor = makeEditor(LIST);
    selectBlockAt(editor, 0);
    turn(editor, "heading2");
    expect(outline(editor)).toEqual(["heading:1", "heading:1", "heading:1"]);
    editor.destroy();
  });

  it("DÉLISTE — c'est le sens que « transformer en » n'avait pas", () => {
    // `setParagraph` et `toggleBlockquote` ne sortent pas les items de leur
    // liste : les deux entrées de menu ne faisaient donc, littéralement, rien.
    const toParagraphs = makeEditor(LIST);
    selectBlockAt(toParagraphs, 0);
    turn(toParagraphs, "paragraph");
    expect(outline(toParagraphs)).toEqual([
      "paragraph:1",
      "paragraph:1",
      "paragraph:1",
    ]);
    toParagraphs.destroy();

    const toQuote = makeEditor(LIST);
    selectBlockAt(toQuote, 0);
    turn(toQuote, "quote");
    expect(outline(toQuote)).toEqual(["blockquote:3"]);
    toQuote.destroy();
  });

  it("rassemble une sélection MÊLÉE en une seule liste", () => {
    const editor = makeEditor(
      "<p>Un</p><ul><li><p>Deux</p></li><li><p>Trois</p></li></ul>"
    );
    editor.commands.setTextSelection({
      from: 1,
      to: editor.state.doc.content.size - 2,
    });
    expect(selectedBlockCount(editor)).toBe(2);
    turn(editor, "orderedList");
    // Un paragraphe et deux items font trois items — pas un item et une liste
    // orpheline.
    expect(outline(editor)).toEqual(["orderedList:3"]);
    editor.destroy();
  });

  it("sort le contenu d'un dépliant au lieu de le laisser dedans", () => {
    const editor = makeEditor(
      "<div data-type='details'><div data-type='detailsSummary'>Résumé</div><div data-type='detailsContent'><p>Corps</p></div></div>"
    );
    selectBlockAt(editor, 0);
    turn(editor, "paragraph");
    expect(outline(editor)).toEqual(["paragraph:1", "paragraph:1"]);
    editor.destroy();
  });

  it("ne bouge pas quand on redemande le bloc déjà actif", () => {
    const editor = makeEditor(LIST);
    selectBlockAt(editor, 0);
    turn(editor, "bulletList");
    expect(outline(editor)).toEqual(["bulletList:3"]);
    editor.destroy();
  });
});

/**
 * La sélection multi-blocs, et ce qui l'effaçait (MIN-274 bis).
 *
 * Le geste existait — balayer plusieurs blocs à la souris, le menu ⋯ annonce
 * « 3 blocs » et agit sur les trois. Ce qui manquait tenait au dernier
 * centimètre : aller CHERCHER la poignée ramenait la sélection au seul bloc
 * qu'elle survole, donc la sélection ne survivait jamais jusqu'au menu.
 */
describe("la poignée face à une sélection existante", () => {
  it("garde une sélection multi-blocs qui contient le bloc survolé", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    editor.commands.setTextSelection({ from: 1, to: 14 });
    expect(selectedBlockCount(editor)).toBe(3);

    // La poignée du DEUXIÈME bloc — au milieu de la sélection.
    const second = editor.state.doc.firstChild!.nodeSize;
    expect(selectBlockFromHandle(editor, second, false)).toBe(true);
    expect(selectedBlockCount(editor)).toBe(3);
    editor.destroy();
  });

  it("repart d'un seul bloc quand on vise HORS de la sélection", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    const first = editor.state.doc.firstChild!.nodeSize;
    editor.commands.setTextSelection({ from: 1, to: 8 });
    expect(selectedBlockCount(editor)).toBe(2);

    const third = first + editor.state.doc.child(1).nodeSize;
    expect(selectBlockFromHandle(editor, third, false)).toBe(true);
    expect(selectedBlockCount(editor)).toBe(1);
    editor.destroy();
  });

  it("ne garde rien quand un seul bloc était sélectionné", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p>");
    selectBlockAt(editor, 0);
    const second = editor.state.doc.firstChild!.nodeSize;
    selectBlockFromHandle(editor, second, false);
    expect(selectedBlockCount(editor)).toBe(1);
    expect(blockRange(editor)!.from).toBe(second);
    editor.destroy();
  });

  it("⇧-clic étend jusqu'au bloc visé", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p><p>Trois</p>");
    selectBlockAt(editor, 0);
    const third =
      editor.state.doc.firstChild!.nodeSize +
      editor.state.doc.child(1).nodeSize;
    expect(selectBlockFromHandle(editor, third, true)).toBe(true);
    expect(selectedBlockCount(editor)).toBe(3);
    editor.destroy();
  });
});

describe("les raccourcis de conversion", () => {
  it("sont déclarés au registre, pas dans le chrome", () => {
    // Les blocs qui portent un raccourci sont exactement ceux qu'on convertit
    // à la volée en écrivant. Un raccourci sur un bloc non convertible ne
    // pourrait rien faire.
    for (const block of PAGE_BLOCKS) {
      if (!block.shortcut) continue;
      expect(
        block.turnInto,
        `« ${block.id} » a un raccourci sans conversion`
      ).toBeTruthy();
      expect(block.shortcut.keys).toMatch(/^(Mod|Shift|Alt)-/);
      expect(block.shortcut.display.length).toBeGreaterThan(0);
    }
  });

  it("n'ont pas deux blocs sur la même combinaison", () => {
    const seen = new Map<string, string>();
    for (const block of PAGE_BLOCKS) {
      if (!block.shortcut) continue;
      expect(
        seen.get(block.shortcut.keys),
        block.shortcut.keys
      ).toBeUndefined();
      seen.set(block.shortcut.keys, block.id);
    }
    // Ceux du carnet et des extensions tiptap, à l'identique : un utilisateur
    // qui passe d'une note à une page ne réapprend rien.
    expect(seen.get("Mod-Alt-1")).toBe("heading1");
    expect(seen.get("Mod-Shift-8")).toBe("bulletList");
    expect(seen.get("Mod-Shift-9")).toBe("taskList");
  });

  it("sont réellement liés, et basculent", () => {
    const editor = makeEditor("<p>Un texte</p>");
    editor.commands.setTextSelection(2);

    // Le registre monte la liaison : ⌘⌥2 convertit…
    expect(editor.commands.keyboardShortcut("Mod-Alt-2")).toBe(true);
    expect(editor.state.doc.firstChild!.type.name).toBe("heading");
    expect(editor.state.doc.firstChild!.attrs.level).toBe(2);

    // …et la même combinaison ramène au paragraphe. Sans cette bascule
    // uniforme, `⌘⌥1` basculerait (Heading) et `⌘⌥D` non (Details).
    expect(editor.commands.keyboardShortcut("Mod-Alt-2")).toBe(true);
    expect(editor.state.doc.firstChild!.type.name).toBe("paragraph");
    editor.destroy();
  });

  it("convertissent la liste entière, comme le menu ⋯", () => {
    // Même défaut, autre porte : le raccourci lit la même sélection que le
    // menu, il devait donc gagner la même correction.
    const editor = makeEditor(
      "<ul><li><p>Un</p></li><li><p>Deux</p></li><li><p>Trois</p></li></ul>"
    );
    selectBlockAt(editor, 0);
    press(editor, "Mod-Shift-9");
    expect(topLevel(editor)).toEqual(["taskList"]);
    expect(editor.state.doc.firstChild!.childCount).toBe(3);
    editor.destroy();
  });

  it("valent aussi pour une sélection de plusieurs blocs", () => {
    const editor = makeEditor("<p>Un</p><p>Deux</p>");
    editor.commands.setTextSelection({ from: 1, to: 8 });
    editor.commands.keyboardShortcut("Mod-Alt-3");
    expect(topLevel(editor)).toEqual(["heading", "heading"]);
    editor.destroy();
  });
});

/**
 * Les deux pièges du DOM des vues de nœud REACT (MIN-272).
 *
 * Ils se ressemblent : dans les deux cas, l'éditeur traite un élément produit
 * par tiptap-react comme s'il venait du document, et se trompe de cible.
 */
describe("le DOM d'une vue de nœud", () => {
  it("mesure l'élément qui porte le style, pas le conteneur de tiptap-react", () => {
    // `view.nodeDOM` rend un `div.react-renderer` NU : tout le style du bloc —
    // son rembourrage, sa hauteur de ligne — vit dans le `NodeViewWrapper`
    // qu'il contient. Mesurer le conteneur revient à mesurer rien, et la
    // gouttière flottait au-dessus du texte d'exactement le `py-` du bloc.
    const container = document.createElement("div");
    container.className = "react-renderer";
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-node-view-wrapper", "");
    container.append(wrapper);

    expect(styledBox(container)).toBe(wrapper);

    // Un bloc ordinaire (un paragraphe rendu par ProseMirror) se mesure tel quel.
    const paragraph = document.createElement("p");
    paragraph.append(document.createTextNode("texte"));
    expect(styledBox(paragraph)).toBe(paragraph);

    // Un conteneur vide n'a rien où descendre : on ne rend pas `null`.
    const empty = document.createElement("div");
    empty.className = "react-renderer";
    expect(styledBox(empty)).toBe(empty);
  });

  it("garde le clic d'une ancre de vue de nœud hors de l'extension Link", () => {
    // L'extension attrape TOUT `<a>` du document et fait `window.open` : sur le
    // bloc sous-page comme sur la pilule d'une mention, un clic donnait deux
    // navigations — un onglet neuf, et l'ancre suivie dans l'onglet courant.
    const link = document.createElement("a");
    link.className = "editor-node-link";
    const inner = document.createElement("span");
    link.append(inner);
    document.body.append(link);

    const plain = new MouseEvent("click", { cancelable: true });
    inner.dispatchEvent(plain);
    expect(handleNodeLinkClick(plain)).toBe(true);
    expect(plain.defaultPrevented).toBe(true);

    // ⌘-clic : on coupe l'extension, mais on laisse le navigateur ouvrir son
    // onglet — il le fait mieux que nous.
    const meta = new MouseEvent("click", { cancelable: true, metaKey: true });
    inner.dispatchEvent(meta);
    expect(handleNodeLinkClick(meta)).toBe(true);
    expect(meta.defaultPrevented).toBe(false);

    // Un lien du TEXTE ne nous regarde pas : l'extension garde la main.
    const other = document.createElement("a");
    document.body.append(other);
    const textLink = new MouseEvent("click", { cancelable: true });
    other.dispatchEvent(textLink);
    expect(handleNodeLinkClick(textLink)).toBe(false);
    expect(textLink.defaultPrevented).toBe(false);

    link.remove();
    other.remove();
  });
});
