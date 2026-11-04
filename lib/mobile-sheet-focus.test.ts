// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/lib/app-layout", () => ({ isMobileLayout: () => layout.mobile }));

import { focusMobileSheet, primeMobileKeyboard } from "./mobile-sheet-focus";

const primer = () => document.querySelector<HTMLInputElement>("[data-keyboard-primer]");

beforeEach(() => {
  layout.mobile = true;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("primeMobileKeyboard", () => {
  it("focuses a stand-in field during the tap and removes it once a real field takes over", () => {
    primeMobileKeyboard();
    expect(document.activeElement).toBe(primer());
    expect(primer()?.getAttribute("aria-hidden")).toBe("true");

    const search = document.createElement("input");
    document.body.append(search);
    search.focus();

    expect(document.activeElement).toBe(search);
    expect(primer()).toBeNull();
  });

  it("gives the keyboard back after a second when nothing takes it", () => {
    primeMobileKeyboard();
    vi.advanceTimersByTime(1000);
    expect(primer()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing in the desktop layout", () => {
    layout.mobile = false;
    primeMobileKeyboard();
    expect(primer()).toBeNull();
  });
});

describe("focusMobileSheet", () => {
  function openEvent(sheet: HTMLElement) {
    const event = new Event("focusScope.autoFocusOnMount", { cancelable: true });
    Object.defineProperty(event, "target", { value: sheet });
    return event;
  }

  it("focuses the sheet itself so no field raises the keyboard", () => {
    const sheet = document.createElement("div");
    sheet.tabIndex = -1;
    sheet.append(document.createElement("input"));
    document.body.append(sheet);

    const event = openEvent(sheet);
    focusMobileSheet(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(sheet);
  });

  it("keeps a field of the sheet its caller already focused", () => {
    const sheet = document.createElement("div");
    sheet.tabIndex = -1;
    const search = document.createElement("input");
    sheet.append(search);
    document.body.append(sheet);
    search.focus();

    focusMobileSheet(openEvent(sheet));

    expect(document.activeElement).toBe(search);
  });
});
