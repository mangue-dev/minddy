"use client";

// Le menu « / » d'une page. Même mécanique que celui du carnet
// (components/scratchpad/slash-command.tsx) — y compris le portage au corps du
// document, pour la même raison : dans un panneau qui défile, un menu en
// position absolue se fait couper par son conteneur.
//
// La différence tient en une ligne, et c'est tout l'objet du ticket : ce menu
// n'a AUCUNE liste de blocs. Il affiche ce que `slashItems()` lui rend et pose
// le bloc par `insertBlock()`. Ajouter un bloc tableau ne demandera pas d'y
// revenir.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { cn } from "mangue-ui";
import {
  insertBlock,
  slashItems,
  type PageBlock,
} from "@/components/pages/blocks";

/** Ce que le menu a besoin de savoir d'un bloc, une fois les clés traduites.
    La traduction se fait DEHORS : le registre n'a pas de traducteur. */
export interface PageSlashItem {
  block: PageBlock;
  label: string;
}

/** Le catalogue traduit, dans l'ordre du menu. `t` vient du composant appelant
    (namespace `Pages`), typé avec son namespace — sans lui, TypeScript renonce
    (TS2589) et ne vérifie plus aucune clé. */
export function pageSlashItems(
  t: (key: PageBlock["labelKey"]) => string
): PageSlashItem[] {
  return slashItems().map((block) => ({
    block,
    label: t(block.labelKey),
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

  /**
   * Le clavier PREND LA MAIN sur la souris.
   *
   * Les deux se battaient : les flèches font défiler la liste, le défilement
   * fait passer une ligne sous le pointeur immobile, `mouseenter` se déclenche
   * et la sélection saute là où est la souris — la flèche suivante repart de
   * cette ligne-là, et on ne descend plus. Dès qu'on navigue au clavier, la
   * liste devient donc insensible au pointeur (et sans survol peint, qui
   * désignerait une seconde ligne), jusqu'au prochain VRAI mouvement de souris.
   */
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    if (!keyboard) return;
    const wake = () => setKeyboard(false);
    // `mousemove` et pas `mouseover` : c'est le mouvement qui rend la main à la
    // souris, pas le fait qu'une ligne soit passée dessous toute seule.
    window.addEventListener("mousemove", wake, { once: true });
    return () => window.removeEventListener("mousemove", wake);
  }, [keyboard]);

  // Le menu DÉFILE avec les flèches. Sans ça la ligne active sortait du cadre
  // dès le quatrième ↓ : le clavier continuait de fonctionner, mais on ne
  // voyait plus ce qu'on choisissait. `nearest` : on ne recentre pas une ligne
  // déjà visible, ce qui ferait sauter la liste à chaque pression.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-slash-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const choose = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      const n = props.items.length;
      if (n === 0) return false;
      if (event.key === "ArrowUp") {
        setKeyboard(true);
        setSelected((s) => (s - 1 + n) % n);
        return true;
      }
      if (event.key === "ArrowDown") {
        setKeyboard(true);
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

  const rows: ReactNode[] = props.items.map((item, index) => {
    const Icon = item.block.icon;
    return (
      <button
        type="button"
        key={item.block.id}
        data-slash-index={index}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => {
          if (!keyboard) setSelected(index);
        }}
        onClick={() => choose(index)}
        className={cn(
          "flex w-full items-center gap-2.5 scroll-my-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
          index === selected ? "bg-muted text-foreground" : "text-foreground/90",
          // Pendant la navigation au clavier, la souris ne peint plus rien :
          // deux lignes allumées, ce serait deux réponses à « Entrée ».
          keyboard && "pointer-events-none"
        )}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{item.label}</span>
      </button>
    );
  });

  return (
    <div className="min-w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
      <div
        ref={listRef}
        className="scrollbar-quiet max-h-80 overflow-y-auto overscroll-contain"
      >
        {rows}
      </div>
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
