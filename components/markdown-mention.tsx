"use client";

// “@” mentions in a DESCRIPTION (tiptap) — person, ticket, objective.
//
// Same contract as in a comment (components/editor/comment-editor.tsx): what is
// STORED is text, “@Name” / “@MIN-42” / “@Goal”, and the pill comes from it
// re-inferred on each reread by the unique rule of lib/mention-scan. The knot
// tiptap is just a coat placed on this text: it is serialized in markdown towards
// him, and the hydration rests him at the opening. Nothing new to persist,
// so nothing to migrate, and a description remains readable as is by the MCP,
// by Numo and by the code agent.
//
// The menu is brought to the body of the document, like that of the “/” in the notebook
// (components/pages/page-slash-command.tsx) and for the same reasons: in the
// panel or dialog, a menu in absolute position is cut by the
// scrolling container.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Extension, type Editor } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  ReactRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  Suggestion,
  type SuggestionMatch,
  type SuggestionProps,
  type Trigger,
} from "@tiptap/suggestion";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { MentionChip, NUMO_MENTION_ID } from "@/components/mention-chip";
import { mentionStatus, useMentionLinks } from "@/components/mention-links";
import {
  MentionOptionRow,
  MentionRowWithDivider,
  filterMentions,
  type MentionOption,
} from "@/components/mention-suggest";
import { useSemanticMentions } from "@/lib/use-semantic-mentions";
import { SemanticSearchingHint } from "@/components/semantic-searching-hint";
import { MENU_SCROLL_CLASS, MENU_SURFACE_CLASS } from "@/components/ui/menu-surface";
import { cn } from "@/lib/utils";
import type { MentionScan } from "@/lib/mention-scan";
import { MentionNodeBase } from "@/components/mention-node";
import { TypedMentionChip } from "@/components/typed-mention-chip";
import { isMentionLinkType } from "@/lib/mention-link";
import { primeMentionLabel, shownMentionLabel } from "@/lib/mention-resolution";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { findActiveMentionQuery } from "@/lib/mention-menu";
import {
  mentionAttrsFromOption,
  mentionAttrsFromScanned,
} from "@/lib/mention-attributes";

/* ── The node ───────────────────────────── ────────────────────────────── */

/** The node PLUS its pill. The schema, attributes and serialization markdown
 live separately (components/mention-node.ts): the markdown projection of pages
 mounts the bare node, outside the browser, without React. */
/** What a copied pill the reader could not see carries, as agents read it. */
const UNAVAILABLE_COPY_LABEL = "unavailable";

export const MentionNode = MentionNodeBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MentionNodeView);
  },

  /**
   * A pill is an atom the browser does not paint as selected text: inside a
   * selection it looked left out. Every pill the selection covers gets
   * `mention-selected` (app/globals.css), drawn in the selection color.
   */
  addProseMirrorPlugins() {
    const name = this.name;
    return [
      new Plugin({
        key: new PluginKey("mentionSelection"),
        props: {
          // A copied typed pill carries the label it showed — the target's
          // current one, or the neutral one — never the label stored with it
          // (MIN-734), in the HTML and in the plain text alike.
          transformCopied: (slice) => {
            const relabel = (fragment: Fragment): Fragment => {
              const children: ProseMirrorNode[] = [];
              fragment.forEach((child) => {
                const attrs = child.attrs as Record<string, unknown>;
                if (child.type.name === name && !attrs.legacy && isMentionLinkType(attrs.mentionType) &&
                    typeof attrs.mentionId === "string") {
                  const label = shownMentionLabel(attrs.mentionType, attrs.mentionId);
                  children.push(child.type.create({ ...attrs, mentionLabel: label ?? UNAVAILABLE_COPY_LABEL }));
                } else {
                  children.push(child.isLeaf ? child : child.copy(relabel(child.content)));
                }
              });
              return Fragment.fromArray(children);
            };
            return new Slice(relabel(slice.content), slice.openStart, slice.openEnd);
          },
          decorations: ({ doc, selection }) => {
            if (selection.empty) return null;
            const decorations: Decoration[] = [];
            doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name !== name) return;
              if (pos >= selection.from && pos + node.nodeSize <= selection.to) {
                decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "mention-selected" }));
              }
            });
            return decorations.length ? DecorationSet.create(doc, decorations) : null;
          },
        },
      }),
    ];
  },
});

