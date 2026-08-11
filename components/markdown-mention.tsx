"use client";

// Les mentions « @ » dans une DESCRIPTION (tiptap) — personne, ticket, objectif.
//
// Même contrat que dans un commentaire (components/mention-textarea) : ce qui est
// STOCKÉ est du texte, « @Nom » / « @MIN-42 » / « @Objectif », et la pilule s'en
// re-déduit à chaque relecture par la règle unique de lib/mention-scan. Le nœud
// tiptap n'est qu'un habit posé sur ce texte : il se sérialise en markdown vers
// lui, et l'hydratation le repose à l'ouverture. Rien de nouveau à persister,
// donc rien à migrer, et une description reste lisible telle quelle par le MCP,
// par Numo et par l'agent de code.
//
// Le menu est porté au corps du document, comme celui du « / » du carnet
// (components/scratchpad/slash-command) et pour les mêmes raisons : dans le
// panneau ou le dialogue, un menu en position absolue se fait couper par le
// conteneur qui défile.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Extension, type Editor } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  ReactRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { MentionChip, NUMO_MENTION_ID } from "@/components/mention-chip";
import { useMentionLinks } from "@/components/mention-links";
import {
  MentionOptionRow,
  filterMentions,
  type MentionOption,
} from "@/components/mention-suggest";
import { memberLabel, type MentionScan, type ScannedMention } from "@/lib/mention-scan";
import { MentionNodeBase } from "@/components/mention-node";

/* ── Le nœud ─────────────────────────────────────────────────────────── */

/** Le nœud PLUS sa pilule. Le schéma, les attributs et la sérialisation markdown
    vivent à part (components/mention-node.ts) : la projection markdown des pages
    monte le nœud nu, hors navigateur, sans React. */
export const MentionNode = MentionNodeBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MentionNodeView);
  },
});

function MentionNodeView({ node }: NodeViewProps) {
  const type = node.attrs.mentionType as MentionOption["type"] | "numo";
  const id = (node.attrs.mentionId as string | null) ?? NUMO_MENTION_ID;
  // Où mène cette pilule-là : la surface le sait (lib/use-mention-sources), le
  // nœud non — il ne porte que le type et l'id. Une personne ne mène nulle part,
  // et un élément que les sources ne connaissent pas (encore) non plus : la
  // pilule reste alors du texte, ce qu'elle a toujours été.
  const links = useMentionLinks();
  const href = links?.href(type, id) ?? null;
  return (
    <NodeViewWrapper as="span" className="inline-flex align-middle">
      <MentionChip
        type={type}
        id={id}
        href={href}
        onNavigate={href ? () => links?.navigate(type, id) : undefined}
        label={node.attrs.mentionLabel ?? ""}
        avatarSeed={node.attrs.seed}
        color={node.attrs.color}
        // L'attribut `icon` porte deux choses selon le type, et une seule à la
        // fois : le favicon d'un projet (une URL) ou l'émoji d'une page. Les
        // passer tous les deux sans distinguer donnerait une pilule de page
        // toujours coiffée du livre générique, jamais de son émoji.
        iconUrl={type === "page" ? null : node.attrs.icon}
        icon={type === "page" ? node.attrs.icon : null}
      />
    </NodeViewWrapper>
  );
}

/** Les attributs du nœud pour une option choisie dans la liste. */
function attrsFromOption(option: MentionOption) {
  return {
    mentionType: option.type,
    mentionId: option.id,
    mentionLabel: option.label,
    seed: option.avatarSeed ?? null,
    color: option.color ?? null,
    icon: option.iconUrl ?? null,
  };
}

/** Les attributs du nœud pour une mention RELUE dans le texte. */
function attrsFromScanned(mention: ScannedMention) {
  switch (mention.type) {
    case "member":
      return {
        mentionType: "member",
        mentionId: mention.member.user_id,
        mentionLabel: memberLabel(mention.member),
        seed: mention.member.avatar_seed ?? null,
        color: null,
        icon: null,
      };
    case "issue":
      return {
        mentionType: "issue",
        mentionId: mention.issue.id,
        mentionLabel: mention.issue.identifier,
        seed: null,
        color: null,
        icon: null,
      };
    case "page":
      return {
        mentionType: "page",
        mentionId: mention.page.id,
        mentionLabel: mention.page.title,
        seed: null,
        color: null,
        // L'émoji de la page voyage dans `icon`, comme le favicon d'un projet :
        // c'est le même attribut, et la pilule sait quoi en faire selon le type.
        icon: mention.page.icon,
      };
    case "objective":
      return {
        mentionType: "objective",
        mentionId: mention.objective.id,
        mentionLabel: mention.objective.name,
        seed: null,
        color: mention.objective.color,
        icon: null,
      };
    // Numo et les comptes de forge ne se citent pas dans une description : le
    // scanner d'une description ne les produit pas comme option, mais « @numo »
    // reste reconnu dans le texte — il garde donc sa pilule.
    default:
      return {
        mentionType: "numo",
        mentionId: NUMO_MENTION_ID,
        mentionLabel: "Numo",
        seed: null,
        color: null,
        icon: null,
      };
  }
}

/**
 * Marque la transaction d'hydratation. L'éditeur la reconnaît pour ne PAS la
 * compter comme une frappe : sans ça, poser les pilules à l'ouverture marquerait
 * la description « modifiée par l'utilisateur », et le panneau cesserait
 * d'accepter les écritures distantes sur un texte que personne n'a touché.
 */
