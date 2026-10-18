// @vitest-environment jsdom
//
// A live description's editor is built read-only and becomes editable once
// its session attaches (MIN-728). Node views must hear that change, or the
// code block's language picker and the image and callout controls stay frozen.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EDITABLE_CHANGED_META, useEditorEditable } from "./use-editor-editable";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("re-reads editability after the engine's notification", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit], editable: false });
  const seen: boolean[] = [];
  function Probe() {
    seen.push(useEditorEditable(editor));
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(createElement(Probe)));
  expect(seen.at(-1)).toBe(false);

  await act(async () => {
    editor.setEditable(true, false);
    editor.view.dispatch(editor.state.tr.setMeta(EDITABLE_CHANGED_META, true));
  });
  expect(seen.at(-1)).toBe(true);

  await act(async () => root.unmount());
  editor.destroy();
});
