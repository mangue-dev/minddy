// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { NotificationBadge } from "./notification-badge";
import { countLabel } from "./nav-badge";

describe("NotificationBadge", () => {
  it("caps the count at 99+", () => {
    expect(countLabel(3)).toBe("3");
    expect(countLabel(120)).toBe("99+");
  });

  it("reads its label to screen readers and renders nothing at zero", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<NotificationBadge count={3} label="3 unread notifications" />));
    const badge = host.querySelector("[role=status]");
    expect(badge?.getAttribute("aria-label")).toBe("3 unread notifications");
    expect(badge?.textContent).toBe("3");
    act(() => root.render(<NotificationBadge count={0} label="none" />));
    expect(host.querySelector("[role=status]")).toBeNull();
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });
});
