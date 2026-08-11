"use client";

// L'éditeur d'une page — le montage, et rien que le montage.
//
// Ce qu'il sait du DOCUMENT tient en un appel : `pageExtensions()`. Il ne nomme
// aucun bloc, et c'est la propriété qu'il faut garder — le jour où l'on ajoute
// un bloc tableau, ce fichier ne bouge pas. Et ce même appel est celui que fait
// la projection markdown (lib/pages-markdown.ts) : l'éditeur et l'agent lisent
// le même schéma, par construction.
//
// Ce qu'il apporte par-dessus, et qui ne touche pas au document :
//  - `NodeRange` : la sélection de plusieurs blocs d'un glissé ou d'un ⇧-clic,
//    sur laquelle opèrent toutes les actions du menu ⋯ ;
//  - la pilule de mention (components/markdown-mention.tsx) posée sur le nœud
//    nu du schéma, et sa suggestion « @ » ;
//  - le menu « / », branché sur le registre, et le chrome du bloc
//    (components/pages/block-gutter.tsx) : la marge au survol et le menu ⋯.
//
// Ce qui n'est PAS ici : la sauvegarde versionnée, qui est MIN-271 — cet
// éditeur ne fait que rendre son JSON à chaque frappe.

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type Extensions,
  type JSONContent,
} from "@tiptap/react";
import { NodeRange } from "@tiptap/extension-node-range";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  MentionNode,
  MentionSuggest,
  type MentionSuggestOptions,
} from "@/components/markdown-mention";
import { pageExtensions } from "@/components/pages/page-extensions";
import { taskItemNodeView } from "@/components/scratchpad/task-item-view";
import { noteTyping, trackPointerFreshness } from "@/lib/keyboard/hover-keys";
import { setDetailsLabels } from "@/components/pages/blocks/details";
import {
  BlockPlaceholder,
  pagePlaceholder,
} from "@/components/pages/block-placeholder";
import { BlockGutter } from "@/components/pages/block-gutter";
import { handleBlockLinkClick } from "@/components/pages/block-actions";
import {
  PageSlashCommand,
  pageSlashItems,
} from "@/components/pages/page-slash-command";
import {
  PagesLookupProvider,
  type PagesLookup,
} from "@/components/pages/pages-lookup";

export { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks";

/* Typographie du corps de page. Même parti pris que le carnet : l'édition EST
   l'aperçu, il n'y a pas de mode markdown brut. */
const PROSE = cn(
  "text-base leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  // Les liens du TEXTE. `:not(.page-block-link)` en exclut les ancres rendues
  // par une vue de nœud (le bloc sous-page) : `.ProseMirror a` a une
  // spécificité plus forte qu'une classe utilitaire posée sur l'ancre, donc
  // sans cette exception un bloc ne peut PAS se dépeindre — il héritait de la
  // couleur des liens et portait un second soulignement par-dessus le sien.
  "[&_a:not(.page-block-link)]:text-primary",
  "[&_a:not(.page-block-link)]:underline",
  "[&_a:not(.page-block-link)]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-sm",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-5 [&_h2]:mb-1.5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-4 [&_hr]:border-border"
  // Le dépliant n'est PAS ici : son node view ne rend pas de `<details>` mais
  // trois `div[data-type]`, que ces sélecteurs ne touchaient donc jamais. Sa
  // mise en page vit dans app/globals.css, avec le reste de ce qui doit viser
  // des attributs plutôt que des balises.
);

/** Figées au niveau du module : tiptap relit les options à chaque rendu et
    réapplique tout ce qui a changé d'IDENTITÉ, depuis son propre effet. Avec des
    vues de nœud React au milieu (les tâches, les sous-pages), ça se monte en
    `flushSync` en pleine phase de commit — que React refuse. Même règle que le
    carnet : rien ne doit bouger d'un rendu à l'autre. */
const EDITOR_PROPS = {
  attributes: { class: PROSE },
  scrollMargin: { top: 0, right: 0, bottom: 160, left: 0 },
  scrollThreshold: { top: 0, right: 0, bottom: 160, left: 0 },
  // Le clic sur le lien d'un BLOC n'appartient pas à l'extension Link : le
  // pourquoi, et les deux navigations qu'il évitait, sont dans block-actions.ts.
  handleClick: (_view: unknown, _pos: number, event: MouseEvent) =>
    handleBlockLinkClick(event),
  // Écrire périme le pointeur : tant qu'on n'a pas redéplacé la souris, la
  // tâche qu'elle survole ne prend plus ⇧A/⇧P (cf. hover-keys.ts). Même règle
  // que le carnet, et pour la même raison — une page est éditable de bout en
  // bout, donc « la frappe l'emporte tant qu'on écrit » est la seule chose qui
  // sépare le raccourci de la lettre. Le signal est la FRAPPE, pas le
  // changement de document : les flèches en sont, une insertion programmée non.
  handleKeyDown: () => {
    noteTyping();
    return false;
  },
};

export function PageEditor({
  initialContent,
  onChange,
  pages,
  mentions,
  editorRef,
  onSubpagesRemoved,
  className,
}: {
  /** Le corps de la page en JSON ProseMirror — le stockage (le markdown est une
      projection, cf. MIN-269). Lu au MONTAGE seulement : tiptap ne relit pas
      `content` ensuite, et une écriture distante s'adopte par `editorRef`. */
  initialContent: JSONContent | null;
  onChange: (content: JSONContent) => void;
  /** Comment résoudre une sous-page, et comment en créer une (MIN-272). */
  pages?: PagesLookup;
  /**
   * Des blocs sous-page viennent de quitter le document (MIN-272).
   *
   * L'éditeur ne décide de RIEN ici : il constate. C'est l'appelant qui demande
   * confirmation, met les pages à la corbeille, et annule le geste si on lui
   * dit non — parce que lui seul sait combien de descendants partiraient avec.
   */
  onSubpagesRemoved?: (pageIds: string[]) => void;
  /** Les citables « @ » — mêmes options que dans une description d'issue. */
  mentions?: MentionSuggestOptions;
  editorRef?: MutableRefObject<Editor | null>;
  className?: string;
}) {
  const t = useTranslations("Pages");

  const slashItems = useMemo(() => pageSlashItems(t), [t]);

  // Mémoïsé : tiptap réapplique tout ce qui change d'identité entre deux
  // rendus, et une fonction refabriquée à chaque fois remonterait le plugin.
  const placeholderFor = useMemo(() => pagePlaceholder(t), [t]);

  // Le bouton de repli du dépliant est rendu par un node view sans React : il
  // ne peut pas lire le catalogue lui-même, on le lui pose ici (cf. details.ts).
  setDetailsLabels({ expand: t("toggleExpand"), collapse: t("toggleCollapse") });

  const extensions = useMemo(
    () =>
      [
        // Le SCHÉMA de la page, celui-là même que monte la projection markdown
        // (components/pages/page-extensions.ts). L'éditeur y ajoute son chrome,
        // et rien qui touche au document.
        // La vue des TÂCHES est celle du carnet (MIN-274) : même menu ⋯, mêmes
        // raccourcis de survol, même clic droit. Elle s'injecte ici plutôt que
        // de vivre dans le fichier du bloc, parce qu'elle tire `mangue-ui` et
        // que le registre, lui, doit rester importable hors navigateur (cf.
        // components/pages/blocks/task-list.ts).
        ...pageExtensions({
          mention: MentionNode,
          nodeViews: { taskItem: taskItemNodeView() },
        }),
        ...(mentions ? [MentionSuggest.configure(mentions)] : []),
        NodeRange,
        // Le placeholder est à NOUS et pas à @tiptap/extensions : le pourquoi
        // est écrit dans block-placeholder.ts, et il tient en deux mots — les
        // blocs imbriqués, et le curseur lu en retard d'une frappe.
        BlockPlaceholder.configure({ text: placeholderFor }),
        PageSlashCommand.configure({ items: slashItems }),
      ] as unknown as Extensions,
    [placeholderFor, slashItems, mentions]
  );

  const initialRef = useRef(initialContent);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialRef.current,
    editorProps: EDITOR_PROPS,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
  });

  // L'autre moitié de la règle ci-dessus : bouger le pointeur le rafraîchit.
  // L'écouteur vit le temps que l'éditeur est monté.
  useEffect(() => trackPointerFreshness(), []);

  useEffect(() => {
    if (editorRef) editorRef.current = editor ?? null;
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);

  // Les crochets de la sous-page sont LUS au moment du geste, pas capturés :
  // ils arrivent avec le cache du projet, après le montage de l'éditeur (cf.
  // blocks/subpage.ts). `removed` est celui qui compte — c'est par lui que la
  // disparition d'un bloc devient une mise à la corbeille (MIN-272).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.storage.subpage.create = pages?.create ?? null;
    editor.storage.subpage.opened = pages?.opened ?? null;
    editor.storage.subpage.duplicate = pages?.duplicate ?? null;
    editor.storage.subpage.removed = onSubpagesRemoved ?? null;
  }, [editor, pages, onSubpagesRemoved]);

  const body = (
    // Ni `relative` ni retrait ici, et c'est le point : la GOUTTIÈRE du chrome
    // (poignée + `+`) se place à gauche du bloc survolé, donc en dehors de la
    // colonne de texte. C'est l'appelant qui tient la colonne — un conteneur
    // positionné, avec la réserve de gouttière à gauche —, et le TITRE de la
    // page y est dedans lui aussi. Sans ça, les deux ne partagent pas le même
    // bord gauche et le corps a l'air imbriqué sous son titre.
    <div className={cn("page-editor", className)}>
      {editor && <BlockGutter editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );

  return pages ? (
    <PagesLookupProvider value={pages}>{body}</PagesLookupProvider>
  ) : (
    body
  );
}
