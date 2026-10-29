// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentionOption } from "@/components/mention-suggest";
import { bodyToMarkdown } from "@/lib/pages-markdown";
import { PageEditor, type PageEditorMentions } from "@/components/pages/page-editor";

// One stable translator that returns its key, as in page-editor-mentions.test.
const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("@/components/pages/block-gutter", () => ({ BlockGutter: () => null }));
vi.mock("@/components/pages/page-comment-bubble", () => ({ PageCommentBubble: () => null }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkMenu: () => null }));

const options: MentionOption[] = [
  { type: "page", id: "p1", label: "Roadmap" },
  { type: "member", id: "u1", label: "Camille Roy" },
  { type: "issue", id: "i1", label: "MIN-42", detail: "Fix login" },
];
const mentions: PageEditorMentions = {
  items: () => options,
  scan: (value) => [{ text: value }],
};

let root: Root;
const editorRef = { current: null as Editor | null };

const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
});

async function type(text: string) {
  await act(async () => {
    const { view } = editorRef.current!;
    view.dispatch(view.state.tr.insertText(text));
  });
  await settle();
}

async function press(key: string) {
  await act(async () => {
    editorRef.current!.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await settle();
}

const menu = () => document.body.querySelector<HTMLElement>("[data-floating-surface]");
const headers = () => [...document.body.querySelectorAll("[data-suggestion-section]")].map((node) => node.textContent);
const selectedOption = () => document.body.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? null;
const closeRow = () => document.body.querySelector<HTMLElement>("[data-suggestion-close]");
const chip = () => editorRef.current!.view.dom.querySelector(".suggestion-chip");
const placeholder = () => editorRef.current!.view.dom.querySelector(".suggestion-chip-placeholder");

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  // jsdom has no Range geometry; ProseMirror measures one when a menu that
  // closes itself hands the focus back to the editor.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => {
    root.render(createElement(PageEditor, { initialContent: null, onChange: () => {}, editorRef, mentions }));
  });
  await settle();
  await act(async () => {
    editorRef.current!.commands.focus("start");
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("lists the “/” blocks in sections and draws the query as a chip that never enters the document", async () => {
  await type("/");
  expect(headers()).toEqual(["slashGroupBasic", "slashGroupLists", "slashGroupAdvanced"]);
  expect(selectedOption()).toBe("blockParagraph");
  // The chip and its placeholder are decorations of the open query.
  expect(chip()?.textContent).toBe("/");
  expect(placeholder()?.textContent).toBe("typeToSearch");
  const editor = editorRef.current!;
  expect(editor.getText()).toBe("/");
  expect(JSON.stringify(editor.getJSON())).not.toContain("typeToSearch");
  expect(JSON.stringify(editor.getJSON())).not.toContain("suggestion-chip");
  expect(bodyToMarkdown(editor.getJSON())).not.toContain("typeToSearch");

  // A query hides the placeholder, keeps the chip and filters the list.
  await type("quo");
  expect(placeholder()).toBeNull();
  expect(chip()?.textContent).toBe("/quo");
  expect([...document.body.querySelectorAll('[role="option"]')].map((node) => node.textContent)).toEqual(["blockQuote"]);
});

it("walks to “Close menu” from the first item, wraps back, and closes leaving the text", async () => {
  await type("/");
  await press("ArrowUp");
  expect(closeRow()?.getAttribute("aria-selected")).toBe("true");
  expect(selectedOption()).toBeNull();
  await press("ArrowDown");
  expect(selectedOption()).toBe("blockParagraph");
  await press("ArrowUp");
  await press("Enter");

  expect(menu()).toBeNull();
  expect(chip()).toBeNull();
  expect(placeholder()).toBeNull();
  expect(editorRef.current!.getText()).toBe("/");
  // Closed as Escape does: typing on does not bring it back.
  await type("x");
  expect(menu()).toBeNull();
  expect(editorRef.current!.getText()).toBe("/x");
});

it("keeps one space in a query and closes on two, for “/” and “@” alike", async () => {
  await type("/bullet");
  await type(" ");
  expect(menu()).not.toBeNull();
  expect(chip()?.textContent).toBe("/bullet ");
  await type(" ");
  expect(menu()).toBeNull();
  expect(chip()).toBeNull();
  expect(editorRef.current!.getText()).toBe("/bullet  ");

  await type("@cam ");
  expect(menu()).not.toBeNull();
  await type(" ");
  expect(menu()).toBeNull();
  expect(editorRef.current!.getText()).toBe("/bullet  @cam  ");
});

it("ends a bare “/” or “@” on its first space", async () => {
  await type("/");
  await type(" ");
  expect(menu()).toBeNull();
  expect(chip()).toBeNull();
  await type("@");
  expect(menu()).not.toBeNull();
  await type(" ");
  expect(menu()).toBeNull();
  expect(editorRef.current!.getText()).toBe("/ @ ");
});

it("closes on a query with no match, but not while a search by meaning runs", async () => {
  await type("/zzz");
  expect(menu()).toBeNull();
  expect(editorRef.current!.getText()).toBe("/zzz");

  // A description long enough to be searched by meaning keeps the menu open
  // until the answer arrives (it never does here).
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  await type(" @quarterly roadmap");
  expect(menu()).not.toBeNull();
});

it("closes on a click on “Close menu”", async () => {
  await type("/");
  await act(async () => closeRow()!.click());
  await settle();
  expect(menu()).toBeNull();
  expect(editorRef.current!.getText()).toBe("/");
});

it("groups “@” mentions by type, keeps spaces in the query, and closes on Escape", async () => {
  await type("@");
  expect(headers()).toEqual(["mentionSectionPages", "mentionSectionPeople", "mentionSectionIssues"]);
  expect(chip()?.textContent).toBe("@");
  expect(placeholder()?.textContent).toBe("typeToSearch");

  await type("cam");
  expect(headers()).toEqual(["mentionSectionPeople"]);
  // A space does not end a mention query: names have several words.
  await type(" ");
  expect(menu()).not.toBeNull();
  expect(chip()?.textContent).toBe("@cam ");

  await press("Escape");
  expect(menu()).toBeNull();
  expect(chip()).toBeNull();
  expect(editorRef.current!.getText()).toBe("@cam ");
});

it("gives the Numo composer's “@” list the same sections and close row", async () => {
  const { MentionSuggestions, sectionedMentions } = await import("@/components/mention-suggest");
  const onClose = vi.fn();
  const onHover = vi.fn();
  const ordered = sectionedMentions(options).ordered;
  await act(async () => {
    root.render(createElement(MentionSuggestions, {
      options: ordered, activeIndex: ordered.length, onPick: vi.fn(), onHover, onClose,
    }));
  });
  expect(headers()).toEqual(["mentionSectionPages", "mentionSectionPeople", "mentionSectionIssues"]);
  expect(closeRow()?.getAttribute("aria-selected")).toBe("true");
  await act(async () => closeRow()!.click());
  expect(onClose).toHaveBeenCalledOnce();
});
