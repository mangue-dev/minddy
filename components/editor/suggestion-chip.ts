// The search chip of a typed trigger ("/", "@", "$"): while a query is open,
// its trigger and what follows are drawn as one inline token, shaped like a
// mention pill, and an empty query shows a muted "Type to search" after the
// caret.
//
// Both are DECORATIONS read from the suggestion plugin's own state, never
// document content: nothing reaches the Markdown, the history or a
// collaboration session, and the chip disappears with the query (a pick,
// Escape, a space, "Close menu"), leaving the typed text as plain text.
//
// - The token is the suggestion utility's inline decoration over its range:
//   `SUGGESTION_CHIP_CLASS` is passed as its `decorationClass`. Tiptap also
//   reads that decoration's node to place the menu, so it is kept rather than
//   drawn a second time.
// - The placeholder is a widget decoration at the end of the range, drawn by
//   the plugin below, only while the query is empty.

import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SuggestionMatch, Trigger } from "@tiptap/suggestion";
import { findActiveTriggerQuery } from "@/lib/mention-menu";

/**
 * The query matcher of the “/” and “@” menus: ONE space stays inside the
 * query (“@Camille Roy”, “/bullet list”), TWO consecutive spaces end it and
 * leave the text as typed — as do Escape and “Close menu”.
 */
export function findSpacedSuggestionMatch(config: Trigger): SuggestionMatch {
  const text = config.$position.nodeBefore?.isText ? config.$position.nodeBefore.text : null;
  if (!text) return null;
  const active = findActiveTriggerQuery(text, config.char);
  if (!active) return null;
  if (config.startOfLine && active.start !== 0) return null;
  const textFrom = config.$position.pos - text.length;
  return {
    range: { from: textFrom + active.start, to: config.$position.pos },
    query: active.query,
    text: text.slice(active.start),
  };
}

/** The token over the trigger and its query (app/globals.css). */
export const SUGGESTION_CHIP_CLASS = "suggestion-chip";
/** Added to the token while the query is empty: it joins the placeholder. */
export const SUGGESTION_CHIP_EMPTY_CLASS = "suggestion-chip-empty";
/** The "Type to search" widget. */
export const SUGGESTION_PLACEHOLDER_CLASS = "suggestion-chip-placeholder";

/** What the suggestion plugin keeps in its state, as far as the chip reads it. */
interface SuggestionChipState {
  active: boolean;
  range: { from: number; to: number };
  query: string | null;
}

/** The decorations of one suggestion, for its current state. */
export function suggestionPlaceholderDecorations(
  state: EditorState,
  suggestion: SuggestionChipState | undefined,
  placeholder: string,
): DecorationSet | null {
  if (!suggestion?.active || suggestion.query || !placeholder) return null;
  const { to } = suggestion.range;
  if (to < 0 || to > state.doc.content.size) return null;
  return DecorationSet.create(state.doc, [
    Decoration.widget(
      to,
      () => {
        const span = document.createElement("span");
        span.className = SUGGESTION_PLACEHOLDER_CLASS;
        span.textContent = placeholder;
        // Read by the menu, not by assistive technology twice.
        span.setAttribute("aria-hidden", "true");
        span.contentEditable = "false";
        return span;
      },
      // After the caret, which stays right behind the trigger; and a new key
      // per text, so a language switch redraws it.
      { side: 1, ignoreSelection: true, key: `suggestion-placeholder:${placeholder}` },
    ),
  ]);
}

/**
 * The placeholder plugin of one suggestion, keyed after it. `placeholder` is
 * read at each state, so a surface can pass a translated text that arrives
 * after the editor is built.
 */
export function suggestionPlaceholder(
  suggestionKey: PluginKey,
  /** The suggestion's own name: the plugin is keyed `<name>Placeholder`. */
  name: string,
  placeholder: () => string | undefined,
): Plugin {
  return new Plugin({
    key: new PluginKey(`${name}Placeholder`),
    props: {
      decorations: (state) =>
        suggestionPlaceholderDecorations(
          state,
          suggestionKey.getState(state) as SuggestionChipState | undefined,
          placeholder() ?? "",
        ),
    },
  });
}
