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
import { describe, expect, it } from "vitest";
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
import {
  blockLink,
  blockRange,
  handleBlockLinkClick,
  styledBox,
  deleteBlocks,
  duplicateBlocks,
  insertBlockAround,
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

  it("garde le clic d'un lien de bloc hors de l'extension Link", () => {
    // L'extension attrape TOUT `<a>` du document et fait `window.open` : sur le
    // bloc sous-page, un clic donnait deux navigations — un onglet neuf, et
    // l'ancre suivie dans l'onglet courant.
    const link = document.createElement("a");
    link.className = "page-block-link";
    const inner = document.createElement("span");
    link.append(inner);
    document.body.append(link);

    const plain = new MouseEvent("click", { cancelable: true });
    inner.dispatchEvent(plain);
    expect(handleBlockLinkClick(plain)).toBe(true);
    expect(plain.defaultPrevented).toBe(true);

    // ⌘-clic : on coupe l'extension, mais on laisse le navigateur ouvrir son
    // onglet — il le fait mieux que nous.
    const meta = new MouseEvent("click", { cancelable: true, metaKey: true });
    inner.dispatchEvent(meta);
    expect(handleBlockLinkClick(meta)).toBe(true);
    expect(meta.defaultPrevented).toBe(false);

    // Un lien du TEXTE ne nous regarde pas : l'extension garde la main.
    const other = document.createElement("a");
    document.body.append(other);
    const textLink = new MouseEvent("click", { cancelable: true });
    other.dispatchEvent(textLink);
    expect(handleBlockLinkClick(textLink)).toBe(false);
    expect(textLink.defaultPrevented).toBe(false);

    link.remove();
    other.remove();
  });
});
