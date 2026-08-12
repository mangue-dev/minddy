// @vitest-environment jsdom
//
// Le garde-fou du REGISTRE de blocs — celui qui rendra l'oubli impossible le
// jour où l'on ajoutera le bloc tableau.
//
// Un bloc est six choses cousues (le nœud, l'entrée « / », l'entrée
// « transformer en », l'icône, les libellés FR/EN, la sérialisation markdown).
// Le compilateur en tient déjà deux : un descripteur auquel il manque un champ
// ne compile pas, et une `labelKey` absente du catalogue ANGLAIS est une erreur
// de type (cf. global.d.ts). Ce fichier tient les autres, celles qu'aucun type
// ne voit :
//
//  - la clé existe aussi dans le catalogue FRANÇAIS, et n'y est pas restée
//    identique à l'anglais par copier-coller ;
//  - chaque nœud du catalogue est réellement MONTÉ (un bloc dont plus personne
//    n'apporte l'extension est un bloc mort) ;
//  - et surtout : le markdown de chaque bloc revient INTACT d'un aller-retour,
//    joué sur un vrai éditeur monté sur le vrai registre.
//
// Ce dernier point est ce qui fait la différence entre un test qui vérifie
// qu'un champ n'est pas vide et un test qui vérifie qu'il dit vrai.

import { describe, expect, it } from "vitest";
import { Editor, getExtensionField, type NodeViewRenderer } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { Markdown } from "tiptap-markdown";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import {
  PAGE_BLOCKS,
  blockById,
  blockExtensions,
  blocksByNodeName,
  slashItems,
  turnIntoItems,
} from "@/components/pages/blocks";

const enPages = en.Pages as Record<string, string | undefined>;
const frPages = fr.Pages as Record<string, string | undefined>;

/** Un éditeur monté sur le VRAI registre, sans une ligne de React. */
function makeEditor(content = "") {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [
      Document,
      Text,
      ...blockExtensions({ headless: true }),
      Markdown.configure({ html: true, linkify: false }),
    ] as never,
  });
}

