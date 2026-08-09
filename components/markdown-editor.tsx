"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { cn } from "mangue-ui";
import { Arrows } from "@/components/editor-arrows";
import {
  MENTION_HYDRATION_META,
  MentionNode,
  MentionSuggest,
  hydrateMentions,
} from "@/components/markdown-mention";
import {
  InlineSuggestion,
  SET_INLINE_SUGGESTION,
  inlineSuggestionKey,
} from "@/components/inline-suggestion-extension";
import type { MentionOption } from "@/components/mention-suggest";
import type { MentionScan } from "@/lib/mention-scan";
import type { Editor } from "@tiptap/react";

/**
 * Ce qu'une description peut citer. Absent = surface sans mentions (le board
 * public de feedback, où un « @ » ne doit désigner personne d'ici).
 *
 * `options` est la liste proposée après le « @ » ; `scan` est la règle qui
 * retrouve les mentions d'un texte DÉJÀ écrit, pour leur reposer leur pilule à
 * l'ouverture. Les deux se déduisent des mêmes sources (lib/use-mention-sources)
 * mais restent distinctes : on ne propose que ce qui est citable ici, alors
 * qu'on relit tout ce qui a pu l'être.
 */
export interface MarkdownEditorMentions {
  options: MentionOption[];
  scan: MentionScan;
  /** Le premier « @ » tapé — charge la liste à ce moment-là. */
  onQuery?: () => void;
}

/**
 * Le texte fantôme de cette surface, branché de l'extérieur : le composant
 * affiche `suggestion` après le caret et rend compte de ce qui le précède.
 * Absent = pas d'autocomplétion du tout (le cas de toutes les surfaces sauf le
 * formulaire de création).
 */
export interface MarkdownEditorCompletion {
  /** Le gris à afficher après le caret. Chaîne vide = rien. */
  suggestion: string;
  /** Le texte qui précède le caret, à chaque frappe et à chaque déplacement.
      `null` quand on n'est pas en fin de bloc, sur une sélection, ou ailleurs. */
  onPrefixChange: (prefix: string | null) => void;
  onAccept: (text: string) => void;
  onDismiss: () => void;
}

/**
 * Ce qui précède le caret, ou `null` si l'endroit ne se complète pas.
 *
 * La règle du « en fin de bloc » n'est pas une commodité : un fantôme posé au
 * milieu d'une phrase propose une suite à un texte qui en a déjà une, et se lit
 * comme un bug d'affichage plutôt que comme une suggestion.
 */
function prefixAtCaret(editor: Editor): string | null {
  const { selection, doc } = editor.state;
  if (!selection.empty) return null;
  const { $from, from } = selection;
  if ($from.parentOffset !== $from.parent.content.size) return null;
  return doc.textBetween(0, from, "\n", " ");
}

/* Rendered-markdown typography — mirrors <Markdown> so the editing surface reads
   exactly like the committed description (same sizes, spacing, colors). */
const PROSE = cn(
  "text-sm leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
  "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_strong]:font-semibold",
  "[&_hr]:my-3 [&_hr]:border-border",
);

/** Les réglages de la vue ProseMirror — figés hors du composant, cf. la règle
    au-dessus de l'appel à `useEditor`. */
const EDITOR_PROPS = { attributes: { class: PROSE } };

/**
 * Borderless WYSIWYG markdown editor. Content is edited as rendered rich text
 * (Notion-style — bold/headings/lists show live) and read/written as markdown.
 * No box, no radius: the editing surface is the description.
 *
 * Remount per issue with `key={issue.id}` so state resets cleanly; commits the
 * current markdown on blur.
 */
