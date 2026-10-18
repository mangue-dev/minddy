"use client";

import type { Editor } from "@tiptap/core";

type Detach = void | (() => void);

/**
 * Run `attach` on the editor's DOM whenever it has one (MIN-728).
 *
 * An editor built during render exists before `EditorContent` mounts its
 * view, and a retained surface hidden by Activity unmounts the view and
 * mounts a new one when shown again. Reading `editor.view.dom` at the wrong
 * moment throws, and a listener bound to the first view would be lost with it.
 * This follows tiptap's `mount` and `unmount` events instead. Returns the
 * cleanup.
 */
export function onEditorDom(editor: Editor, attach: (dom: HTMLElement) => Detach): () => void {
  let detach: Detach;
  const unbind = () => {
    if (typeof detach === "function") detach();
    detach = undefined;
  };
  const bind = () => {
    unbind();
    if (editor.isDestroyed) return;
    let dom: HTMLElement | null = null;
    try {
      dom = editor.view.dom;
    } catch {
      dom = null; // Not mounted yet: the `mount` event binds it.
    }
    if (dom) detach = attach(dom);
  };
  const events = editor as unknown as {
    on(event: string, listener: () => void): void;
    off(event: string, listener: () => void): void;
  };
  bind();
  events.on("mount", bind);
  events.on("unmount", unbind);
  return () => {
    events.off("mount", bind);
    events.off("unmount", unbind);
    unbind();
  };
}
