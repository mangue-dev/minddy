// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SidebarBackRow, type SidebarBackBadge } from "@/components/app-sidebar";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const render = (badge?: SidebarBackBadge) =>
  act(() => root.render(<SidebarBackRow label="Home" onBack={() => {}} badge={badge} />));
const badge = () => host.querySelector<HTMLElement>("[data-sidebar-back-badge]");

it("puts the count of the level it returns to on the chevron, not after the label", async () => {
  await render({ count: 120, label: "120 to sort" });
  const label = [...host.querySelectorAll("span")].find((span) => span.textContent === "Home")!;
  expect(badge()?.textContent).toBe("99+");
  expect(badge()?.getAttribute("aria-label")).toBe("120 to sort");
  expect(badge()?.parentElement?.querySelector("svg")).not.toBeNull();
  expect(label.contains(badge())).toBe(false);
  expect(label.nextElementSibling).toBeNull();
});

it("shows an alert without a count as a bare dot, and nothing when nothing waits", async () => {
  await render({ count: 0, label: "Smart Assign incomplete", alert: true });
  expect(badge()?.textContent).toBe("");
  await render({ count: 0, label: "" });
  expect(badge()).toBeNull();
});
