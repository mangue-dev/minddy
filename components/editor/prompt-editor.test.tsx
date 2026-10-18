// @vitest-environment jsdom
//
// The routine instruction runs the shared engine (MIN-728) on a paragraph-only
// catalog, and reports the same plain text and mention identities as the
// field it replaced.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { PromptEditor } from "./prompt-editor";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("mangue-ui", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/pages/page-comment-bubble", () => ({ PageCommentBubble: () => null }));
vi.mock("@/components/markdown-link-menu", () => ({ MarkdownLinkMenu: () => null }));
vi.mock("@/components/assistant/skill-preview-dialog", () => ({ SkillPreviewDialog: () => null }));
vi.mock("@/components/assistant/skill-chip", () => ({
  SkillChip: ({ name }: { name: string }) => createElement("span", { "data-skill-chip": name }, name),
}));
vi.mock("@/components/mention-chip", () => ({
  NUMO_MENTION_ID: "__numo__",
  MentionChip: ({ label }: { label: string }) => createElement("span", { "data-chip": label }, label),
}));

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const skills = [{ path: "s/review/SKILL.md", name: "review", description: "Review", source: ".agents/skills" }] as never;
const mentions = [{ type: "member" as const, id: "u1", label: "Alice", occurrence: 0 }];

function render(value: string, onChange: (text: string, found: unknown[]) => void) {
  return act(async () => {
    root.render(createElement(PromptEditor, {
      value, mentions, onChange, skills,
      mentionSources: { options: [], scan: (text) => [{ type: "text", text }] },
    }));
    await settle();
  });
}

const liveEditor = () =>
  (host.querySelector(".ProseMirror") as unknown as { editor: Editor }).editor;

it("opens the stored instruction with its pills and badges, without reporting an edit", async () => {
  const onChange = vi.fn();
  await render("Ask @Alice to run /review\nThen report.", onChange);
  expect(host.querySelector("[data-chip=Alice]")).not.toBeNull();
  expect(host.querySelector("[data-skill-chip=review]")).not.toBeNull();
  expect(host.querySelectorAll(".ProseMirror p")).toHaveLength(2);
  expect(onChange).not.toHaveBeenCalled();
  const schema = liveEditor().schema;
  expect(schema.nodes.heading).toBeUndefined();
  expect(schema.nodes.bulletList).toBeUndefined();
});

it("reports plain text and the mention identities after an edit", async () => {
  const onChange = vi.fn();
  await render("Ask @Alice to run /review", onChange);
  await act(async () => {
    const editor = liveEditor();
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, { type: "text", text: " if 5 > 3" });
    await settle();
  });
  expect(onChange).toHaveBeenLastCalledWith("Ask @Alice to run /review if 5 > 3",
    [expect.objectContaining({ id: "u1", label: "Alice", occurrence: 0 })]);
});

it("takes an external write such as a dictation", async () => {
  const onChange = vi.fn();
  await render("First", onChange);
  await render("First and dictated", onChange);
  expect(liveEditor().getText()).toBe("First and dictated");
  expect(onChange).not.toHaveBeenCalled();
});

it("pastes text as typed, without Markdown entities", async () => {
  const onChange = vi.fn();
  await render("Start", onChange);
  vi.stubGlobal("ClipboardEvent", class extends Event {});
  await act(async () => {
    const editor = liveEditor();
    editor.commands.focus("end");
    editor.view.pasteText(" if 5 > 3, add <Button>");
    await settle();
  });
  expect(onChange).toHaveBeenLastCalledWith("Start if 5 > 3, add <Button>", []);
});
