"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
import { ImageOff, RotateCcw } from "lucide-react";
// `cx` et pas `cn` de mangue-ui : le baril tire le sélecteur d'emoji, et le
// registre de blocs cesserait d'être importable hors navigateur (cf. cx.ts).
import { cx } from "@/components/pages/blocks/cx";
import {
  IMAGE_MAX_WIDTH,
  IMAGE_MIN_WIDTH,
  clampImageWidth,
} from "@/components/pages/blocks/image";
import { usePageUploadsContext } from "@/components/pages/page-uploads";

/**
 * La vue d'un bloc image (MIN-280). Quatre états, et le quatrième est celui qui
 * fait la différence entre une feature et une démo :
 *
 *  - l'image est là : elle s'affiche à sa largeur, avec sa légende ;
 *  - elle PART : l'aperçu local en filigrane, et l'avancement par-dessus. On
 *    voit ce qu'on vient de coller avant même que le réseau ait fini, ce qui est
 *    la moitié du confort d'un collage ;
 *  - l'envoi a ÉCHOUÉ : le fichier est encore en mémoire, on réessaie d'un clic
 *    sans avoir à le rechercher ;
 *  - le bloc n'a NI adresse NI envoi en cours — un onglet fermé au mauvais
 *    moment. On le dit, et il se supprime comme n'importe quel bloc. Jamais un
 *    carré vide dont on ne sait pas s'il charge encore.
 *
 * La LÉGENDE est un champ de saisie ordinaire, pas un nœud de texte : elle vit
 * dans l'attribut `alt` (donc dans le texte alternatif du markdown, cf.
 * blocks/image.ts). En faire du contenu ProseMirror aurait voulu dire un nœud de
 * plus, une position de curseur de plus, et un aller-retour markdown à réinventer
 * pour la même phrase.
 */
