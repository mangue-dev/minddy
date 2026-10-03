// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { expect, it, vi } from "vitest";
import { pageExtensions } from "@/components/pages/page-extensions";
import { shouldShowSelectionMenu } from "@/components/pages/page-comment-bubble";

vi.mock("mangue-ui", () => ({ cn: () => "" }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkEditDialog: () => null }));
vi.mock("@/components/ui/tooltip", () => ({ Tooltip: () => null, TooltipContent: () => null, TooltipTrigger: () => null }));

it("handles a delayed selection menu across real editor unmount and remount", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, content: "<p>Navigation selection</p>", extensions: pageExtensions({ headless: true }) });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    editor.commands.setTextSelection({ from: 1, to: 9 });
    editor.view.dom.focus();
    expect(shouldShowSelectionMenu({ editor })).toBe(true);
    editor.unmount();
    expect(editor.isInitialized).toBe(false);
    expect(shouldShowSelectionMenu({ editor })).toBe(false);
    editor.mount(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    editor.view.dom.focus();
    expect(shouldShowSelectionMenu({ editor })).toBe(true);
  } finally { editor.destroy(); element.remove(); }
});
