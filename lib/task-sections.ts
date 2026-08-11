// Où vit une tâche DANS son document — la moitié « document » de ce que
// lib/scratchpad-prompt.ts fait ensuite avec des chaînes.
//
// Séparé de la vue (components/scratchpad/task-item-view.tsx) pour la même
// raison que le schéma l'a été de sa vue : la vue tire `mangue-ui` et ne se
// monte que dans un navigateur, alors que ceci ne parle qu'à ProseMirror et se
// joue donc sur un vrai document, dans un test. C'est le canal par lequel une
// tâche arrive chez l'agent avec sa section — s'il se trompe, personne ne le
// voit : le prompt part quand même, il dit juste autre chose.

import type { Editor } from "@tiptap/core";
import { sectionHeadingChain } from "@/lib/scratchpad-prompt";

/**
 * Les lignes de titre markdown (niveaux compris) des sections qui CONTIENNENT le
 * bloc situé en `pos`, de la plus large à la plus étroite — vide si la tâche
 * traîne avant tout titre. Reprises telles quelles en tête du markdown copié /
 * lancé : c'est ce qui permet au prompt de nommer la section.
 *
 * La hiérarchie compte : une tâche sous « ## Sidebar » est aussi une tâche de
 * « # Pull requests », et le titre le plus proche ne suffit pas à la situer. La
 * règle d'emboîtement vit dans `sectionHeadingChain` — ici on ne fait que lui
 * lister les titres qui précèdent la tâche.
 *
 * On raisonne au PREMIER NIVEAU du document : la tâche vit dans une `taskList`,
 * on remonte à son bloc de premier niveau, puis on relève les titres qui le
 * précèdent, dans l'ordre du document. Un titre enfermé dans un dépliant ne
 * compte donc pas comme une section — c'est du contenu replié, pas un plan.
 */
export function taskSectionHeadings(
  editor: Editor,
  pos: number | undefined
): string[] {
  if (pos == null) return [];
  const doc = editor.state.doc;
  if (pos < 0 || pos > doc.content.size) return [];
  const before: Array<{ level: number; text: string }> = [];
  const index = doc.resolve(pos).index(0);
  for (let i = 0; i < index; i++) {
    const child = doc.child(i);
    if (child.type.name !== "heading") continue;
    before.push({
      level: Number(child.attrs.level) || 2,
      text: child.textContent,
    });
  }
  return sectionHeadingChain(before);
}
