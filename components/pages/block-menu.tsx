"use client";

// Le menu ⋯ d'un bloc de page.
//
// Ce qu'il faut voir en le lisant : il n'y a AUCUNE liste de blocs ici. Le
// sous-menu « transformer en » est `turnIntoItems(editor)`, c'est-à-dire le
// registre (MIN-267) filtré sur ce qui est convertible, dans son ordre, avec
// son entrée active cochée et son raccourci affiché. Le jour où l'on ajoute un
// bloc tableau, ce fichier ne bouge pas — et le raccourci qu'il affiche est
// exactement celui que le clavier déclenche, puisque les deux lisent le même
// champ du descripteur.
//
// De même pour les couleurs : la palette vient de blocks/color.ts, donc de
// celle des étiquettes du produit, et chaque pastille se peint avec les jetons
// CSS qui peindront le texte. Une pastille ne peut pas mentir sur le résultat.
//
// Tout ce qui touche au document est dans block-actions.ts : ce composant ne
// fait qu'appeler, pour que le comportement reste testable sans interface.

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import {
  CopyPlus,
  Link2,
  Palette,
  Repeat2,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import {
  PAGE_COLORS,
  PAGE_COLOR_ATTRIBUTE,
  activePageColor,
  setPageColor,
  turnIntoItems,
  type PageColor,
  type PageColorKind,
} from "@/components/pages/blocks";
import {
  blockRange,
  blockLink,
  deleteBlocks,
  duplicateBlocks,
  focusBlockRange,
  insertSubpageAfter,
  selectedBlockCount,
  selectedBlockId,
  selectedSubpageId,
  turnBlocksInto,
} from "@/components/pages/block-actions";

/** La pastille d'une couleur, peinte avec le jeton qu'elle pose — le « A »
    pour le texte, le carré plein pour le fond. */
function Swatch({
  kind,
  color,
}: {
  kind: PageColorKind;
  color: PageColor | null;
}) {
  const attribute = color ? { [PAGE_COLOR_ATTRIBUTE[kind]]: color } : {};
  return (
    <span
      {...attribute}
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded border border-border text-xs font-semibold",
        !color && "text-muted-foreground"
      )}
    >
      A
    </span>
  );
}