function md(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

describe("le registre des blocs de page", () => {
  it("n'a ni identité ni nœud en double là où ça compte", () => {
    expect(blockById.size).toBe(PAGE_BLOCKS.length);
    // Le paragraphe DOIT être le premier bloc du menu : c'est le bloc par
    // défaut, et « transformer en » y ramène.
    expect(slashItems()[0].id).toBe("paragraph");
  });

  it("monte une extension par nœud, et aucun bloc orphelin", () => {
    const mounted = new Set(blockExtensions({ headless: true }).map((e) => e.name));
    for (const block of PAGE_BLOCKS) {
      expect(
        mounted.has(block.nodeName),
        `le nœud « ${block.nodeName} » du bloc « ${block.id} » n'est monté par aucun descripteur`
      ).toBe(true);
    }
    // Les trois titres partagent un nœud, les deux listes partagent `listItem` :
    // le dédoublonnage du registre est ce qui permet à chaque fichier de bloc de
    // déclarer de quoi tenir debout seul.
    expect(blocksByNodeName.get("heading")).toHaveLength(3);
    expect(
      blockExtensions({ headless: true }).filter((e) => e.name === "listItem")
    ).toHaveLength(1);
  });

  // MIN-274 : la vue d'une tâche est celle du CARNET, et elle tire le baril
  // `mangue-ui`. Un fichier de bloc qui la nommerait rendrait le registre
  // inimportable hors navigateur — ce fichier entier ne se chargerait plus, et
  // c'est ce qui en fait le garde-fou (cf. lib/cx.ts). D'où le partage : le
  // nœud au registre, la vue injectée par la surface.
  it("laisse la surface poser la vue d'une tâche", () => {
    const view = () => ({}) as never;
    // `addNodeView` n'est pas dans le type union de `config` (une extension nue
    // n'en a pas) : on le lit tel qu'il est réellement posé.
    const taskView = (options?: Parameters<typeof blockExtensions>[0]) => {
      const node = blockExtensions(options).find((e) => e.name === "taskItem");
      const config = node?.config as { addNodeView?: () => unknown };
      return config.addNodeView;
    };

    // Sans injection, `taskItem` garde la vue de tiptap — la case BINAIRE de
    // l'extension amont, qui ne connaît pas les quatre états du plan. C'est
    // dire que l'injection n'est pas un ornement : elle est ce qui rend une
    // tâche de page conforme au reste du produit.
    expect(taskView()?.call(null)).not.toBe(view);
    expect(taskView({ nodeViews: { taskItem: view } })?.call(null)).toBe(view);
    // `headless` reste le dernier mot : la projection markdown ne monte jamais
    // de vue, même si l'appelant en passe une. `null` et non `undefined` — le
    // pourquoi est dans blocks/index.ts, et le test qui compte est plus bas
    // (« le montage headless »).
    expect(
      taskView({ headless: true, nodeViews: { taskItem: view } })
    ).toBeNull();
  });

  it("le schéma du catalogue se monte en entier", () => {
    const editor = makeEditor();
    for (const block of PAGE_BLOCKS) {
      expect(
        editor.schema.nodes[block.nodeName],
        `le nœud « ${block.nodeName} » n'est pas dans le schéma`
      ).toBeTruthy();
    }
    editor.destroy();
  });
});

describe("les libellés des blocs", () => {
  it("existent dans les DEUX catalogues", () => {
    for (const block of PAGE_BLOCKS) {
      expect(enPages[block.labelKey], `Pages.${block.labelKey} manque en anglais`).toBeTruthy();
      expect(frPages[block.labelKey], `Pages.${block.labelKey} manque en français`).toBeTruthy();
    }
  });

  it("sont réellement traduits, pas recopiés", () => {
    // Un libellé identique dans les deux langues est presque toujours un
    // copier-coller oublié. Les exceptions sont des mots qui s'écrivent
    // pareil — elles se déclarent ici, une par une.
    const SAME_IN_BOTH = new Set(["blockCitation", "blockQuote", "blockImage"]);
    const copied = PAGE_BLOCKS.filter(
      (block) =>
        !SAME_IN_BOTH.has(block.labelKey) &&
        enPages[block.labelKey] === frPages[block.labelKey]
    ).map((block) => block.labelKey);
    expect(copied).toEqual([]);
  });

  it("ont une icône, et une icône distincte", () => {
    for (const block of PAGE_BLOCKS) {
      // Une icône lucide est un `forwardRef`, donc un OBJET, pas une fonction.
      expect(block.icon, `pas d'icône sur « ${block.id} »`).toBeTruthy();
    }
    // Deux blocs qui portent la même icône sont deux blocs qu'on ne distingue
    // pas dans le menu « / » — la faute typique du copier-coller de descripteur.
    const shared = new Map<unknown, string[]>();
    for (const block of PAGE_BLOCKS) {
      shared.set(block.icon, [...(shared.get(block.icon) ?? []), block.id]);
    }
    const duplicates = [...shared.values()].filter((ids) => ids.length > 1);
    expect(duplicates).toEqual([]);
  });
});

describe("le menu « / » et « transformer en »", () => {
  it("offrent chacun ce qui les concerne", () => {
    // Tout le catalogue est INSÉRABLE…
    expect(slashItems()).toHaveLength(PAGE_BLOCKS.length);

    // …mais un séparateur et une sous-page ne se TRANSFORMENT pas : il n'y a
    // rien à convertir. C'est précisément ce que `turnInto: false` dit, et ce
    // qu'un registre sans descripteur ne saurait pas dire.
    const editor = makeEditor("Some text");
    const convertible = turnIntoItems(editor).map((item) => item.block.id);
    expect(convertible).not.toContain("divider");
    expect(convertible).not.toContain("subpage");
    expect(convertible).toContain("heading2");
    editor.destroy();
  });

  it("posent VRAIMENT quelque chose, chacun", () => {
    // `insertBlock` retombe sur « effacer la plage, puis convertir » quand le
    // descripteur ne porte pas d'`insert`. Un bloc à la fois `turnInto: false`
    // et sans `insert` avale donc le « /… » et ne pose rien — une entrée de menu
    // qui ne fait rien, sans un mot d'erreur. C'est arrivé aux deux blocs de
    // MIN-280, et rien ne le disait : le nœud est dans le schéma, le markdown
    // revient intact, seul le geste manque.
    const silent = PAGE_BLOCKS.filter(
      (block) => !block.turnInto && !block.insert
    ).map((block) => block.id);
    expect(silent).toEqual([]);
  });

  it("l'image et le fichier demandent leur sélecteur", () => {
    // L'autre moitié du même geste : le descripteur appelle bien le crochet que
    // la surface pose (`storage.<nœud>.pick`, cf. page-editor.tsx). Sans lui,
    // « /image » n'ouvrirait aucune boîte de dialogue.
    for (const [id, node, accept] of [
      ["image", "image", "image/*"],
      ["file", "pageFile", ""],
    ] as const) {
      const editor = makeEditor("/x");
      const asked: string[] = [];
      (editor.storage as unknown as Record<string, { pick: unknown }>)[node].pick =
        (value: string) => asked.push(value);
      blockById.get(id)?.insert?.(editor, { from: 1, to: 3 });
      expect(asked, id).toEqual([accept]);
      editor.destroy();
    }
  });

  it("marquent le bloc actif", () => {
    const editor = makeEditor("## A heading");
    const active = turnIntoItems(editor).filter((item) => item.active);
    expect(active.map((item) => item.block.id)).toEqual(["heading2"]);
    editor.destroy();
  });
});

describe("l'aller-retour markdown de chaque bloc", () => {
  it.each(PAGE_BLOCKS.map((block) => [block.id, block] as const))(
    "%s revient intact",
    (_id, block) => {
      const editor = makeEditor(block.markdown.sample);
      expect(md(editor)).toBe(block.markdown.sample);
      editor.destroy();
    }
  );

  it("chaque échantillon produit BIEN le nœud qu'il annonce", () => {
    // Sans ça, un échantillon qui ne se parse pas (donc relu comme un simple
    // paragraphe) traverserait l'aller-retour sans broncher et ne prouverait
    // rien du bloc.
    for (const block of PAGE_BLOCKS) {
      if (block.id === "paragraph") continue;
      const editor = makeEditor(block.markdown.sample);
      const names = new Set<string>();
      editor.state.doc.descendants((node) => {
        names.add(node.type.name);
      });
      expect(
        names.has(block.nodeName),
        `« ${block.markdown.sample} » ne produit pas de nœud « ${block.nodeName} » (nœuds vus : ${[...names].join(", ")})`
      ).toBe(true);
      editor.destroy();
    }
  });
});

/**
 * `headless` doit VRAIMENT retirer les vues de nœud.
 *
 * Ce que ce test tient, et qu'aucun autre ne voyait : `getExtensionField` de
 * tiptap remonte à l'extension PARENTE dès qu'un champ vaut `undefined`. Un
 * `addNodeView: undefined` posé par `blockExtensions({ headless: true })` ne
 * retirait donc rien — il re-trouvait la vue d'origine. Sous jsdom, personne ne
 * s'en apercevait : React est là, la vue se monte, le markdown sort juste.
 *
 * Dans une fonction serveur, non : `@tiptap/react` porte « use client », donc
 * la vue est une référence CLIENT, et l'appeler lève « Attempted to call
 * ReactNodeViewRenderer() from the server ». C'était l'échec de TOUT outil de
 * page — Numo, le MCP, l'agent — au premier `minddy_get_page`.
 *
 * On regarde donc les extensions telles que tiptap les lira, pas telles qu'on
 * croit les avoir écrites.
 */
describe("le montage headless", () => {
  it("n'expose aucune vue de nœud", () => {
    const withView = blockExtensions({ headless: true }).filter((extension) =>
      Boolean(getExtensionField(extension, "addNodeView"))
    );
    expect(
      withView.map((extension) => extension.name),
      "ces nœuds gardent une vue React hors navigateur"
    ).toEqual([]);
  });

  it("greffe en revanche la vue que la SURFACE apporte à la sous-page", () => {
    // Le pendant du cas précédent : sans lui, « aucune vue » serait aussi vrai
    // d'un `blockExtensions` qui aurait cessé de savoir en poser une. Et c'est
    // la sous-page qu'on regarde, parce que c'est SA vue qui a déménagé du
    // fichier de bloc vers la surface (components/pages/page-editor.tsx).
    const view = (() => null) as unknown as NodeViewRenderer;
    const node = blockExtensions({ nodeViews: { subpage: view } }).find(
      (extension) => extension.name === "subpage"
    );
    const addNodeView = getExtensionField<() => unknown>(
      node!,
      "addNodeView"
    );
    expect(addNodeView?.()).toBe(view);

    // Sans injection, le nœud n'a plus de vue du tout : le bloc se rendrait nu.
    // C'est ce qui garantit qu'aucune surface ne l'oublie en silence.
    const bare = blockExtensions().find((e) => e.name === "subpage");
    expect(getExtensionField(bare!, "addNodeView")).toBeUndefined();
  });
});
