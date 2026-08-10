// Les DEUX nœuds de tâche du carnet, sans une ligne de React : le schéma, les
// attributs et le round-trip markdown. La vue (case à cocher, menu ⋯, raccourcis
// de survol) vit dans scratchpad-task.tsx, qui greffe son `addNodeView` sur
// `ScratchpadTaskItemBase`.
//
// Ce découpage n'est pas cosmétique : c'est ce qui rend le round-trip
// TESTABLE (lib/scratchpad-nesting.test.ts monte un vrai éditeur sur ces deux
// nœuds, sous jsdom, sans avoir à monter React). Les sous-tâches se perdaient
// entre le markdown et l'éditeur sans que rien ne le dise — la seule chose qui
// le voit, c'est un aller-retour joué en entier.

import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { PlanTaskState } from "@/lib/plan";
import { TASK_MARKER_BY_STATE } from "@/lib/scratchpad";
import { scratchpadTaskMarkdownIt } from "@/components/scratchpad/task-markdown";

/**
 * La tâche du carnet : les QUATRE états du plan (au lieu du `checked` binaire de
 * TipTap), portés par l'attribut `state` et sérialisés en `[ ]`/`[~]`/`[x]`/`[-]`.
 *
 * `nested: true` n'est pas un détail : c'est lui qui donne au nœud le `content`
 * `paragraph block*`, donc le droit de porter une sous-liste. Sans lui, une
 * sous-tâche collée n'a nulle part où atterrir et le carnet s'aplatit. Il est
 * posé ICI, sur le nœud de base, pour que la vue (scratchpad-task.tsx) n'ait
 * qu'à l'`extend` — `configure` étant lui-même un `extend`, l'option suit.
 */
export const ScratchpadTaskItemBase = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      state: {
        default: "pending" as PlanTaskState,
        // Entrée en bout de tâche = une tâche NEUVE, donc « à faire » : sans
        // ça, `splitListItem` recopie les attributs de la ligne coupée et la
        // suivante naît déjà cochée (barrée, comptée comme faite). C'est le
        // même réglage que l'attribut `checked` de TaskItem en amont.
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-state") ?? "pending",
        renderHTML: (attributes: { state?: string }) => ({
          "data-state": attributes.state ?? "pending",
        }),
      },
    };
  },

  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: any, node: any) {
          const s = node.attrs.state as PlanTaskState;
          state.write(`${TASK_MARKER_BY_STATE[s] ?? "[ ]"} `);
          state.renderContent(node);
        },
        // Our markdown-it rule sets data-type/data-state directly, so the
        // default checkbox DOM rewrite must not run.
        parse: { updateDOM() {} },
      },
    };
  },
}).configure({ nested: true });

export const ScratchpadTaskList = TaskList.extend({
  /**
   * `tight` — la liste s'écrit SANS ligne blanche entre ses items.
   *
   * prosemirror-markdown lit cet attribut sur le nœud, et retombe sinon sur une
   * option que tiptap-markdown ne renseigne jamais : une liste sans `tight` part
   * donc en liste « lâche ». tiptap-markdown pose bien l'attribut — mais
   * seulement sur `bulletList` et `orderedList` (`MarkdownTightLists`), jamais
   * sur `taskList`, qu'il ne connaît pas. Le carnet enregistrait ainsi une ligne
   * blanche entre CHAQUE tâche, invisible à l'écran et bien réelle dans le
   * markdown — c'est ce que lisaient le prompt copié, l'agent et le MCP.
   *
   * `rendered: false` : c'est une consigne de sérialisation, elle n'a rien à
   * faire dans le DOM de l'éditeur ni dans un presse-papier HTML.
   */
  addAttributes() {
    return {
      ...this.parent?.(),
      tight: { default: true, rendered: false },
    };
  },

  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(
          this: { editor: { storage: Record<string, any> } },
          state: any,
          node: any
        ) {
          return state.renderList(
            node,
            "  ",
            () =>
              (this.editor.storage.markdown.options.bulletListMarker || "-") + " "
          );
        },
        parse: {
          setup(markdownit: unknown) {
            scratchpadTaskMarkdownIt(markdownit as never);
          },
        },
      },
    };
  },
});