export function MarkdownEditor({
  value,
  onCommit,
  onEmptyChange,
  onEdit,
  mentions,
  completion,
  placeholder = "Ajoute une description…",
  className,
}: {
  value: string;
  onCommit: (markdown: string) => void;
  /** Live emptiness signal (fires on mount and on each edit) — lets callers see
      typed-but-uncommitted content, since onCommit only fires on blur. */
  onEmptyChange?: (empty: boolean) => void;
  /** Le contenu vient d'être MODIFIÉ (frappe, collage) — jamais au montage.
      Dit à l'appelant que ce qui est à l'écran n'est plus ce qu'il a chargé :
      de quoi ne pas remplacer le texte sous les doigts, ni recommitter un
      reflet périmé au blur. */
  onEdit?: () => void;
  /** Ouvre le « @ » sur cette surface. Absent = pas de mentions du tout. */
  mentions?: MarkdownEditorMentions;
  /** Branche le texte fantôme. Absent = pas d'autocomplétion du tout. */
  completion?: MarkdownEditorCompletion;
  placeholder?: string;
  className?: string;
}) {
  const [empty, setEmpty] = useState(value.trim() === "");
  const syncEmpty = (next: boolean) => {
    setEmpty(next);
    onEmptyChange?.(next);
  };

  // Les extensions ne se construisent qu'une fois, mais la liste des citables
  // arrive après coup (l'index se charge au temps mort) : l'extension lit donc
  // une RÉFÉRENCE, jamais une capture.
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  // Fixé au montage : basculer une surface de « sans mentions » à « avec »
  // demanderait de reconstruire le schéma, ce qu'aucun appelant ne fait.
  const [hasMentions] = useState(!!mentions);

  // Même raison que les mentions : l'extension est construite une fois, et lit
  // les rappels par référence.
  const completionRef = useRef(completion);
  completionRef.current = completion;
  const [hasCompletion] = useState(!!completion);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Arrows,
      ...(hasMentions
        ? [
            MentionNode,
            MentionSuggest.configure({
              items: () => mentionsRef.current?.options ?? [],
              onQuery: () => mentionsRef.current?.onQuery?.(),
            }),
          ]
        : []),
      // APRÈS les mentions, et c'est tout l'arbitrage de la touche Tab : les
      // deux la veulent, ProseMirror sert ses plugins dans l'ordre, et le menu
      // ouvert doit gagner. (Le hook se retire aussi de lui-même dès qu'un
      // « @ » est en cours de frappe — ceinture et bretelles.)
      ...(hasCompletion
        ? [
            InlineSuggestion.configure({
              onAccept: (text) => completionRef.current?.onAccept(text),
              onDismiss: () => completionRef.current?.onDismiss(),
            }),
          ]
        : []),
      Markdown.configure({
        html: false,
        linkify: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    [hasMentions, hasCompletion],
  );

  // Le texte de départ, figé au montage : tiptap ne lit `content` qu'à la
  // création de l'éditeur (la surface se remonte par `key`, cf. plus haut).
  const initialContentRef = useRef(value);

  // Ce que le hook d'autocomplétion attend de nous : où en est le caret, à
  // chaque frappe et à chaque déplacement. Il décide seul s'il y a lieu de
  // demander quoi que ce soit.
  const reportPrefix = (ed: Editor) =>
    completionRef.current?.onPrefixChange(prefixAtCaret(ed));

  // ⚠️ tiptap relit ces options à CHAQUE rendu et réapplique d'un
  // `editor.setOptions()` tout ce qui a changé d'identité — depuis son propre
  // effet, donc en pleine phase de commit React, où remonter une vue de nœud
  // (les pilules de mention en sont) lève l'erreur `flushSync` décrite plus
  // bas. D'où extensions mémoïsées, `editorProps` hors du composant et contenu
  // figé : plus rien ne bouge d'un rendu à l'autre.
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: initialContentRef.current,
    editorProps: EDITOR_PROPS,
    onCreate: ({ editor }) => syncEmpty(editor.isEmpty),
    onUpdate: ({ editor, transaction }) => {
      syncEmpty(editor.isEmpty);
      // Poser les pilules sur un texte déjà écrit n'est pas une frappe : sans
      // cette garde, ouvrir un ticket dont la description cite quelqu'un le
      // marquerait « modifié », et le panneau refuserait ensuite toute écriture
      // distante sur un texte que personne n'a touché.
      if (transaction.getMeta(MENTION_HYDRATION_META)) return;
      onEdit?.();
      reportPrefix(editor);
    },
    onSelectionUpdate: ({ editor }) => reportPrefix(editor),
    // Le champ perd le focus : le gris part avec lui. Un fantôme laissé sur une
    // surface qu'on ne tient plus se lit comme du texte déjà écrit.
    onFocus: ({ editor }) => reportPrefix(editor),
    // tiptap-markdown adds `markdown` storage but doesn't augment TipTap's type.
    onBlur: ({ editor }) => {
      completionRef.current?.onPrefixChange(null);
      onCommit(
        (
          editor.storage as unknown as {
            markdown: { getMarkdown(): string };
          }
        ).markdown.getMarkdown(),
      );
    },
  });

  // Le gris posé par le hook. Une transaction dédiée, jamais un rendu : la
  // décoration vit dans l'état ProseMirror, pas dans celui de React.
  const suggestion = completion?.suggestion ?? "";
  useEffect(() => {
    if (!editor || !hasCompletion) return;
    if (inlineSuggestionKey.getState(editor.state) === suggestion) return;
    editor.view.dispatch(editor.state.tr.setMeta(SET_INLINE_SUGGESTION, suggestion));
  }, [editor, hasCompletion, suggestion]);

  // Les pilules d'un texte déjà écrit se reposent à l'ouverture — et de nouveau
  // quand la liste des citables arrive après coup. JAMAIS sous le caret : une
  // description en cours de frappe ne doit pas se réécrire toute seule (même
  // règle que le champ des commentaires).
  //
  // HORS de la phase de commit (`queueMicrotask`) : poser un nœud de mention
  // monte une vue React, et tiptap la monte en `flushSync`. Appelé directement
  // dans l'effet, React refuse — « flushSync was called from inside a lifecycle
  // method » — et les pilules se posent au petit bonheur. Une microtâche
  // s'exécute juste après le commit, donc hors de tout rendu.
  const scan = mentions?.scan;
  useEffect(() => {
    if (!editor || !scan || editor.isFocused) return;
    queueMicrotask(() => {
      if (editor.isDestroyed || editor.isFocused) return;
      hydrateMentions(editor, scan);
    });
  }, [editor, scan]);

  return (
    <div
      className={cn("relative cursor-text", className)}
      onMouseDown={(e) => {
        // Clicking the empty gutter below the content should still focus the editor.
        if (e.target === e.currentTarget) editor?.commands.focus("end");
      }}
    >
      {empty && (
        <p className="pointer-events-none absolute top-0 left-0 text-sm text-muted-foreground/70">
          {placeholder}
        </p>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
