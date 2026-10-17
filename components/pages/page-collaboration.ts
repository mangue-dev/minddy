"use client";

// LIVE COLLABORATION in the page editor (MIN-688): the collab plugin that turns
// every local transaction into steps for the operation authority, and the
// decorations that draw collaborators' carets and selections.
//
// Named `pageCollaboration`, never `collaboration`: the installed UniqueID
// extension looks for an extension called `collaboration` to switch to its Yjs
// initialization path, which this editor does not use.
//
// Carets are DECORATIONS, not content: ProseMirror redraws them from the
// current state on every update, so a remote edit moves them with the text and
// nothing about them reaches the document, its history or its Markdown.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { collabPlugin, type CollabStream } from "@/lib/page-collaboration-stream";

/** A collaborator's caret as the editor draws it. */
export interface CaretView {
  sessionId: string;
  name: string;
  color: string;
  revision: number;
  anchor: number;
  head: number;
}

/** What the page surface hands the editor for one live session. */
export interface BodyCollaboration {
  stream: CollabStream;
  clientId: string;
  /** Whether this session may send (a reader only receives). */
  canSend: boolean;
  /** Other sessions' body carets, read at drawing time. */
  carets: () => CaretView[];
  /** Calls back when `carets()` changed; returns the unsubscription. */
  onCaretsChange: (listener: () => void) => () => void;
  /** This session's selection, in local positions, or `null` when blurred. */
  publishCaret: (selection: { anchor: number; head: number } | null) => void;
  /** The editor attached or detached (it is read-only while not attached). */
  onAttachedChange: (listener: (attached: boolean) => void) => () => void;
  /** False once the server refused a pill rebuild: never resend it. */
  canHydrate: () => boolean;
}

export const pageCaretsKey = new PluginKey("pageCollaborationCarets");

/** Up to 10 distinct, legible hues; white labels pass contrast on each. */
const CARET_COLORS = [
  "#2563eb", "#db2777", "#047857", "#b45309", "#7c3aed",
  "#dc2626", "#0e7490", "#4f46e5", "#a21caf", "#15803d",
];

/** A stable color per account: the same person keeps it on every screen. */
export function caretColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return CARET_COLORS[Math.abs(hash) % CARET_COLORS.length];
}

function caretWidget(caret: CaretView): HTMLElement {
  const caretEl = document.createElement("span");
  caretEl.className = "page-collab-caret";
  caretEl.style.setProperty("--collab-color", caret.color);
  caretEl.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "page-collab-caret-label";
  // textContent, never HTML: a display name is user-controlled text.
  label.textContent = caret.name;
  caretEl.append(label);
  return caretEl;
}

function caretsPlugin(binding: BodyCollaboration): Plugin {
  return new Plugin({
    key: pageCaretsKey,
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        for (const caret of binding.carets()) {
          const head = binding.stream.fromConfirmed(caret.head, caret.revision, state);
          const anchor = binding.stream.fromConfirmed(caret.anchor, caret.revision, state);
          // A revision we have not reached, or one too old to map: hide it
          // rather than draw it in the wrong place.
          if (head === null || anchor === null) continue;
          const from = Math.min(anchor, head);
          const to = Math.max(anchor, head);
          if (from < to) {
            decorations.push(Decoration.inline(from, to, {
              class: "page-collab-selection",
              style: `--collab-color: ${caret.color}`,
            }));
          }
          decorations.push(Decoration.widget(head, () => caretWidget(caret), {
            key: `${caret.sessionId}:${caret.color}:${caret.name}`,
            side: 1,
            ignoreSelection: true,
          }));
        }
        return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
      },
    },
  });
}

export const PageCollaboration = Extension.create<{ binding: BodyCollaboration | null }>({
  name: "pageCollaboration",

  addOptions() {
    return { binding: null };
  },

  addProseMirrorPlugins() {
    const binding = this.options.binding;
    if (!binding) return [];
    // The version is read when THIS editor is built: a recreated editor starts
    // at the stream's current revision, then `attach` rebases it.
    return [collabPlugin(binding.stream.version, binding.clientId), caretsPlugin(binding)];
  },
});