function ColorItems({
  editor,
  kind,
  onDone,
}: {
  editor: Editor;
  kind: PageColorKind;
  onDone: () => void;
}) {
  const t = useTranslations("Pages");
  const colorName = useTranslations("Categories.colors");
  const active = activePageColor(editor, kind);

  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          setPageColor(editor, kind, null);
          onDone();
        }}
      >
        <Swatch kind={kind} color={null} />
        <span className="truncate">{t("colorNone")}</span>
        {active === null && <span className="ml-auto text-xs">✓</span>}
      </DropdownMenuItem>
      {PAGE_COLORS.map((color) => (
        <DropdownMenuItem
          key={`${kind}:${color}`}
          onSelect={() => {
            setPageColor(editor, kind, color);
            onDone();
          }}
        >
          <Swatch kind={kind} color={color} />
          <span className="truncate">{colorName(color)}</span>
          {active === color && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function BlockMenu({
  editor,
  open,
  onOpenChange,
  children,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le déclencheur — la poignée de la marge, ou n'importe quel bouton. */
  children: React.ReactNode;
}) {
  const t = useTranslations("Pages");

  // Recalculés à chaque OUVERTURE : la sélection a bougé entre deux, et un
  // « transformer en » qui coche le bloc d'avant est pire que pas de coche.
  const items = useMemo(() => (open ? turnIntoItems(editor) : []), [open, editor]);
  const count = useMemo(() => (open ? selectedBlockCount(editor) : 0), [open, editor]);

  /**
   * Un bloc sous-page seul en sélection : le menu change de VOCABULAIRE
   * (MIN-272).
   *
   * Ce qu'on retire — « transformer en » et les couleurs — n'est pas une
   * simplification de confort : un lien vers un document ne se convertit pas en
   * citation, et son texte n'est pas du texte à peindre, c'est le titre d'une
   * autre page, relu à chaque rendu. Les deux entrées agissaient sur un bloc
   * qui n'a ni l'un ni l'autre.
   *
   * Et ce qui reste parle de la PAGE : dupliquer la copie, elle et ses
   * sous-pages ; supprimer la met à la corbeille — d'où le libellé de la
   * sidebar, mot pour mot, parce que c'est le même geste.
   */
  const subpageId = useMemo(
    () => (open ? selectedSubpageId(editor) : null),
    [open, editor]
  );

  const duplicateSubpage = async (pageId: string) => {
    const duplicate = editor.storage.subpage?.duplicate;
    // La place de la copie est retenue MAINTENANT : copier est un aller-retour
    // au serveur, et la sélection aura peut-être bougé quand il rend la main.
    const at = blockRange(editor)?.to;
    if (!duplicate || at === undefined) return;
    const copy = await duplicate(pageId);
    // Le bloc n'est posé QUE si la copie a abouti : un bloc vers une page qui
    // n'existe pas se rendrait en orphelin, pour une erreur déjà signalée.
    if (copy && !editor.isDestroyed) insertSubpageAfter(editor, copy, at);
  };

  const close = () => onOpenChange(false);
  const closeAndFocus = () => {
    onOpenChange(false);
    focusBlockRange(editor, blockRange(editor));
  };

  const copyLink = async () => {
    const id = selectedBlockId(editor);
    if (!id) return;
    await navigator.clipboard.writeText(blockLink(window.location.href, id));
    toast.success(t("blockLinkCopied"));
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="w-60"
        // Échap et clic dehors rendent le curseur au bloc : sans ça, le focus
        // reste sur un déclencheur qui disparaît avec le survol, et la frappe
        // suivante se perd.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusBlockRange(editor, blockRange(editor));
        }}
      >
        {count > 1 && (
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("blocksSelected", { count })}
          </DropdownMenuLabel>
        )}

        {!subpageId && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Repeat2 />
            <span className="truncate">{t("turnInto")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {items.map(({ block, active }) => {
              const Icon = block.icon;
              return (
                <DropdownMenuItem
                  key={block.id}
                  onSelect={() => {
                    turnBlocksInto(editor, block);
                    close();
                  }}
                >
                  <Icon />
                  <span className="truncate">{t(block.labelKey)}</span>
                  {active && <span className="text-xs">✓</span>}
                  {block.shortcut && (
                    <DropdownMenuShortcut>
                      <Kbd size="sm">{block.shortcut.display}</Kbd>
                    </DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        )}

        {!subpageId && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette />
            <span className="truncate">{t("color")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-52 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("colorText")}
            </DropdownMenuLabel>
            <ColorItems editor={editor} kind="text" onDone={close} />
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("colorBackground")}
            </DropdownMenuLabel>
            <ColorItems editor={editor} kind="background" onDone={close} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        )}

        {!subpageId && <DropdownMenuSeparator />}

        <DropdownMenuItem
          onSelect={() => {
            if (subpageId) void duplicateSubpage(subpageId);
            else duplicateBlocks(editor);
            close();
          }}
        >
          <CopyPlus />
          <span className="truncate">{t("duplicateBlock")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => {
            void copyLink();
            close();
          }}
        >
          <Link2 />
          <span className="truncate">{t("copyBlockLink")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            deleteBlocks(editor);
            closeAndFocus();
          }}
        >
          <Trash2 />
          {/* Sur une sous-page, le geste ne supprime pas un bloc : il met une
              PAGE à la corbeille, avec ses descendants. Le libellé est celui de
              la sidebar, mot pour mot — c'est le même geste, il ne doit pas
              porter deux noms selon l'endroit d'où on le déclenche. */}
          <span className="truncate">
            {subpageId ? t("deletePage") : t("deleteBlock")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
