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
import { subpageNodeView } from "@/components/pages/blocks/subpage-view";
import { imageNodeView } from "@/components/pages/blocks/image-view";
import { fileNodeView } from "@/components/pages/blocks/file-view";
import {
  PageUploadsProvider,
  type PageUploads,
} from "@/components/pages/page-uploads";
import { Arrows } from "@/components/editor-arrows";
import { noteTyping, trackPointerFreshness } from "@/lib/keyboard/hover-keys";
import { setDetailsLabels } from "@/components/pages/blocks/details";
import {
  BlockPlaceholder,
  pagePlaceholder,
} from "@/components/pages/block-placeholder";
import { BlockGutter } from "@/components/pages/block-gutter";
import { BlockFlash } from "@/components/pages/block-flash";
import { focusDocumentEnd } from "@/components/pages/block-actions";
import { handleNodeLinkClick } from "@/components/editor-node-link";
import {
  MentionLinksProvider,
  type MentionLinks,
} from "@/components/mention-links";
import {
  PageSlashCommand,
  pageSlashItems,
} from "@/components/pages/page-slash-command";
import {
  PagesLookupProvider,
  type PagesLookup,
} from "@/components/pages/pages-lookup";
import { TitleBridge } from "@/components/pages/title-bridge";

export { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks";

/* Typographie du corps de page. Même parti pris que le carnet : l'édition EST
   l'aperçu, il n'y a pas de mode markdown brut. */
const PROSE = cn(
  "text-base leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  // Les liens du TEXTE. `:not(.editor-node-link)` en exclut les ancres rendues
  // par une vue de nœud (le bloc sous-page, la pilule d'une mention) :
  // `.ProseMirror a` a une spécificité plus forte qu'une classe utilitaire
  // posée sur l'ancre, donc sans cette exception un bloc ne peut PAS se
  // dépeindre — il héritait de la couleur des liens et portait un second
  // soulignement par-dessus le sien.
  "[&_a:not(.editor-node-link)]:text-primary",
  "[&_a:not(.editor-node-link)]:underline",
  "[&_a:not(.editor-node-link)]:underline-offset-2",
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
  // Le clic sur l'ancre d'une vue de nœud n'appartient pas à l'extension Link :
  // le pourquoi, et les deux navigations qu'il évitait, sont dans
  // components/editor-node-link.ts.
  handleClick: (_view: unknown, _pos: number, event: MouseEvent) =>
    handleNodeLinkClick(event),
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

/**
 * Les fichiers d'un presse-papier ou d'un lâcher, quand ce sont eux qu'on veut.
 *
 * Le discernement tient en une règle : un transfert peut porter DES FICHIERS ET
 * DU TEXTE en même temps — copier une image depuis une page web donne le fichier
 * et le `<img>` HTML qui va avec, copier un fichier depuis le Finder donne le
 * fichier et son nom. On prend les fichiers dès qu'il y a une IMAGE parmi eux
 * (c'est le geste « je colle cette capture », et l'octet vaut mieux qu'un lien
 * vers le site d'à côté, qui cessera de répondre) ; sinon, seulement quand le
 * transfert ne porte aucun texte à coller.
 *
 * Rendre `true` sur ce chemin est ce qui coupe le `transformPastedText` de
 * tiptap-markdown : sans ça, un collage d'image passerait par la lecture
 * markdown et n'y trouverait rien à lire.
 */
function filesToUpload(transfer: DataTransfer | null): File[] | null {
  const files = Array.from(transfer?.files ?? []).filter((file) => file.size > 0);
  if (files.length === 0) return null;
  if (files.some((file) => file.type.startsWith("image/"))) return files;
  const text = transfer?.getData("text/plain") ?? "";
  return text.trim() ? null : files;
}

export function PageEditor({
  initialContent,
  onChange,
  pages,
  uploads,
  mentions,
  mentionLinks,
  editorRef,
  onEditor,
  onSubpagesRemoved,
  onLeaveTop,
  editable = true,
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
  /**
   * Les téléversements de la page (MIN-280) : ce qui pose un bloc image ou
   * fichier et le suit jusqu'à son adresse définitive.
   *
   * Optionnel, comme `pages` : sans lui l'éditeur rend les blocs déjà là mais
   * n'en accepte pas de neufs — c'est exactement ce qu'il faut à l'aperçu d'une
   * version de l'historique, qui est en lecture seule.
   */
  uploads?: PageUploads & { addFiles: (files: Iterable<File>, options?: { at?: number }) => void };
  /** Les citables « @ » — mêmes options que dans une description d'issue. */
  mentions?: MentionSuggestOptions;
  /** Où mènent les pilules déjà posées : un ticket, un objectif, une page
      s'ouvrent d'un clic (components/mention-links). */
  mentionLinks?: MentionLinks | null;
  editorRef?: MutableRefObject<Editor | null>;
  /**
   * L'éditeur, rendu à l'appelant sous une forme qui DÉCLENCHE un rendu — ce
   * que `editorRef` ne fait pas. La table des matières flottante en a besoin :
   * elle s'abonne à l'instance, et une ref posée en silence ne l'aurait jamais
   * réveillée.
   */
  onEditor?: (editor: Editor | null) => void;
  /**
   * Le curseur sort du corps PAR LE HAUT — ⌫ au tout début du document, ou ↑
   * depuis sa première ligne. L'appelant rend le focus au titre, qui est la
   * ligne d'au-dessus pour qui écrit (cf. title-bridge.ts).
   */
  onLeaveTop?: () => void;
  /**
   * LECTURE SEULE (MIN-277) : l'aperçu d'une version de l'historique.
   *
   * L'éditeur monté non éditable plutôt qu'une seconde surface de rendu, et
   * c'est la même règle que pour les mentions — l'éditeur EST la surface. Un
   * rendu maison à côté finirait par diverger sur exactement les blocs qu'on
   * regarde le moins (un dépliant, une sous-page, une pilule).
   *
   * Ce qui s'éteint avec lui : la gouttière (poignée et `+`), qui n'a rien à
   * proposer sur un document qu'on ne modifie pas, et la réserve du bas, dont
   * le seul rôle est de rendre le curseur à la fin.
   */
  editable?: boolean;
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

  // Le crochet du titre passe par une ref, et la fonction donnée à l'extension
  // ne change JAMAIS d'identité : même règle que le reste du fichier — tiptap
  // réapplique ce qui a bougé, et une fonction refabriquée à chaque rendu
  // remonterait le keymap à chaque frappe.
  const onLeaveTopRef = useRef(onLeaveTop);
  onLeaveTopRef.current = onLeaveTop;
  const leaveTop = useMemo(
    () => () => {
      onLeaveTopRef.current?.();
    },
    []
  );

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
        // Même chose pour la SOUS-PAGE, et pour une raison plus dure encore :
        // sa vue passe par `@tiptap/react`, un module « use client » — nommée
        // depuis le registre, elle était appelée depuis le serveur au premier
        // outil de page de Numo (cf. blocks/subpage.ts).
        ...pageExtensions({
          mention: MentionNode,
          nodeViews: {
            taskItem: taskItemNodeView(),
            subpage: subpageNodeView(),
            // Et pour la même raison encore (MIN-280) : les deux vues lisent le
            // contexte des téléversements et rendent du React.
            image: imageNodeView(),
            pageFile: fileNodeView(),
          },
        }),
        ...(mentions ? [MentionSuggest.configure(mentions)] : []),
        // « -> » devient « → » sous les doigts, comme dans le carnet et dans
        // <MarkdownEditor> (components/editor-arrows.ts). Une règle de SAISIE,
        // donc rien dans le schéma : la projection markdown n'en voit rien, et
        // le document porte la vraie flèche.
        Arrows,
        NodeRange,
        // Le placeholder est à NOUS et pas à @tiptap/extensions : le pourquoi
        // est écrit dans block-placeholder.ts, et il tient en deux mots — les
        // blocs imbriqués, et le curseur lu en retard d'une frappe.
        BlockPlaceholder.configure({ text: placeholderFor }),
        PageSlashCommand.configure({ items: slashItems }),
        // Le clignement d'un bloc. C'est une DÉCORATION et non une classe posée
        // sur l'élément : ProseMirror défait toute mutation du DOM qu'il n'a
        // pas faite (cf. block-flash.ts).
        BlockFlash,
        // Le passage vers le TITRE, en dernier et en priorité basse : il ne
        // prend ⌫ et ↑ que si personne d'autre n'en voulait (title-bridge.ts).
        TitleBridge.configure({ onLeaveTop: leaveTop }),
      ] as unknown as Extensions,
    [placeholderFor, slashItems, mentions, leaveTop]
  );

  const initialRef = useRef(initialContent);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Même règle que partout dans ce fichier : les `editorProps` ne changent
  // JAMAIS d'identité, sinon tiptap réapplique tout à chaque rendu. Les
  // téléverseurs, eux, changent à chaque frappe (leur file est un état React) —
  // ils passent donc par une ref, lue au moment du geste.
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const editorProps = useMemo(
    () => ({
      ...EDITOR_PROPS,
      handlePaste: (_view: unknown, event: ClipboardEvent) => {
        const files = filesToUpload(event.clipboardData);
        if (!files || !uploadsRef.current) return false;
        event.preventDefault();
        uploadsRef.current.addFiles(files);
        return true;
      },
      handleDrop: (
        view: {
          posAtCoords(coords: { left: number; top: number }): { pos: number } | null;
        },
        event: DragEvent,
        _slice: unknown,
        moved: boolean
      ) => {
        // `moved` : c'est un bloc du document qu'on déplace, pas un fichier
        // qu'on apporte. ProseMirror sait le faire, et bien mieux que nous.
        if (moved) return false;
        const files = filesToUpload(event.dataTransfer);
        if (!files || !uploadsRef.current) return false;
        event.preventDefault();
        // À l'endroit du LÂCHER, et non à la fin du document : c'est tout ce que
        // le geste veut dire.
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        uploadsRef.current.addFiles(files, { at: at?.pos });
        return true;
      },
    }),
    []
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions,
    content: initialRef.current,
    editorProps,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
  });

  // L'autre moitié de la règle ci-dessus : bouger le pointeur le rafraîchit.
  // L'écouteur vit le temps que l'éditeur est monté.
  useEffect(() => trackPointerFreshness(), []);

  // En ref : l'appelant passe le plus souvent un `setState`, mais rien ne
  // l'oblige — une fonction refabriquée à chaque rendu rejouerait l'effet
  // ci-dessous, et donc annoncerait `null` à chaque frappe.
  const onEditorRef = useRef(onEditor);
  onEditorRef.current = onEditor;

  useEffect(() => {
    if (editorRef) editorRef.current = editor ?? null;
    onEditorRef.current?.(editor ?? null);
    return () => {
      if (editorRef) editorRef.current = null;
      onEditorRef.current?.(null);
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
      {editor && editable && <BlockGutter editor={editor} />}
      <EditorContent editor={editor} />
      {/* La RÉSERVE du bas : une dizaine de lignes de vide sous le dernier
          bloc, cliquables, qui rendent le curseur à la fin du document.
          Ce n'est PAS une dizaine de paragraphes vides — ceux-là partiraient en
          base, ressortiraient dans le markdown que lit l'agent, et se
          cumuleraient à chaque visite. Le vide est de la mise en page ; seul le
          clic écrit, et il n'écrit qu'un paragraphe, et seulement s'il en
          manque un (`focusDocumentEnd`). */}
      {editor && editable && (
        <div
          aria-hidden
          className="min-h-[15rem] w-full cursor-text"
          // `mousedown` plutôt que `click`, et `preventDefault` avec : sans ça
          // le navigateur pose d'abord le curseur où il veut (souvent nulle
          // part, la zone n'étant pas éditable), et on le voit sauter.
          onMouseDown={(event) => {
            event.preventDefault();
            focusDocumentEnd(editor);
          }}
        />
      )}
    </div>
  );

  // Deux contextes pour deux vues de nœud, et la même raison des deux côtés :
  // le bloc sous-page et la pilule de mention sont montés tout en bas, en
  // portails sous `EditorContent`, et n'ont aucun moyen d'aller chercher
  // eux-mêmes le titre d'une page ou le projet d'un ticket cité.
  const withLinks = (
    <MentionLinksProvider value={mentionLinks ?? null}>
      {uploads ? (
        <PageUploadsProvider value={uploads}>{body}</PageUploadsProvider>
      ) : (
        body
      )}
    </MentionLinksProvider>
  );

  return pages ? (
    <PagesLookupProvider value={pages}>{withLinks}</PagesLookupProvider>
  ) : (
    withLinks
  );
}
