// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppTabRouteProvider, ProjectRouteReady, useAppTabRoute } from "./app-tab-route-context";
import { registerRecordIds, resetRefRegistry } from "./ref-registry";

const PROJECT = "7b8ef47d-0000-4000-8000-000000000001";
let root: Root;
let container: HTMLDivElement;

/** Throws like the pages that build URLs from the id, if rendered without one. */
function ProjectPage() {
  const { projectId } = useAppTabRoute();
  if (!projectId) throw new Error("rendered without a project id");
  return createElement("p", null, projectId);
}

const render = () => act(() => root.render(createElement(AppTabRouteProvider, {
  route: { pathname: "/projects/vrf-7b8ef47d/pages", search: "", projectSegment: "vrf-7b8ef47d" },
  children: createElement(ProjectRouteReady, { fallback: createElement("span", null, "loading"), children: createElement(ProjectPage) }),
})));

beforeEach(() => {
  resetRefRegistry();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  resetRefRegistry();
});

describe("a retained project page whose short code is not known yet", () => {
  it("waits behind its fallback, then renders once the project list teaches the code", async () => {
    await render();
    expect(container.textContent).toBe("loading");
    await act(() => registerRecordIds([{ id: PROJECT }]));
    expect(container.textContent).toBe(PROJECT);
  });
});
