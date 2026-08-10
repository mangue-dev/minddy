import { Extension, type Editor } from "@tiptap/core";
import { DOMParser as PMDOMParser, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { containsMarkdownTaskLine } from "@/lib/scratchpad";

/**
 * Coller une liste de tâches markdown dans le carnet donne des TÂCHES — même
 * quand le presse-papier porte aussi une version HTML.
 *
 * tiptap-markdown ne relit le texte collé en markdown que par
 * `clipboardTextParser`, et ProseMirror ne consulte ce parseur QUE si le
 * presse-papier n'a rien d'autre que du texte :
 *
 *     asText = !!text && (plainText || inCode || !html)   // parseFromClipboard
 *
 * Or presque toute source riche — un éditeur, une page web, un chat qui rend le
 * markdown — dépose aussi un `text/html`, et c'est lui qui gagne. Les `- [ ]` y
 * sont déjà rendus (en simples puces, quand la source ne connaît pas les listes
 * de tâches), et le carnet reprend ces puces telles quelles : les cases à cocher
 * se perdent en chemin, sans que rien ne le signale.
 *
 * On reprend donc la main quand le TEXTE BRUT porte des marqueurs de tâche : le
 * presse-papier est alors du markdown, quoi qu'en dise son HTML, et on le relit
 * par le même chemin que tiptap-markdown emploie pour un collage sans HTML
 * (même parseur, même `parseSlice`) — la note est un document markdown, et ses
 * tâches sont sa matière première.
 *
 * Hors de ce cas, rien ne change : coller une page web reste un collage riche.
 */

/** Le `<body>` enveloppe est celui de tiptap-markdown : sans lui, le parseur du
 *  navigateur déplace les nœuds de tête et mange les blancs de bord. */
function elementFromString(value: string): HTMLElement {
  return new window.DOMParser().parseFromString(`<body>${value}</body>`, "text/html")
    .body;
}

/** tiptap-markdown ajoute son parseur au storage sans augmenter les types de TipTap. */
interface MarkdownStorage {
  markdown: {
    parser: { parse(content: string, options?: { inline?: boolean }): string };
  };
}

/** Le curseur est-il DANS un item de liste (tâche ou puce) ? */
function inListItem(editor: Editor): boolean {
  const $from = editor.state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "taskItem" || name === "listItem") return true;
  }
  return false;
}

/**
 * Relit `text` en markdown et l'insère à la sélection. Rend `false` — sans rien
 * toucher — quand ce texte ne porte pas de tâche, ou quand il ne donne rien.
 *
 * **Ce qui décide de la forme du collage, c'est où est le curseur**, et c'est
 * toute la différence entre une sous-tâche importée et une sous-tâche perdue :
 *
 *  - DANS une liste, la tranche reste « ouverte » : sa première tâche se fond
 *    dans celle qu'on est en train d'écrire (ou remplace la tâche vide où l'on
 *    vient d'appuyer sur Entrée), et la suite s'accroche à la liste en place.
 *  - AILLEURS — dans un paragraphe de prose, sur une ligne vide, dans un titre —
 *    cette ouverture APLATISSAIT l'arbre : la première tâche fusionnait avec le
 *    paragraphe, et ses sous-tâches, ayant perdu le parent qui les portait,
 *    remontaient au premier niveau. La liste arrive donc en BLOC
 *    (`openStart`/`openEnd` à 0), entière, avec ses niveaux.
 */
export function pasteScratchpadMarkdown(editor: Editor, text: string): boolean {
  if (!containsMarkdownTaskLine(text)) return false;
  const parser = (editor.storage as unknown as MarkdownStorage).markdown?.parser;
  if (!parser) return false;

  const view = editor.view;
  const asBlock = !inListItem(editor);
  const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(
    elementFromString(
      asBlock ? parser.parse(text) : parser.parse(text, { inline: true })
    ),
    asBlock
      ? { preserveWhitespace: true }
      : { preserveWhitespace: true, context: view.state.selection.$from }
  );
  if (slice.content.size === 0) return false;

  view.dispatch(
    view.state.tr
      .replaceSelection(asBlock ? new Slice(slice.content, 0, 0) : slice)
      .scrollIntoView()
      .setMeta("paste", true)
      .setMeta("uiEvent", "paste")
  );
  return true;
}

export const PasteMarkdownTasks = Extension.create({
  name: "pasteMarkdownTasks",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("pasteMarkdownTasks"),
        props: {
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data) return false;
            const text = data.getData("text/plain");
            // Sans HTML concurrent, tiptap-markdown a déjà fait le travail.
            if (!text || !data.getData("text/html")) return false;
            return pasteScratchpadMarkdown(editor, text);
          },
        },
      }),
    ];
  },
});
