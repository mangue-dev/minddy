"use client";

import { useState } from "react";
import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
// `cx` et pas `cn` de mangue-ui : le baril tire le sélecteur d'emoji, et le
// registre de blocs cesserait d'être importable hors navigateur (cf. cx.ts).
import { cx } from "@/components/pages/blocks/cx";
import { FileText, RotateCcw } from "lucide-react";
import {
  NODE_LINK_CLASS,
  isPlainNavigationClick,
} from "@/components/editor-node-link";
import { usePagesLookup } from "@/components/pages/pages-lookup";

/**
 * La vue d'un bloc sous-page : l'icône et le titre de la page CIBLE, relus à
 * chaque rendu depuis le cache du projet — jamais recopiés dans le nœud.
 *
 * Trois états, et le troisième est celui qui compte (MIN-272) :
 *
 *  - la page est là : son icône, son titre, et un lien vers elle ;
 *  - le cache n'a pas fini de charger : la même ligne, en attente ;
 *  - la page n'est PLUS là — corbeillée d'un autre onglet, ou bloc laissé
 *    derrière par un reparentage. Le bloc se rend alors DÉSACTIVÉ, avec de quoi
 *    la ressortir de la corbeille. Jamais une ligne vide, jamais un plantage :
 *    un bloc qui disparaît en silence du document ferait douter de ce qu'on a
 *    écrit, là où une ligne barrée dit exactement ce qui s'est passé.
 */
export function SubpageView({ node, selected }: NodeViewProps) {
  const t = useTranslations("Pages");
  const lookup = usePagesLookup();
  const pageId = (node.attrs.pageId as string | null) ?? null;
  const page = pageId ? lookup?.get(pageId) : undefined;
  const [restoring, setRestoring] = useState(false);

  // Orphelin : le cache est chargé, et il ne connaît pas cette page. Un bloc
  // sans `pageId` du tout (création qui n'a pas abouti) n'est pas orphelin — il
  // n'a jamais pointé nulle part.
  const orphan = !!pageId && !page && lookup?.ready === true;
  const href = page && lookup?.href ? lookup.href(page.id) : null;

  // La typographie du CORPS, dite explicitement : le bloc est une ligne du
  // document, pas un titre. `text-base font-normal` parce qu'un poids plus lourd
  // le fait lire comme une section ; `text-foreground no-underline` parce que
  // l'éditeur peint TOUS ses `<a>` en `text-primary` avec un soulignement à lui
  // (page-editor.tsx, `PROSE`) — sans ces deux-là, ce lien-ci héritait de la
  // couleur des liens du texte et portait deux traits superposés.
  //
  // Le seul soulignement est donc le nôtre, et il est plus PÂLE que le texte :
  // il dit « ceci mène ailleurs » sans réclamer l'œil, comme dans Notion. Un
  // trait de la couleur du texte fait une ligne aussi noire que les lettres, et
  // c'est ce qui donnait au bloc son air de titre.
  const label = (
    <span
      className={cx(
        "truncate text-base font-normal",
        page &&
          "text-foreground underline decoration-muted-foreground/40 decoration-1 underline-offset-4",
        !page && "text-muted-foreground no-underline",
        orphan && "line-through"
      )}
    >
      {page
        ? page.title || t("untitled")
        : orphan
          ? t("subpageMissing")
          : t("subpageUntitled")}
    </span>
  );

  return (
    <NodeViewWrapper
      as="div"
      data-page-id={pageId}
      data-orphan={orphan || undefined}
      // `py-1` et non `py-1.5` : la gouttière (poignée + `+`) se centre sur la
      // hauteur de LIGNE du bloc, rembourrage compris (block-gutter.tsx). Plus
      // la ligne s'écarte de celle d'un paragraphe, plus la marge s'en éloigne
      // à l'œil — une ligne de corps rembourrée d'un cran garde les deux
      // alignés comme sur les autres blocs.
      className={cx(
        "my-1 flex items-center gap-2 rounded-lg px-2 py-1 leading-relaxed transition-colors",
        !orphan && "hover:bg-muted",
        selected && "bg-muted ring-1 ring-ring"
      )}
      contentEditable={false}
    >
      {page?.icon ? (
        <span className="shrink-0 text-base leading-relaxed">{page.icon}</span>
      ) : (
        <FileText
          className={cx(
            "size-4 shrink-0 text-muted-foreground",
            orphan && "opacity-60"
          )}
        />
      )}

      {href ? (
        // Une vraie ancre : le ⌘-clic et le clic du milieu ouvrent la page dans
        // un onglet, comme partout ailleurs. Un `onClick` sur un `div` ne sait
        // faire ni l'un ni l'autre.
        // `editor-node-link` n'est pas une classe utilitaire : c'est la marque
        // par laquelle l'éditeur laisse cette ancre tranquille — ni sa couleur
        // de lien, ni son `window.open` (components/editor-node-link.ts, et
        // page-editor.tsx pour `PROSE` et `handleClick`).
        //
        // Une vraie ancre, et pas un `div` cliquable : ⌘-clic, clic du milieu et
        // « ouvrir dans un nouvel onglet » du menu contextuel viennent avec, et
        // aucun `onClick` ne sait les refaire. Le clic ORDINAIRE, lui, passe par
        // le routeur — une navigation d'application, pas un rechargement.
        <a
          href={href}
          className={cx(NODE_LINK_CLASS, "min-w-0 flex-1 truncate")}
          onClick={(event) => {
            if (!isPlainNavigationClick(event)) return;
            event.preventDefault();
            lookup?.navigate?.(pageId!);
          }}
        >
          {label}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}

      {orphan && lookup?.restore && (
        <button
          type="button"
          disabled={restoring}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          onClick={() => {
            setRestoring(true);
            void lookup
              .restore?.(pageId)
              .finally(() => setRestoring(false));
          }}
        >
          <RotateCcw className="size-3" />
          {t("subpageRestore")}
        </button>
      )}
    </NodeViewWrapper>
  );
}

/**
 * La vue, prête à être greffée sur le nœud sous-page (blocks/subpage.ts) — par
 * l'éditeur de page, qui l'injecte dans `pageExtensions({ nodeViews })`.
 *
 * Elle vit ICI et non sur le nœud parce que ce fichier est un module client :
 * le nœud, lui, est monté hors navigateur par la projection markdown (MCP,
 * Numo, agent), et une référence client appelée depuis le serveur lève.
 */
export function subpageNodeView(): NodeViewRenderer {
  // Même artefact de types que la vue des tâches (task-item-view.tsx) : deux
  // copies de @tiptap/core de MÊME version, donc deux identités de type pour un
  // seul runtime.
  return ReactNodeViewRenderer(SubpageView) as unknown as NodeViewRenderer;
}
