import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ASSISTANT_TOOLS, GLOBAL_ASSISTANT_TOOLS } from "./tools";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * The contract between a Numo TOOL and its LINE in the thread.
 *
 * Each tool call is displayed in the conversation by a line — an icon
 * and a phrase ("Code Agent started", "3 returns found"). This sentence
 * comes from `TOOL_META`, indexed by the NAME of the tool, and the absence of an entry does not break
 *: the component falls back to “Processing…” then “Done”.
 *
 * This is exactly what makes the omission invisible. Twelve tools had derived
 * so — launching the code broker, reading a pull request, promoting a return
 * were all showing "Processing...", while create category
 * was showing by name. Adding a tool and forgetting its line does not raise anything,
 * does not log anything, and is only seen on the screen.
 *
 * The test reads the SOURCE of the component rather than importing it: it is a module
 * client (JSX, lucid), and what we want to pin is a table of names, not a
 * rendered. Same gesture as lib/i18n-contract.test.ts, for the same reason — the
 * fault only exists BETWEEN two files.
 */

const DISPLAY = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "components",
  "assistant",
  "tool-call-display.tsx"
);

const source = readFileSync(DISPLAY, "utf8");
const metaBlock = source.slice(source.indexOf("const TOOL_META"));

/** The first level keys of TOOL_META (2 indentation spaces). */
const labelled = new Set(
  [...metaBlock.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => m[1])
);

/** The ToolCall namespace keys that these labels request from the catalog. */
const usedKeys = new Set(
  [...metaBlock.matchAll(/\bt\("([a-zA-Z0-9_]+)"/g)].map((m) => m[1])
);

/** The two modes: project mode and global mode, which adds its own
 tools (list_projects, list_global_filter_options). A missing line in
 either shows the same on the screen. */
const EVERY_TOOL = [
  ...new Set(
    [...ASSISTANT_TOOLS, ...GLOBAL_ASSISTANT_TOOLS].map((t) => t.function.name)
  ),
];

describe("each Numo tool has its line in the thread", () => {
  it.each(EVERY_TOOL)("%s a une entrée dans TOOL_META", (name) => {
    expect(labelled).toContain(name);
  });
});

describe("tool labels exist in BOTH catalogs", () => {
  const catalogs: [string, Record<string, unknown>][] = [
    ["en", en.ToolCall as Record<string, unknown>],
    ["fr", fr.ToolCall as Record<string, unknown>],
  ];

  it.each(catalogs)("%s porte toutes les clés utilisées", (_locale, catalog) => {
    const missing = [...usedKeys].filter((k) => !(k in catalog));
    expect(missing).toEqual([]);
  });
});
