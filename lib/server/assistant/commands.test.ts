import { describe, expect, it } from "vitest";
import { commandNote, parseCommand } from "./commands";

describe("slash commands", () => {
  it("accepts the isolated-items command and gives its procedure (MIN-932)", () => {
    expect(parseCommand("find-isolated")).toBe("find-isolated");
    expect(commandNote({ command: "find-isolated" })).toContain("find_isolated_items");
    expect(parseCommand("drop-tables")).toBeUndefined();
    expect(commandNote({ command: "drop-tables" })).toBe("");
  });
});