export const MENTION_HYDRATION_META = "mentionHydration";

/**
 * Repose les pilules d'un texte déjà écrit : chaque « @… » reconnu devient un
 * nœud. Appelé à l'ouverture, et de nouveau quand la liste des citables arrive
 * après coup (l'index se charge au temps mort).
 *
 * Les remplacements s'appliquent DE LA FIN VERS LE DÉBUT : chacun change la
 * longueur du document, donc décale toutes les positions qui le suivent.
 * `addToHistory: false` : l'hydratation n'est pas une modification de
 * l'utilisateur, un ⌘Z ne doit pas la défaire.
 */
export function hydrateMentions(editor: Editor, scan: MentionScan): void {
  const { state } = editor;
  const mentionType = state.schema.nodes.mention;
  if (!mentionType) return;

  const found: Array<{ from: number; to: number; attrs: Record<string, unknown> }> = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    let offset = 0;
    for (const segment of scan(node.text)) {
      if (segment.mention === undefined) {
        offset += segment.text.length;
        continue;
      }
      found.push({
        from: pos + offset,
        to: pos + offset + segment.raw.length,
        attrs: attrsFromScanned(segment.mention),
      });
      offset += segment.raw.length;
    }
  });
  if (found.length === 0) return;

  const tr = state.tr;
  for (const item of found.reverse()) {
    tr.replaceWith(item.from, item.to, mentionType.create(item.attrs));
  }
  tr.setMeta("addToHistory", false);
  tr.setMeta(MENTION_HYDRATION_META, true);
  editor.view.dispatch(tr);
}

/* ── Le menu ─────────────────────────────────────────────────────────── */

interface MentionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

type MentionProps = SuggestionProps<MentionOption>;

const MentionMenu = forwardRef<MentionMenuRef, MentionProps>(function MentionMenu(
  props,
  ref,
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

  return (
    <div className="max-h-56 w-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
      {props.items.map((option, index) => (
        <MentionOptionRow
          key={`${option.type}:${option.id}`}
          option={option}
          active={index === selected}
          onPick={() => choose(index)}
          onHover={() => setSelected(index)}
        />
      ))}
    </div>
  );
});

/** Viewport breathing room, and the gap between the caret and the menu. */
const EDGE = 8;
const GAP = 6;

/**
 * Rendu impératif du menu, porté au corps du document et positionné en
 * coordonnées de FENÊTRE — même montage, et mêmes raisons, que le menu « / » du
 * carnet : dans un panneau ou un dialogue qui défile, un menu en position
 * absolue se fait couper par son conteneur.
 */
function renderMentionMenu() {
  let renderer: ReactRenderer<MentionMenuRef, MentionProps> | null = null;
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
  // props : sans ce second passage, une liste qui vient d'être filtrée est
  // placée avec sa hauteur d'avant.
  const reposition = () => {
    place();
    requestAnimationFrame(place);
  };

  return {
    onStart: (props: MentionProps) => {
      renderer = new ReactRenderer(MentionMenu, { props, editor: props.editor });
      menuEl = renderer.element as HTMLElement;
      menuEl.style.position = "fixed";
      menuEl.style.zIndex = "60"; // au-dessus des dialogues (z-50), comme les infobulles
      menuEl.style.pointerEvents = "auto";
      caretRect = () => props.clientRect?.() ?? null;
      document.body.appendChild(menuEl);
      reposition();
      window.addEventListener("scroll", place, true);
      window.addEventListener("resize", place);
    },
    onUpdate: (props: MentionProps) => {
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

export interface MentionSuggestOptions {
  /** Lue à CHAQUE frappe, pas capturée : la liste arrive souvent après le
      montage de l'éditeur (l'index se charge au temps mort). */
  items: () => MentionOption[];
  /** Le premier « @ » tapé — de quoi réclamer la liste à ce moment-là plutôt
      qu'à l'ouverture de la page. Appelé sans garantie d'unicité. */
  onQuery?: () => void;
}

/** L'extension « @ » d'une description. Se configure avec un LECTEUR de liste. */
export const MentionSuggest = Extension.create<MentionSuggestOptions>({
  name: "mentionSuggest",

  addOptions() {
    return { items: () => [] };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<MentionOption>({
        // pnpm dual @tiptap/core (même 3.27.4) — l'editor de Extension n'a pas
        // la même identité que celui de @tiptap/suggestion. Sans effet à
        // l'exécution (même remarque que pour le menu « / »).
        editor: this.editor as never,
        // Une CLÉ à soi. `Suggestion` en pose une par défaut, la même pour tout
        // le monde : le « @ » et le menu « / » d'une page se retrouvaient sur
        // la même, et ProseMirror levait au montage (MIN-270).
        pluginKey: new PluginKey("mentionSuggest"),
        char: "@",
        // Comme partout ailleurs : le libellé se cherche par son DÉBUT de mot,
        // et c'est le choix dans la liste qui pose « @Jean Dupont » en entier.
        allowSpaces: false,
        items: ({ query }) => {
          options.onQuery?.();
          return filterMentions(options.items(), query);
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "mention", attrs: attrsFromOption(props) },
              // L'espace qui suit : sans lui le caret reste collé à un nœud
              // atomique et la frappe suivante repart de travers.
              { type: "text", text: " " },
            ])
            .run();
        },
        render: renderMentionMenu,
      }),
    ];
  },
});
