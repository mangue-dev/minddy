import { realpathSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/**
 * mangue-ui declares framer-motion as a regular dependency with its own range,
 * so the package manager can install a nested copy beside Minddy's. The shell
 * components then ship a second animation runtime in every route's first-load
 * JavaScript, and an `AnimatePresence` from one copy does not coordinate
 * `motion` components from the other. The `mangue-ui>framer-motion` overrides in
 * package.json keep both on Minddy's version.
 */
describe("framer-motion singleton", () => {
  it("resolves mangue-ui's framer-motion to Minddy's copy", () => {
    const fromMinddy = realpathSync(require.resolve("framer-motion"));
    const fromMangueUi = realpathSync(
      createRequire(require.resolve("mangue-ui/package.json")).resolve("framer-motion"),
    );

    expect(fromMangueUi).toBe(fromMinddy);
  });
});
