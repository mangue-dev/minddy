import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "lib/server/mcp/tools.ts"),
  "utf8",
);

function registration(name: string, next: string): string {
  const start = source.indexOf(`server.registerTool(\n    "${name}"`);
  const end = source.indexOf(`server.registerTool(\n    "${next}"`, start + 1);
  return source.slice(start, end);
}

describe("MCP routine contract", () => {
  it("creates repository-optional Numo conversations", () => {
    const create = registration("minddy_create_routine", "minddy_update_routine");
    expect(create).toContain("private Numo conversation");
    expect(create).toContain("linked repository is not");
    expect(create).toContain("delegates to a code");
    expect(create).not.toContain("base_branch");
  });

  it("does not expose legacy code settings when updating routines", () => {
    const update = registration("minddy_update_routine", "minddy_delete_routine");
    expect(update).not.toContain("base_branch");
    expect(update).not.toContain("reasoning_level");
    expect(update).not.toContain("model:");
  });
});
