"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

/** Marks the empty transaction the engine dispatches when editability changes. */
export const EDITABLE_CHANGED_META = "editableChanged";

/**
 * Whether the editor accepts edits, re-read when it changes (MIN-728).
 *
 * A node view rendered from `editor.isEditable` alone keeps the value of its
 * first render: `setEditable` emits nothing a React view hears. A live editor
 * is created read-only and becomes editable once its session attaches, so its
 * code block language picker, callout icon and image controls stayed frozen.
 * The engine follows each change with an empty transaction
 * (`EDITABLE_CHANGED_META`), which this subscription re-reads.
 */
export function useEditorEditable(editor: Editor): boolean {
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => !!current && !current.isDestroyed && current.isEditable,
  });
  return editable ?? editor.isEditable;
}
