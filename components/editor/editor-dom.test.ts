// @vitest-environment jsdom
//
// An editor built during render exists before its view, and a retained tab
// hidden by Activity unmounts the view and mounts another (MIN-728). DOM
// listeners must follow, and reading the DOM early must not throw.
import { expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { onEditorDom } from "./editor-dom";

it("binds to each mounted view and never reads one that is not there", () => {
  const editor = new Editor({ element: null, extensions: [StarterKit] });
  const detach = vi.fn();
  const attach = vi.fn(() => detach);

  const stop = onEditorDom(editor, attach);
  expect(attach).not.toHaveBeenCalled();

  editor.mount(document.createElement("div"));
  expect(attach).toHaveBeenCalledTimes(1);
  const first = (attach.mock.calls[0] as unknown[])[0];

  editor.unmount();
  expect(detach).toHaveBeenCalledTimes(1);

  editor.mount(document.createElement("div"));
  expect(attach).toHaveBeenCalledTimes(2);
  expect((attach.mock.calls[1] as unknown[])[0]).not.toBe(first);

  stop();
  expect(detach).toHaveBeenCalledTimes(2);
  editor.destroy();
});
