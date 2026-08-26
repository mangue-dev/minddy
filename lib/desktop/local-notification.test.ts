import { describe, expect, it, vi } from "vitest";

import {
  DesktopLocalNotificationRegistry,
  MAX_ACTIVE_DESKTOP_NOTIFICATIONS,
  desktopLocalNotificationUrl,
  parseDesktopLocalNotification,
} from "./local-notification";

describe("parseDesktopLocalNotification", () => {
  it("accepts bounded text and a relative minddy route", () => {
    expect(
      parseDesktopLocalNotification({
        id: "notification-1",
        title: "MIN-474",
        body: "Someone commented",
        target: "/projects/p?issue=i#comment",
      })
    ).toEqual({
      id: "notification-1",
      title: "MIN-474",
      body: "Someone commented",
      target: "/projects/p?issue=i#comment",
    });
  });

  it.each([
    null,
    {},
    { id: "", title: "Title", body: "", target: null },
    { id: "id", title: "", body: "", target: null },
    { id: "id", title: "Title", body: "", target: "https://evil.example" },
    { id: "id", title: "Title", body: "", target: "//evil.example" },
    { id: "id", title: "x".repeat(161), body: "", target: null },
  ])("rejects an invalid payload %#", (payload) => {
    expect(parseDesktopLocalNotification(payload)).toBeNull();
  });
});

describe("desktopLocalNotificationUrl", () => {
  it("routes clicks within the selected desktop origin", () => {
    expect(
      desktopLocalNotificationUrl(
        "https://preview.minddy.app",
        "/projects/p?issue=i#comment"
      )
    ).toBe("https://preview.minddy.app/projects/p?issue=i#comment");
  });

  it("refuses absolute and protocol-relative click targets", () => {
    expect(
      desktopLocalNotificationUrl("https://www.minddy.app", "https://evil.example")
    ).toBeNull();
    expect(
      desktopLocalNotificationUrl("https://www.minddy.app", "//evil.example")
    ).toBeNull();
  });
});

describe("DesktopLocalNotificationRegistry", () => {
  it("suppresses duplicate ids and replaces the banner for one target", () => {
    const registry = new DesktopLocalNotificationRegistry();
    const first = { close: vi.fn() };
    const duplicate = { close: vi.fn() };
    const replacement = { close: vi.fn() };

    expect(
      registry.track({ id: "1", title: "A", body: "", target: "/inbox" }, first)
    ).toBe(true);
    expect(
      registry.track(
        { id: "1", title: "A again", body: "", target: "/other" },
        duplicate
      )
    ).toBe(false);
    expect(
      registry.track({ id: "2", title: "B", body: "", target: "/inbox" }, replacement)
    ).toBe(true);

    expect(first.close).toHaveBeenCalledOnce();
    expect(duplicate.close).not.toHaveBeenCalled();
    expect(registry.size).toBe(1);
  });

  it("dismisses read notifications and forgets user-closed notifications", () => {
    const registry = new DesktopLocalNotificationRegistry();
    const dismissed = { close: vi.fn() };
    const userClosed = { close: vi.fn() };
    registry.track({ id: "1", title: "A", body: "", target: null }, dismissed);
    registry.track({ id: "2", title: "B", body: "", target: null }, userClosed);

    expect(registry.dismiss("1")).toBe(true);
    registry.forget("2");

    expect(dismissed.close).toHaveBeenCalledOnce();
    expect(userClosed.close).not.toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  it("evicts the oldest banner at the active-object limit", () => {
    const registry = new DesktopLocalNotificationRegistry();
    const handles = Array.from(
      { length: MAX_ACTIVE_DESKTOP_NOTIFICATIONS + 1 },
      () => ({ close: vi.fn() })
    );
    handles.forEach((handle, index) => {
      registry.track(
        { id: String(index), title: "Title", body: "", target: null },
        handle
      );
    });

    expect(handles[0].close).toHaveBeenCalledOnce();
    expect(registry.size).toBe(MAX_ACTIVE_DESKTOP_NOTIFICATIONS);
  });
});
