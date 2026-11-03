// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";

vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function Theme() {
  const [value, setValue] = useState<(typeof OPTIONS)[number]["value"]>("dark");
  return <SegmentedControl options={OPTIONS} value={value} onChange={setValue} label="Theme" />;
}

const radios = () => [...container.querySelectorAll<HTMLButtonElement>("[role=radio]")];
const key = (target: HTMLElement, name: string) =>
  act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })); });

it("reads as a named radio group with one Tab stop (4.1.2)", async () => {
  await act(async () => root.render(createElement(Theme)));
  const group = container.querySelector("[role=radiogroup]")!;
  expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent).toBe("Theme");
  expect(radios().map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);
});

it("moves and chooses with the arrows, Home and End", async () => {
  await act(async () => root.render(createElement(Theme)));
  await key(radios()[1], "ArrowRight");
  expect(radios()[2].getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(radios()[2]);
  await key(radios()[2], "ArrowRight");
  expect(radios()[0].getAttribute("aria-checked")).toBe("true");
  await key(radios()[0], "End");
  expect(radios()[2].getAttribute("aria-checked")).toBe("true");
  await key(radios()[2], "ArrowLeft");
  expect(radios()[1].getAttribute("aria-checked")).toBe("true");
});
