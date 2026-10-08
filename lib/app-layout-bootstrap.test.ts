import { expect, it } from "vitest";
import { APP_LAYOUT_BOOTSTRAP } from "./app-layout-bootstrap.generated";
import { renderAppLayoutBootstrap } from "../scripts/build-app-layout.mjs";

it("ships a static bootstrap generated from the current runtime layout policy", async () => {
  expect(await renderAppLayoutBootstrap()).toBe(APP_LAYOUT_BOOTSTRAP);
});
