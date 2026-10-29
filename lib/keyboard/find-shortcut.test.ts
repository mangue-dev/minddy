// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { matchesFindShortcut, surfaceOwnsScreen } from "@/lib/keyboard/find-shortcut";

const key = (patch: Partial<KeyboardEvent>) =>
  ({ key: "f", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...patch }) as KeyboardEvent;

describe("find shortcut", () => {
  it("is ⌘F on a Mac and Ctrl+F elsewhere, exactly", () => {
    expect(matchesFindShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(matchesFindShortcut(key({ metaKey: true, key: "F" }), true)).toBe(true);
    // Ctrl+F moves the caret forward in a Mac text field.
    expect(matchesFindShortcut(key({ ctrlKey: true }), true)).toBe(false);
    expect(matchesFindShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(matchesFindShortcut(key({ metaKey: true }), false)).toBe(false);
    expect(matchesFindShortcut(key({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(matchesFindShortcut(key({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(matchesFindShortcut(key({ metaKey: true, key: "g" }), true)).toBe(false);
  });
});

describe("surface scope", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const hidden = new Set<Element>();
  const visible = (element: Element) => !hidden.has(element) && !element.closest("[data-hidden]");

  function mount(html: string) {
    document.body.innerHTML = html;
    return (id: string) => document.getElementById(id)!;
  }

  it("lets a displayed page own the screen when no dialog is open", () => {
    const get = mount(`<main><div id="page"></div></main><div data-hidden><div id="retained"></div></div>`);
    expect(surfaceOwnsScreen(get("page"), visible)).toBe(true);
    expect(surfaceOwnsScreen(get("retained"), visible)).toBe(false);
  });

  it("gives ⌘F to the document inside the topmost dialog only", () => {
    const get = mount(`
      <main><div id="page"></div></main>
      <div role="dialog" data-state="open"><div id="panel"></div></div>`);
    expect(surfaceOwnsScreen(get("page"), visible)).toBe(false);
    expect(surfaceOwnsScreen(get("panel"), visible)).toBe(true);
  });

  it("keeps the browser's find under an unrelated dialog", () => {
    const get = mount(`
      <div role="dialog" data-state="open"><div id="notebook"></div></div>
      <div role="alertdialog" data-state="open"><p>Confirm</p></div>`);
    expect(surfaceOwnsScreen(get("notebook"), visible)).toBe(false);
  });

  it("ignores dialogs that are closed or hidden", () => {
    const get = mount(`
      <main><div id="page"></div></main>
      <div role="dialog" data-state="closed"></div>
      <div role="dialog" data-state="open" data-hidden></div>`);
    expect(surfaceOwnsScreen(get("page"), visible)).toBe(true);
  });
});