function MentionNodeView({ node }: NodeViewProps) {
  const type = node.attrs.mentionType as MentionOption["type"] | "numo";
  const id = (node.attrs.mentionId as string | null) ?? NUMO_MENTION_ID;
  // Where does this pill lead: the surface knows it (lib/use-mention-sources), the
  // node no — it only carries the type and id. One person gets nowhere,
  // and an element that the sources do not know (yet) either: the
  // pill then remains text, which it has always been.
  const links = useMentionLinks();
  const href = links?.href(type, id) ?? null;
  // A typed reference (MIN-734) shows what the reader may see of its target,
  // never the label stored with it; a pill found by its label is already
  // the reader's own (legacy).
  if (!node.attrs.legacy && isMentionLinkType(type) && node.attrs.mentionId) {
    return (
      <NodeViewWrapper as="span" className="inline-block align-baseline">
        <TypedMentionChip
          type={type}
          id={id}
          appearance={{ seed: node.attrs.seed, color: node.attrs.color, icon: node.attrs.icon }}
        />
      </NodeViewWrapper>
    );
  }
  return (
    // `align-baseline`, like the pill she carries: a centered envelope
    // on the height of x would restore the offset that the pill has just corrected.
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <MentionChip
        type={type}
        id={id}
        href={href}
        onNavigate={href ? () => links?.navigate(type, id) : undefined}
        label={node.attrs.mentionLabel ?? ""}
        avatarSeed={node.attrs.seed}
        // The portrait of a forge account travels in the `icon` attribute —
        // a URL, like the favicon of a project.
        avatarUrl={type === "forge" ? ((node.attrs.icon as string | null) ?? undefined) : undefined}
        color={node.attrs.color}
        status={
          mentionStatus(links, type, id) ??
          (type === "issue" ? node.attrs.status ?? undefined : undefined)
        }
        tooltip={type === "issue" ? links?.issueTitle?.(id) ?? null : null}
        // The `icon` attribute carries two things depending on the type, and only one on
        // times: the favicon of a project (a URL) or the emoji of a page. THE
        // passing both without distinguishing would give a page pill
        // always wearing the generic book, never its emoji.
        iconUrl={type === "page" ? null : node.attrs.icon}
        icon={type === "page" ? node.attrs.icon : null}
      />
    </NodeViewWrapper>
  );
}

/**
 * Marks the hydration transaction. The editor recognizes it for NOT counting
 * as a keystroke: otherwise, placing the pills at the opening would mark
 * the description "modified by user", and the panel would stop
 * accepting remote writes on text that no one has touched.
 */
export const MENTION_HYDRATION_META = "mentionHydration";

/**
 * Rests the pills of an already written text: each recognized “@…” becomes a
 * node. Called upon opening, and again when the list of quotables arrives
 * afterwards (the index loads at dead time).
 *
 * Replacements apply FROM THE END TO THE BEGINNING: each changes the length of the document, therefore shifting all positions following it.
 * `addToHistory: false`: hydration is not a modification of
 * the user, a ⌘Z should not undo it.
 */
export function hydrateMentions(
  editor: Editor,
  scan: MentionScan,
  { exact = false }: {
    /**
     * Only rebuild pills whose label reads exactly like the text they replace.
     * A live page (MIN-688) sends this rebuild to every collaborator as a
     * presentation-only change, which the server accepts only when the page's
     * Markdown is unchanged: "@numo" becoming a pill labeled "Numo" would
     * change what the page says, so it stays text.
     */
    exact?: boolean;
  } = {}
): void {
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
      // Found by its label: it stays `@Label` in the text (see mention-node.ts).
      const attrs = { ...mentionAttrsFromScanned(segment.mention), legacy: true };
      if (!exact || `@${attrs.mentionLabel}` === segment.raw) {
        found.push({
          from: pos + offset,
          to: pos + offset + segment.raw.length,
          attrs,
        });
      }
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

/* ── The menu ───────────────────────────── ────────────────────────────── */

interface MentionMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

type MentionProps = SuggestionProps<MentionOption>;

const MentionMenu = forwardRef<MentionMenuRef, MentionProps>(function MentionMenu(
  props,
  ref,
) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Issues found by meaning (MIN-718) are appended HERE, after tiptap's text
  // matches: a late answer extends the list without resetting the selection,
  // which only follows tiptap's own items.
  const allOptions = (props.editor.extensionManager.extensions.find((extension) => extension.name === "mentionSuggest")
    ?.options as MentionSuggestOptions | undefined)?.items() ?? [];
  const { options: items, status: semanticStatus } = useSemanticMentions(props.items, allOptions, props.query);
  useEffect(() => setSelected(0), [props.items]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, props.items]);

  const choose = (index: number) => {
    const item = items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      const n = items.length;
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

  if (items.length === 0 && !semanticStatus) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      data-floating-surface
      className={cn("scrollbar-quiet max-h-56 w-72", MENU_SURFACE_CLASS, MENU_SCROLL_CLASS)}
    >
      {items.map((option, index) => (
        <MentionRowWithDivider key={`${option.type}:${option.id}`} options={items} index={index}>
          <MentionOptionRow
            option={option}
            active={index === selected}
            onPick={() => choose(index)}
            onHover={() => setSelected(index)}
          />
        </MentionRowWithDivider>
      ))}
      {semanticStatus && <SemanticSearchingHint status={semanticStatus} />}
    </div>
  );
});

