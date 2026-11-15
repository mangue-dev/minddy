import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  CORE_TOOL_NAMES, MAX_TOOLS_PER_SEARCH, TOOL_FAMILIES, deferredToolsCatalog, loadedToolNames,
  matchDeferredTools, splitToolPool,
} = await import("./tool-loading");
const { NUMO_TOOL_NAMES } = await import("./tool-policy");
const { CONVERSATION_ASSISTANT_TOOLS } = await import("./tools");
const { ADMIN_ASSISTANT_TOOLS } = await import("./admin-tools");

/**
 * MIN-1001 — the turn sends its core tools and keeps the rest of its pool
 * behind search_tools. What matters: no tool is left without a way to be
 * found, the list only grows at its end, and nothing outside the pool loads.
 */

const POOL = [...CONVERSATION_ASSISTANT_TOOLS, ...ADMIN_ASSISTANT_TOOLS];
const names = (tools: { function: { name: string } }[]) => tools.map((tool) => tool.function.name);

describe("tool families", () => {
  it("names real tools, and every tool outside the core belongs to one family", () => {
    const known = new Set<string>(NUMO_TOOL_NAMES);
    for (const name of CORE_TOOL_NAMES) expect(known.has(name)).toBe(true);
    const familyTools = TOOL_FAMILIES.flatMap((family) => [...family.tools]);
    for (const name of familyTools) expect(known.has(name)).toBe(true);
    expect(new Set(familyTools).size).toBe(familyTools.length);
    for (const name of NUMO_TOOL_NAMES) {
      if (CORE_TOOL_NAMES.has(name)) continue;
      expect(familyTools, name).toContain(name);
    }
  });

  it("lists every deferred family in the catalog, administration included", () => {
    const { deferred } = splitToolPool(POOL, []);
    const catalog = deferredToolsCatalog(deferred);
    for (const family of TOOL_FAMILIES) expect(catalog).toContain(`- ${family.name}:`);
    expect(catalog).toContain("- Instance administration:");
    expect(catalog).not.toContain("- Other:");
    expect(deferredToolsCatalog([])).toBe("");
  });
});

describe("splitToolPool", () => {
  it("sends the core first, then loaded tools in load order", () => {
    const { active, deferred } = splitToolPool(POOL, ["update_routine", "create_page", "not_offered"]);
    const sent = names(active);
    expect(sent.slice(-2)).toEqual(["update_routine", "create_page"]);
    expect(sent).not.toContain("not_offered");
    expect(names(deferred)).not.toContain("create_page");
    expect(active.length + deferred.length).toBe(POOL.length);
  });

  it("defers nothing in a pool made of core tools", () => {
    const helpOnly = POOL.filter((tool) => tool.function.name === "get_help");
    expect(splitToolPool(helpOnly, [])).toEqual({ active: helpOnly, deferred: [] });
  });
});

describe("matchDeferredTools", () => {
  const { deferred } = splitToolPool(POOL, []);

  it("loads exact names first", () => {
    expect(names(matchDeferredTools("create_routine, merge_pull_request", deferred)).sort())
      .toEqual(["create_routine", "merge_pull_request"]);
  });

  it("loads a whole family by its name", () => {
    expect(names(matchDeferredTools("Routines", deferred)).sort())
      .toEqual(["create_routine", "list_routine_runs", "read_routine_occurrence", "update_routine"]);
  });

  it("matches keywords, bounded, and never outside the deferred tools", () => {
    const found = names(matchDeferredTools("merge pull request", deferred));
    expect(found).toContain("merge_pull_request");
    expect(found.length).toBeLessThanOrEqual(MAX_TOOLS_PER_SEARCH);
    expect(matchDeferredTools("create_issue", deferred)).toEqual([]);
    expect(matchDeferredTools("", deferred)).toEqual([]);
  });
});

describe("loadedToolNames", () => {
  it("reads search_tools loads and tools called, once each, in order", () => {
    expect(loadedToolNames([
      { tool_name: "search_tools", metadata: { success: true, loaded: ["create_routine", "update_routine"] } },
      { tool_name: "create_routine", metadata: { success: true } },
      { tool_name: "link_issues", metadata: { success: false } },
      { tool_name: null, metadata: null },
    ])).toEqual(["create_routine", "update_routine", "link_issues"]);
  });
});
