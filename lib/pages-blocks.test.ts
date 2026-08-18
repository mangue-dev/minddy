// @vitest-environment jsdom
//
// The safeguard of the block REGISTER — the one that will make forgetting impossible on
// day when we will add the table block.
//
// A block is six things stitched together (the node, the “/” entry, the entry
// “transform into”, icon, FR/EN labels, markdown serialization).
// The compiler already has two: a descriptor missing a field
// does not compile, and a `labelKey` missing from the ENGLISH catalog is an error
// of type (see global.d.ts). This file holds the others, those that no type
// ne voit :
//
// - the key also exists in the FRENCH catalog, and did not remain there
// identical to English by copy-paste;
// - each node in the catalog is actually MOUNTED (a block of which no one
// does not bring the extension is a dead block);
// - and above all: the markdown of each block returns INTACT from a round trip,
// played on a real editor mounted on the real registry.
//
// This last point is what makes the difference between a test which checks
// that a field is not empty and a test which verifies that it is true.

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

/** An editor mounted on the REAL registry, without a line of React. */
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
    // The paragraph MUST be the first block of the menu: it is the block by
    // default, and “transform to” brings it back.
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
    // All three titles share a node, both lists share `listItem`:
    // register deduplication is what allows each block file to
    // declare enough to stand alone.
    expect(blocksByNodeName.get("heading")).toHaveLength(3);
    expect(
      blockExtensions({ headless: true }).filter((e) => e.name === "listItem")
    ).toHaveLength(1);
  });

  // MIN-274: the view of a task is that of the NOTEBOOK, and it pulls the barrel
  // `mangue-ui`. A block file naming it would make the registry
  // unimportable outside browser — this entire file would no longer load, and
  // this is what makes it the safeguard (see lib/cx.ts). Hence the sharing: the
  // node to the register, the view injected by the surface.
  it("laisse la surface poser la vue d'une tâche", () => {
    const view = () => ({}) as never;
    // `addNodeView` is not in the union type of `config` (a bare extension
    // does not have one): we read it as it is actually posed.
    const taskView = (options?: Parameters<typeof blockExtensions>[0]) => {
      const node = blockExtensions(options).find((e) => e.name === "taskItem");
      const config = node?.config as { addNodeView?: () => unknown };
      return config.addNodeView;
    };

    // Without injection, `taskItem` keeps the view of tiptap — the BINARY box of
    // the upstream extension, which does not know the four states of the plan. It is
    // say that the injection is not an ornament: it is what makes a
    // page task consistent with the rest of the product.
    expect(taskView()?.call(null)).not.toBe(view);
    expect(taskView({ nodeViews: { taskItem: view } })?.call(null)).toBe(view);
    // `headless` remains the last word: the markdown projection never goes up
    // view, even if the caller passes one. `null` and not `undefined` — the
    // why is in blocks/index.ts, and the test that counts is lower
    // (“headless editing”).
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
    // Identical wording in both languages ​​is almost always a
    // forgotten copy-paste. The exceptions are words that are written
    // the same — they declare themselves here, one by one.
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
      // A lucid icon is a `forwardRef`, therefore an OBJECT, not a function.
      expect(block.icon, `pas d'icône sur « ${block.id} »`).toBeTruthy();
    }
    // Two blocks that bear the same icon are two blocks that cannot be distinguished
    // not in the “/” menu — the typical descriptor copy-paste fault.
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
    // The entire catalog is INSERTABLE…
    expect(slashItems()).toHaveLength(PAGE_BLOCKS.length);

    // …but a separator and a subpage do not TRANSFORM: there is no
    // nothing to convert. This is precisely what `turnInto: false` says, and this
    // qu'un registre sans descripteur ne saurait pas dire.
    const editor = makeEditor("Some text");
    const convertible = turnIntoItems(editor).map((item) => item.block.id);
    expect(convertible).not.toContain("divider");
    expect(convertible).not.toContain("subpage");
    expect(convertible).toContain("heading2");
    editor.destroy();
  });

  it("posent VRAIMENT quelque chose, chacun", () => {
    // `insertBlock` falls back to “clear range, then convert” when the
    // descriptor does not carry a `insert`. One block at a time `turnInto: false`
    // and without `insert` therefore swallows the “/…” and does not put anything — a menu entry
    // which does nothing, without an error word. It happened to both blocks of
    // MIN-280, and nothing said it: the node is in the diagram, the markdown
    // returns intact, only the gesture is missing.
    const silent = PAGE_BLOCKS.filter(
      (block) => !block.turnInto && !block.insert
    ).map((block) => block.id);
    expect(silent).toEqual([]);
  });

  it("l'image et le fichier demandent leur sélecteur", () => {
    // The other half of the same gesture: the descriptor calls the hook that
    // the surface sets (`storage.<node>.pick`, cf. page-editor.tsx). Without it,
    // “/image” would not open any dialog box.
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
    // Without that, a sample which does not parse (therefore reread as a simple
    // paragraph) would cross the round trip without flinching and would not prove
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
 * `headless` should REALLY remove node views.
 *
 * What this test holds, and which no others saw: `getExtensionField` from
 * tiptap goes back to the PARENT extension as soon as a field is equal to `undefined`. A
 * `addNodeView: undefined` placed by `blockExtensions({ headless: true })` did not
 * therefore removed nothing — it re-found the original view. Under jsdom, no one
 * noticed: React is there, the view goes up, the markdown just comes out.
 *
 * In a server function, no: `@tiptap/react` carries “use client”, so
 * the view is a CUSTOMER reference, and calling it raises “Attempted to call
 * ReactNodeViewRenderer() from the server”. It was the failure of ANY tool from
 * page — Numo, the MCP, the agent — at the first `minddy_get_page`.
 *
 * So we look at the extensions as tiptap will read them, not as we
 * think we have them written.
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
    // The counterpart of the previous case: without it, “no view” would also be true
    // of a `blockExtensions` who would have ceased to know how to place one. And it is
    // the subpage we are looking at, because it is HIS view which has moved from
    // block file to surface (components/pages/page-editor.tsx).
    const view = (() => null) as unknown as NodeViewRenderer;
    const node = blockExtensions({ nodeViews: { subpage: view } }).find(
      (extension) => extension.name === "subpage"
    );
    const addNodeView = getExtensionField<() => unknown>(
      node!,
      "addNodeView"
    );
    expect(addNodeView?.()).toBe(view);

    // Without injection, the node no longer has a view at all: the block would be rendered bare.
    // This is what ensures that no surface silently forgets it.
    const bare = blockExtensions().find((e) => e.name === "subpage");
    expect(getExtensionField(bare!, "addNodeView")).toBeUndefined();
  });
});
