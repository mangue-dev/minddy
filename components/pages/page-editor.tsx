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
import { Placeholder } from "@tiptap/extensions";
import { NodeRange } from "@tiptap/extension-node-range";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  MentionNode,
  MentionSuggest,
  type MentionSuggestOptions,
} from "@/components/markdown-mention";
import { pageExtensions } from "@/components/pages/page-extensions";
import { BlockGutter } from "@/components/pages/block-gutter";
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
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
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
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_details]:my-2 [&_details_summary]:cursor-pointer [&_details_summary]:font-medium"
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
};

export function PageEditor({
  initialContent,
  onChange,
  pages,
  mentions,
  editorRef,
  className,
}: {
  /** Le corps de la page en JSON ProseMirror — le stockage (le markdown est une
      projection, cf. MIN-269). Lu au MONTAGE seulement : tiptap ne relit pas
      `content` ensuite, et une écriture distante s'adopte par `editorRef`. */
  initialContent: JSONContent | null;
  onChange: (content: JSONContent) => void;
  /** Comment résoudre une sous-page, et comment en créer une (MIN-272). */
  pages?: PagesLookup;
  /** Les citables « @ » — mêmes options que dans une description d'issue. */
  mentions?: MentionSuggestOptions;
  editorRef?: MutableRefObject<Editor | null>;
  className?: string;
}) {
  const t = useTranslations("Pages");

  const slashItems = useMemo(() => pageSlashItems(t), [t]);

  const extensions = useMemo(
    () =>
      [
        // Le SCHÉMA de la page, celui-là même que monte la projection markdown
        // (components/pages/page-extensions.ts). L'éditeur y ajoute son chrome,
        // et rien qui touche au document.
        ...pageExtensions({ mention: MentionNode }),
        ...(mentions ? [MentionSuggest.configure(mentions)] : []),
        NodeRange,
        Placeholder.configure({
          placeholder: t("placeholder"),
          showOnlyCurrent: true,
        }),
        PageSlashCommand.configure({ items: slashItems }),
      ] as unknown as Extensions,
    [t, slashItems, mentions]
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

  useEffect(() => {
    if (editorRef) editorRef.current = editor ?? null;
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);

  // Le créateur de sous-page est LU au clic, pas capturé : il arrive avec le
  // cache du projet, après le montage de l'éditeur (cf. blocks/subpage.ts).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.storage.subpage.create = pages?.create ?? null;
  }, [editor, pages]);

  const body = (
    // La MARGE du bloc, réservée : la poignée et le `+` se placent à gauche du
    // bloc survolé, donc hors du texte — sans cette réserve (54 px de boutons)
    // ils débordent du conteneur, et le premier panneau qui défile les coupe.
    // Rien à réserver sur mobile : la marge n'apparaît qu'au SURVOL, et il n'y
    // en a pas sur une surface tactile.
    <div className={cn("page-editor relative pl-2 md:pl-14", className)}>
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
