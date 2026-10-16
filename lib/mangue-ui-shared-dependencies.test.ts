import { realpathSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/**
 * mangue-ui declares the libraries that Minddy also imports directly as peer
 * dependencies, so both resolve to one installed copy. A nested copy would
 * ship a second runtime in first-load JavaScript, and for stateful libraries it
 * breaks behavior: an `AnimatePresence` from one framer-motion copy does not
 * coordinate `motion` components from the other, and a second sonner copy has
 * its own toast store. If this fails, mangue-ui has turned one of them back
 * into a regular dependency with a range Minddy does not satisfy.
 */
const SHARED = [
  "framer-motion",
  "sonner",
  "cmdk",
  "@lobehub/icons/package.json",
  "@hugeicons/react",
  "@hugeicons/core-free-icons",
];

describe("mangue-ui shared dependencies", () => {
  const fromMangueUi = createRequire(require.resolve("mangue-ui/package.json"));

  it.each(SHARED)("resolves mangue-ui's %s to Minddy's copy", (specifier) => {
    expect(realpathSync(fromMangueUi.resolve(specifier))).toBe(
      realpathSync(require.resolve(specifier)),
    );
  });
});
