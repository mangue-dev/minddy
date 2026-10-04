import { expect, it } from "vitest";
import { createHomeTab } from "./app-tabs";
import { canConsumePrDeepLink } from "./pr-navigation";

const href = "/pull-requests?pr=123";
const prTab = { ...createHomeTab("owner", "pr-tab"), href };
const boardTab = { ...createHomeTab("owner", "board-tab"), href: "/projects/project" };

it("consumes a confirmed merge link only while its initiating tab still shows that PR", () => {
  expect(canConsumePrDeepLink(href, prTab.id, { activeId: prTab.id, tabs: [prTab, boardTab] }, href)).toBe(true);
  expect(canConsumePrDeepLink(href, prTab.id, { activeId: boardTab.id, tabs: [prTab, boardTab] }, boardTab.href)).toBe(false);
  expect(canConsumePrDeepLink(href, prTab.id, { activeId: prTab.id, tabs: [{ ...prTab, href: boardTab.href }] }, boardTab.href)).toBe(false);
  expect(canConsumePrDeepLink(href, prTab.id, { activeId: prTab.id, tabs: [{ ...prTab, href: "/pull-requests?pr=other" }] }, href)).toBe(false);
});

it("also respects leaving the page without an app tab session", () => {
  expect(canConsumePrDeepLink(href, null, undefined, href)).toBe(true);
  expect(canConsumePrDeepLink(href, null, undefined, boardTab.href)).toBe(false);
});
