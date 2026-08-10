"use client";

// Le menu « / » d'une page. Même mécanique que celui du carnet
// (components/scratchpad/slash-command.tsx) — y compris le portage au corps du
// document, pour la même raison : dans un panneau qui défile, un menu en
// position absolue se fait couper par son conteneur.
//
// La différence tient en une ligne, et c'est tout l'objet du ticket : ce menu
// n'a AUCUNE liste de blocs. Il affiche ce que `slashItems()` lui rend, groupé
// par `SLASH_GROUPS`, et pose le bloc par `insertBlock()`. Ajouter un bloc
// tableau ne demandera pas d'y revenir.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { cn } from "mangue-ui";
import {
  SLASH_GROUPS,
  insertBlock,
  slashItems,
  type PageBlock,
} from "@/components/pages/blocks";

/** Ce que le menu a besoin de savoir d'un bloc, une fois les clés traduites.
    La traduction se fait DEHORS : le registre n'a pas de traducteur. */
export interface PageSlashItem {
  block: PageBlock;
  label: string;
  description: string;
  groupLabel: string;
}

/** Le catalogue traduit, dans l'ordre du menu. `t` vient du composant appelant
    (namespace `Pages`), typé avec son namespace — sans lui, TypeScript renonce
    (TS2589) et ne vérifie plus aucune clé. */
export function pageSlashItems(
  t: (key: PageBlock["labelKey"]) => string
): PageSlashItem[] {
  const groupLabel = new Map(
    SLASH_GROUPS.map(({ group, labelKey }) => [group, t(labelKey)])
  );
  return slashItems().map((block) => ({
    block,
    label: t(block.labelKey),
    description: t(block.descriptionKey),
    groupLabel: groupLabel.get(block.slash.group) ?? "",
  }));
}

/** Le filtre du menu : le libellé TRADUIT d'abord, puis les alias du
    descripteur — qui portent les deux langues, parce qu'on tape « quote » sur
    une interface française. */
export function filterSlashItems(
  items: PageSlashItem[],
  query: string
): PageSlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.block.slash.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

type SlashProps = SuggestionProps<PageSlashItem>;

const SlashMenu = forwardRef<SlashMenuRef, SlashProps>(function SlashMenu(
  props,
  ref
) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [props.items]);

  const choose = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      const n = props.items.length;
      if (n === 0) return false;
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + n) % n);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % n);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        choose(selected);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) return null;

  // Les titres de groupe sont posés à la volée, au premier bloc de chaque
  // groupe : un filtrage qui vide un groupe en fait disparaître le titre, sans
  // que le menu ait à regrouper quoi que ce soit.
  let lastGroup: string | null = null;
  const rows: ReactNode[] = [];
  props.items.forEach((item, index) => {
    if (item.groupLabel !== lastGroup) {
      lastGroup = item.groupLabel;
      rows.push(
        <div
          key={`group:${item.groupLabel}`}
          className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground first:pt-1"
        >
          {item.groupLabel}
        </div>
      );
    }
    const Icon = item.block.icon;
    rows.push(
      <button
        type="button"
        key={item.block.id}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setSelected(index)}
        onClick={() => choose(index)}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
          index === selected ? "bg-muted text-foreground" : "text-foreground/90"
        )}
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block truncate text-sm">{item.label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.description}
          </span>
        </span>
      </button>
    );
  });

  return (
    <div className="max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
      {rows}
    </div>
  );
});

/** Marque le menu porté au corps du document, pour qu'un dialogue puisse
    distinguer un clic dedans d'un clic en dehors de lui. */
export const PAGE_SLASH_MENU_ATTR = "data-page-slash-menu";

const EDGE = 8;
const GAP = 6;

function renderSlashMenu() {
  let renderer: ReactRenderer<SlashMenuRef, SlashProps> | null = null;
  let menuEl: HTMLElement | null = null;
  let caretRect: (() => DOMRect | null) | null = null;

  const place = () => {
    const rect = caretRect?.();
    if (!menuEl || !rect) return;
    const { offsetWidth: w, offsetHeight: h } = menuEl;
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const openBelow = h <= below || below >= above;
    const top = openBelow ? rect.bottom + GAP : rect.top - GAP - h;
    const clamp = (v: number, max: number) =>
      Math.round(Math.min(Math.max(v, EDGE), Math.max(EDGE, max)));
    menuEl.style.top = `${clamp(top, window.innerHeight - h - EDGE)}px`;
    menuEl.style.left = `${clamp(rect.left, window.innerWidth - w - EDGE)}px`;
  };

  // La taille du menu ne vaut qu'à la frame suivante après un changement de
  // props : sans ce second passage, une liste filtrée est placée avec sa
  // hauteur d'avant.
  const reposition = () => {
    place();
    requestAnimationFrame(place);
  };

  return {
    onStart: (props: SlashProps) => {
      renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
      menuEl = renderer.element as HTMLElement;
      menuEl.setAttribute(PAGE_SLASH_MENU_ATTR, "");
      menuEl.style.position = "fixed";
      menuEl.style.zIndex = "60";
      menuEl.style.pointerEvents = "auto";
      caretRect = () => props.clientRect?.() ?? null;
      document.body.appendChild(menuEl);
      reposition();
      window.addEventListener("scroll", place, true);
      window.addEventListener("resize", place);
    },
    onUpdate: (props: SlashProps) => {
      renderer?.updateProps(props);
      caretRect = () => props.clientRect?.() ?? null;
      reposition();
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === "Escape") return false;
      return renderer?.ref?.onKeyDown(props.event) ?? false;
    },
    onExit: () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      menuEl?.remove();
      renderer?.destroy();
      renderer = null;
      menuEl = null;
      caretRect = null;
    },
  };
}

/** L'extension « / » d'une page. Se configure avec le catalogue TRADUIT. */
export const PageSlashCommand = Extension.create<{ items: PageSlashItem[] }>({
  name: "pageSlashCommand",

  addOptions() {
    return { items: [] };
  },

  addProseMirrorPlugins() {
    const items = () => this.options.items;
    return [
      Suggestion<PageSlashItem>({
        // pnpm résout @tiptap/core deux fois (même version) — l'editor de
        // Extension n'a pas la même identité que celui de @tiptap/suggestion.
        // Sans effet à l'exécution, comme dans le carnet.
        editor: this.editor as never,
        // Une CLÉ à soi. `Suggestion` en pose une par défaut, la même pour
        // tout le monde (`suggestion$`) : monter le menu « / » et la
        // suggestion « @ » sur le même éditeur faisait alors lever ProseMirror
        // au montage (« Adding different instances of a keyed plugin »). Les
        // deux ne se sont croisés qu'à l'ouverture d'une page, seule surface à
        // porter les deux.
        pluginKey: new PluginKey("pageSlashCommand"),
        char: "/",
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(items(), query),
        command: ({ editor, range, props }) =>
          insertBlock(props.block, editor as unknown as Editor, range as Range),
        render: renderSlashMenu,
      }),
    ];
  },
});