export function ImageView({ node, editor, updateAttributes, getPos }: NodeViewProps) {
  const t = useTranslations("Pages");
  const uploads = usePageUploadsContext();
  const src = (node.attrs.src as string | null) ?? null;
  const alt = (node.attrs.alt as string | null) ?? "";
  const width = clampImageWidth(node.attrs.width);
  const uploadId = (node.attrs.uploadId as string | null) ?? null;
  const upload = uploadId ? uploads?.get(uploadId) : undefined;

  const wrapper = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  /* ── Le redimensionnement ─────────────────────────────────────────────── */

  // En pourcentage de la COLONNE, jamais en pixels (cf. blocks/image.ts) : la
  // poignée lit donc la largeur du conteneur à chaque mouvement, et la souris
  // n'a rien à savoir de la taille réelle du fichier.
  const startResize = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!editor.isEditable) return;
      const container = wrapper.current;
      if (!container) return;
      event.preventDefault();
      const full = container.getBoundingClientRect().width;
      if (full <= 0) return;
      const left = container.getBoundingClientRect().left;
      setDragging(true);

      const move = (moveEvent: PointerEvent) => {
        const ratio = ((moveEvent.clientX - left) / full) * 100;
        updateAttributes({
          width: Math.min(
            IMAGE_MAX_WIDTH,
            Math.max(IMAGE_MIN_WIDTH, Math.round(ratio))
          ),
        });
      };
      const stop = () => {
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    },
    [editor, updateAttributes]
  );

  /* ── L'aperçu au clic ─────────────────────────────────────────────────── */

  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const displayed = src ?? upload?.previewUrl ?? null;
  const failed = upload?.status === "failed";
  // Ni adresse, ni envoi : le bloc a survécu à un onglet fermé en plein envoi.
  const abandoned = !src && !upload;

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapper}
      // Ni contour ni coins arrondis quand le bloc est sélectionné (MIN-282).
      //
      // L'anneau encadrait TOUT le bloc, légende comprise, et son rayon rognait
      // ce qui touche les angles — à commencer par le texte alternatif, que le
      // navigateur dessine DANS la boîte de l'image quand elle ne charge pas.
      //
      // Il n'y a donc plus AUCUNE marque de sélection sur l'image, et c'est
      // assumé : ce qui désigne le bloc est la gouttière au survol (la poignée
      // et le `+`), comme sur n'importe quel autre bloc du document. Rien
      // d'autre dans cet éditeur ne se peint parce qu'il est sélectionné.
      className="my-2 flex flex-col items-start"
      contentEditable={false}
    >
      {displayed ? (
        <div
          className="group/image relative max-w-full"
          style={{ width: width ? `${width}%` : "100%" }}
        >
          {/* Une balise `img` nue, et non `next/image` : la source est une
              redirection 302 vers une URL signée, que l'optimiseur de Next ne
              peut ni mettre en cache ni redimensionner — il ferait un aller-retour
              de plus pour rendre exactement le même octet. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayed}
            alt={alt}
            /**
             * Le glissé ne part pas de l'IMAGE, il part du bloc (MIN-282).
             *
             * Une image est nativement glissable, et c'est elle que le
             * navigateur emporte quand on la tire — pas le nœud qui la contient.
             * Le transfert porte alors du HTML (`<img src=…>`), donc rien que
             * ProseMirror reconnaisse comme un déplacement : il retombe sur son
             * collage par défaut et INSÈRE une seconde image. Un glissé de trois
             * pixels, celui qu'on fait sans le vouloir en cliquant, dupliquait
             * le bloc.
             *
             * `draggable={false}` rend le geste au conteneur, que ProseMirror
             * sait déjà glisser (`draggable: true` dans le schéma du nœud,
             * blocks/image.ts). Tirer une image la DÉPLACE donc, au lieu de la
             * recopier — ce que fait déjà la poignée de gouttière, et ce que
             * faisait croire le geste.
             *
             * Ce qu'on y perd : glisser l'image vers le bureau ou un autre
             * onglet. L'ouvrir en grand d'un clic la rend à ce geste-là.
             */
            draggable={false}
            className={cx(
              "h-auto w-full",
              src && "cursor-zoom-in",
              !src && "opacity-60"
            )}
            onClick={() => {
              if (src) setZoomed(true);
            }}
          />

          {upload?.status === "uploading" && (
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round((upload.progress || 0) * 100)}%` }}
              />
            </div>
          )}

          {editor.isEditable && src && (
            // La poignée de largeur : sur le bord droit, révélée au survol.
            // `touch-none` parce qu'un glissé au doigt ferait sinon défiler la
            // page sous la poignée au lieu de la suivre.
            <span
              role="slider"
              tabIndex={-1}
              aria-label={t("imageResize")}
              aria-valuemin={IMAGE_MIN_WIDTH}
              aria-valuemax={IMAGE_MAX_WIDTH}
              aria-valuenow={width ?? IMAGE_MAX_WIDTH}
              onPointerDown={startResize}
              className={cx(
                "absolute top-1/2 right-1 h-10 w-1.5 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-foreground/40 opacity-0 transition-opacity",
                "group-hover/image:opacity-100",
                dragging && "opacity-100"
              )}
            />
          )}
        </div>
      ) : (
        <div
          className={cx(
            "flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm",
            failed || abandoned ? "text-muted-foreground" : "text-muted-foreground"
          )}
        >
          <ImageOff className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {failed
              ? t("uploadFailed", { name: upload!.file.name })
              : abandoned
                ? t("imageMissing")
                : t("uploadInProgress", { name: upload?.file.name ?? "" })}
          </span>
          {failed && uploadId && (
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => uploads?.retry(uploadId)}
            >
              <RotateCcw className="size-3" />
              {t("uploadRetry")}
            </button>
          )}
        </div>
      )}

      {(editor.isEditable || alt) && src && (
        <input
          value={alt}
          readOnly={!editor.isEditable}
          placeholder={t("imageCaption")}
          aria-label={t("imageCaption")}
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          // Le clavier appartient au champ tant qu'on y écrit : sans ça, ⌫ sur
          // une légende vide remonterait à ProseMirror et supprimerait l'image
          // qu'on est en train de légender.
          onKeyDown={(event) => event.stopPropagation()}
          onFocus={() => {
            // `getPos` rend `undefined` quand le nœud n'est plus dans le
            // document — la vue survit un instant à sa propre suppression.
            const pos = getPos?.();
            if (typeof pos === "number") editor.commands.setNodeSelection(pos);
          }}
          className="mt-1 w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
          style={{ maxWidth: width ? `${width}%` : "100%" }}
        />
      )}

      {zoomed && src && (
        // L'aperçu au clic : un calque, fermé par ÉCHAP ou par un clic n'importe
        // où. Pas de dialog de mangue-ui — le registre de blocs doit rester
        // importable hors navigateur, et cette vue est déjà tout ce qu'il faut.
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("imageOpen")}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-8"
          onClick={() => setZoomed(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

/**
 * La vue, prête à être greffée sur le nœud image — par l'éditeur de page, qui
 * l'injecte dans `pageExtensions({ nodeViews })`. Elle vit ICI et non sur le
 * nœud parce que ce fichier est un module client : le nœud, lui, est monté hors
 * navigateur par la projection markdown (cf. blocks/subpage-view.tsx).
 */
export function imageNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(ImageView) as unknown as NodeViewRenderer;
}
