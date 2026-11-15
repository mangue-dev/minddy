import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withoutUuidPatterns } from "./json-schema-compact";

describe("withoutUuidPatterns (MIN-1001)", () => {
  it("drops the regex of uuid strings and keeps every other constraint", () => {
    const schema = withoutUuidPatterns(z.toJSONSchema(z.object({
      id: z.string().uuid(),
      ids: z.array(z.string().uuid()),
      color: z.string().regex(/^#[0-9a-f]{6}$/),
    })));
    const json = JSON.stringify(schema);
    expect(json).not.toContain("[1-8]");
    expect(json.match(/"format":"uuid"/g)).toHaveLength(2);
    expect(json).toContain("^#[0-9a-f]{6}$");
  });
});
