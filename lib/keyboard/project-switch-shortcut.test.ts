// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  isProjectSwitchShortcut,
  sidebarTakesProjectSwitch,
} from "@/lib/keyboard/project-switch-shortcut";

type Ev = Parameters<typeof sidebarTakesProjectSwitch>[0];

function ev(over: Partial<Ev> = {}): Ev {
  return {
    key: "P",
    repeat: false,
    metaKey: true,
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    defaultPrevented: false,
    ...over,
  };
}

/** jsdom has no layout: give an element the client rect a displayed one has. */
function displayed(element: HTMLElement): HTMLElement {
  element.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
  return element;
}

function trigger(): HTMLElement {
  const button = displayed(document.createElement("button"));
  document.body.append(button);
  return button;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isProjectSwitchShortcut", () => {
  it("accepts Cmd+Shift+P and Ctrl+Shift+P", () => {
    expect(isProjectSwitchShortcut(ev())).toBe(true);
    expect(isProjectSwitchShortcut(ev({ metaKey: false, ctrlKey: true }))).toBe(true);
  });

  it("leaves the command palette's Cmd+P and the copy-prompt Shift+P alone", () => {
    expect(isProjectSwitchShortcut(ev({ shiftKey: false, key: "p" }))).toBe(false);
    expect(isProjectSwitchShortcut(ev({ metaKey: false }))).toBe(false);
    expect(isProjectSwitchShortcut(ev({ altKey: true }))).toBe(false);
  });
});

describe("sidebarTakesProjectSwitch", () => {
  it("opens the switcher of a displayed trigger", () => {
    expect(sidebarTakesProjectSwitch(ev(), trigger())).toBe(true);
  });

  it("stands aside once another handler took the keystroke", () => {
    expect(sidebarTakesProjectSwitch(ev({ defaultPrevented: true }), trigger())).toBe(false);
  });

  it("stands aside while a dialog is open, which owns the shortcut", () => {
    const dialog = displayed(document.createElement("div"));
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.append(dialog);
    expect(sidebarTakesProjectSwitch(ev(), trigger())).toBe(false);
  });

  it("closes its own open menu, although that menu is a popover dialog", () => {
    const menu = displayed(document.createElement("div"));
    menu.setAttribute("role", "dialog");
    menu.setAttribute("data-state", "open");
    document.body.append(menu);
    expect(sidebarTakesProjectSwitch(ev(), trigger(), true)).toBe(true);
    expect(sidebarTakesProjectSwitch(ev({ defaultPrevented: true }), trigger(), true)).toBe(false);
  });

  it("ignores a trigger that is not displayed", () => {
    const hidden = document.createElement("button");
    document.body.append(hidden);
    expect(sidebarTakesProjectSwitch(ev(), hidden)).toBe(false);
    expect(sidebarTakesProjectSwitch(ev(), null)).toBe(false);
  });
});