/** Viewport breathing room, and the gap between the caret and the menu. */
const EDGE = 8;
const GAP = 6;

/** Tiptap matcher with single-space queries and a double-space exit gesture. */
function findMultiwordMentionMatch(config: Trigger): SuggestionMatch {
  const text = config.$position.nodeBefore?.isText
    ? config.$position.nodeBefore.text
    : null;
  if (!text) return null;

  const active = findActiveMentionQuery(text);
  if (!active) return null;
  if (config.startOfLine && active.start !== 0) return null;

  const textFrom = config.$position.pos - text.length;
  return {
    range: {
      from: textFrom + active.start,
      to: config.$position.pos,
    },
    query: active.query,
    text: text.slice(active.start),
  };
}

/**
 * Imperative rendering of the menu, carried to the body of the document and positioned in
 * WINDOW coordinates — same assembly, and same reasons, as the “/” menu of
 * notebook: in a scrolling panel or dialog, a menu in absolute position
 * is cut off by its container.
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

  // The size of the menu only applies to the next frame after a change of
  // props: without this second pass, a list which has just been filtered is
  // placed with its previous height.
  const reposition = () => {
    place();
    requestAnimationFrame(place);
  };

  return {
    onStart: (props: MentionProps) => {
      renderer = new ReactRenderer(MentionMenu, { props, editor: props.editor });
      menuEl = renderer.element as HTMLElement;
      menuEl.style.position = "fixed";
      menuEl.style.zIndex = "60"; // above dialogs (z-50), like tooltips
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
  /** Read on EACH keystroke, not captured: the list often arrives after the editor is mounted (the index loads at dead time). */
  items: () => MentionOption[];
  /** The first “@” typed — enough to request the list at that moment rather
 than when opening the page. Called without guarantee of uniqueness. */
  onQuery?: () => void;
}

/** The “@” extension of a description. Configured with a list READER. */
export const MentionSuggest = Extension.create<MentionSuggestOptions>({
  name: "mentionSuggest",

  addOptions() {
    return { items: () => [] };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<MentionOption>({
        // pnpm dual @tiptap/core (even 3.27.4) — the Extension editor does not have
        // the same identity as that of @tiptap/suggestion. No effect on
        // execution (same remark as for the “/” menu).
        editor: this.editor as never,
        // A KEY to yourself. `Suggestion` sets one by default, the same for everything
        // the world: the “@” and the “/” menu of a page were found on
        // the same, and ProseMirror raised during editing (MIN-270).
        pluginKey: new PluginKey("mentionSuggest"),
        char: "@",
        // One space stays inside the query; a second consecutive space closes it.
        allowSpaces: true,
        findSuggestionMatch: findMultiwordMentionMatch,
        items: ({ query }) => {
          options.onQuery?.();
          return filterMentions(options.items(), query);
        },
        command: ({ editor, range, props }) => {
          // The reader just picked it, so they can see it: its pill shows at
          // once, without waiting for the server (MIN-734).
          if (isMentionLinkType(props.type)) {
            primeMentionLabel(props.type, props.id, props.label, props.objectiveStatus);
          }
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "mention", attrs: mentionAttrsFromOption(props) },
              // The space that follows: without it the caret remains stuck to a node
              // atomic and the next keystroke goes wrong.
              { type: "text", text: " " },
            ])
            .run();
        },
        render: renderMentionMenu,
      }),
    ];
  },
});
